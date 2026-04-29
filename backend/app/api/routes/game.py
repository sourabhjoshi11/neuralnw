import random
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.game import AnonPlayer, GameRound, Room
from app.models.user import User
from app.schemas.game import (
    AnonPlayerOut,
    AnswerRequest,
    ChoiceRequest,
    CommentRequest,
    CreateRoomRequest,
    JoinRoomResponse,
    ReactionRequest,
    RoomOut,
    VoteRequest,
)
from app.services import game_engine
from app.services.username import generate_username, pick_color

router = APIRouter(prefix="/game", tags=["game"])


def _generate_code() -> str:
    return "".join(random.choices(string.digits, k=6))


@router.post("/rooms", response_model=JoinRoomResponse)
async def create_room(
    body: CreateRoomRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Generate unique code
    for _ in range(10):
        code = _generate_code()
        existing = await db.execute(select(Room).where(Room.code == code))
        if not existing.scalar_one_or_none():
            break

    room = Room(code=code, host_id=user.id, duration_minutes=body.duration_minutes)
    db.add(room)
    await db.flush()

    player = AnonPlayer(
        room_id=room.id,
        user_id=user.id,
        username=generate_username(),
        color=pick_color([]),
        join_order=1,
        lives=4 if user.is_premium else 1,
    )
    db.add(player)
    await db.commit()
    await db.refresh(room)
    await db.refresh(player)

    room_out = RoomOut(
        id=room.id,
        code=room.code,
        host_id=room.host_id,
        status=room.status,
        duration_minutes=room.duration_minutes,
        starts_at=room.starts_at,
        ends_at=room.ends_at,
        player_count=1,
        created_at=room.created_at,
    )
    return JoinRoomResponse(room=room_out, player=AnonPlayerOut.model_validate(player), players=[AnonPlayerOut.model_validate(player)])


@router.post("/rooms/{code}/join", response_model=JoinRoomResponse)
async def join_room(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Room).where(Room.code == code))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    if room.status == "ended":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Game has ended")

    existing_player = await db.execute(
        select(AnonPlayer).where(AnonPlayer.room_id == room.id, AnonPlayer.user_id == user.id)
    )
    if existing_player.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already in this room")

    players_result = await db.execute(
        select(AnonPlayer).where(AnonPlayer.room_id == room.id)
    )
    all_players = players_result.scalars().all()
    used_colors = [p.color for p in all_players]

    player = AnonPlayer(
        room_id=room.id,
        user_id=user.id,
        username=generate_username(),
        color=pick_color(used_colors),
        join_order=len(all_players) + 1,
        lives=4 if user.is_premium else 1,
    )
    db.add(player)
    await db.commit()
    await db.refresh(player)

    all_players_out = [AnonPlayerOut.model_validate(p) for p in all_players] + [AnonPlayerOut.model_validate(player)]
    player_count = len(all_players_out)
    room_out = RoomOut(
        id=room.id,
        code=room.code,
        host_id=room.host_id,
        status=room.status,
        duration_minutes=room.duration_minutes,
        starts_at=room.starts_at,
        ends_at=room.ends_at,
        player_count=player_count,
        created_at=room.created_at,
    )
    return JoinRoomResponse(room=room_out, player=AnonPlayerOut.model_validate(player), players=all_players_out)


@router.get("/rooms/{code}", response_model=JoinRoomResponse)
async def get_room(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Room).where(Room.code == code))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    players_result = await db.execute(select(AnonPlayer).where(AnonPlayer.room_id == room.id))
    all_players = players_result.scalars().all()

    my_player = next((p for p in all_players if p.user_id == user.id), None)
    if not my_player:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this room")

    player_count = len(all_players)
    room_out = RoomOut(
        id=room.id,
        code=room.code,
        host_id=room.host_id,
        status=room.status,
        duration_minutes=room.duration_minutes,
        starts_at=room.starts_at,
        ends_at=room.ends_at,
        player_count=player_count,
        created_at=room.created_at,
    )
    return JoinRoomResponse(
        room=room_out,
        player=AnonPlayerOut.model_validate(my_player),
        players=[AnonPlayerOut.model_validate(p) for p in all_players],
    )


