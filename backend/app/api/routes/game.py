import random
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.game import AnonPlayer, Room
from app.models.user import User
from app.schemas.game import AnonPlayerOut, CreateRoomRequest, JoinRoomResponse, RoomOut
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