# ─────────────────────────────────────────────────────────────────────────────
# Game action endpoints (host/player actions; WS is push-only)
# ─────────────────────────────────────────────────────────────────────────────

async def _get_room_or_404(code: str, db: AsyncSession) -> Room:
    r = await db.execute(select(Room).where(Room.code == code))
    room = r.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return room


async def _get_player_or_403(room_id: str, user_id: str, db: AsyncSession) -> AnonPlayer:
    r = await db.execute(
        select(AnonPlayer).where(AnonPlayer.room_id == room_id, AnonPlayer.user_id == user_id)
    )
    player = r.scalar_one_or_none()
    if not player:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this room")
    return player


async def _get_round_or_404(round_id: str, db: AsyncSession) -> GameRound:
    r = await db.execute(select(GameRound).where(GameRound.id == round_id))
    round_ = r.scalar_one_or_none()
    if not round_:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    return round_


@router.post("/rooms/{code}/start", status_code=status.HTTP_204_NO_CONTENT)
async def start_game(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    room = await _get_room_or_404(code, db)
    if room.host_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can start the game")
    try:
        await game_engine.start_game(code, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/rounds/{round_id}/choice", status_code=status.HTTP_204_NO_CONTENT)
async def submit_choice(
    round_id: str,
    body: ChoiceRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    round_ = await _get_round_or_404(round_id, db)
    player = await _get_player_or_403(round_.room_id, user.id, db)
    if round_.player_id != player.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your turn")

    r = await db.execute(select(Room).where(Room.id == round_.room_id))
    room = r.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    try:
        await game_engine.submit_choice(room.code, round_id, body.choice, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/rounds/{round_id}/answer", status_code=status.HTTP_204_NO_CONTENT)
async def submit_answer(
    round_id: str,
    body: AnswerRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    round_ = await _get_round_or_404(round_id, db)
    player = await _get_player_or_403(round_.room_id, user.id, db)
    if round_.player_id != player.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your turn")

    r = await db.execute(select(Room).where(Room.id == round_.room_id))
    room = r.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    try:
        await game_engine.submit_answer(room.code, round_id, body.answer, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/rounds/{round_id}/vote", status_code=status.HTTP_204_NO_CONTENT)
async def cast_vote(
    round_id: str,
    body: VoteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    round_ = await _get_round_or_404(round_id, db)
    player = await _get_player_or_403(round_.room_id, user.id, db)

    r = await db.execute(select(Room).where(Room.id == round_.room_id))
    room = r.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    try:
        await game_engine.cast_vote(room.code, round_id, player.id, body.value, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/rounds/{round_id}/react", status_code=status.HTTP_204_NO_CONTENT)
async def add_reaction(
    round_id: str,
    body: ReactionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    round_ = await _get_round_or_404(round_id, db)
    player = await _get_player_or_403(round_.room_id, user.id, db)

    r = await db.execute(select(Room).where(Room.id == round_.room_id))
    room = r.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    await game_engine.add_reaction(room.code, round_id, player.id, body.emoji, db)


@router.post("/rounds/{round_id}/comment", status_code=status.HTTP_204_NO_CONTENT)
async def add_comment(
    round_id: str,
    body: CommentRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    round_ = await _get_round_or_404(round_id, db)
    player = await _get_player_or_403(round_.room_id, user.id, db)

    r = await db.execute(select(Room).where(Room.id == round_.room_id))
    room = r.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    try:
        await game_engine.add_comment(room.code, round_id, player.id, body.text, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/rooms/{code}/skip", status_code=status.HTTP_204_NO_CONTENT)
async def skip_turn(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    room = await _get_room_or_404(code, db)
    player = await _get_player_or_403(room.id, user.id, db)

    if room.current_turn_player_id != player.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your turn")

    try:
        await game_engine.handle_skip(code, player.id, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/rooms/{code}/state")
async def get_room_state(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    room = await _get_room_or_404(code, db)
    await _get_player_or_403(room.id, user.id, db)
    return await game_engine.get_room_state(code, db)
