import random
import string

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.scribble import ScribbleRoom, ScribblePlayer
from app.models.user import User
from app.services.username import generate_username

router = APIRouter(prefix="/scribble", tags=["scribble"])


def _gen_code() -> str:
    return "".join(random.choices(string.digits, k=6))


class CreateRoomRequest(BaseModel):
    category: str = "mixed"
    sabotage_mode: bool = True
    total_rounds: int = 5


class JoinRoomResponse(BaseModel):
    room_code: str
    player_id: str
    username: str


@router.post("/rooms", status_code=201)
async def create_room(
    body: CreateRoomRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    code = _gen_code()
    for _ in range(10):
        existing = await db.execute(select(ScribbleRoom).where(ScribbleRoom.code == code))
        if not existing.scalar_one_or_none():
            break
        code = _gen_code()

    room = ScribbleRoom(
        code=code,
        host_id=user.id,
        category=body.category,
        sabotage_mode=body.sabotage_mode,
        total_rounds=min(body.total_rounds, 10),
    )
    db.add(room)
    await db.flush()

    username = generate_username()
    player = ScribblePlayer(room_id=room.id, user_id=user.id, username=username, draw_order=0)
    db.add(player)
    await db.commit()
    await db.refresh(room)
    await db.refresh(player)

    return {"code": room.code, "room_id": room.id, "player_id": player.id, "username": username}


@router.post("/rooms/{code}/join")
async def join_room(
    code: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ScribbleRoom).where(ScribbleRoom.code == code))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.status != "lobby":
        raise HTTPException(status_code=400, detail="Game already started")

    # Check if already joined
    existing = await db.execute(
        select(ScribblePlayer).where(ScribblePlayer.room_id == room.id, ScribblePlayer.user_id == user.id)
    )
    player = existing.scalar_one_or_none()
    if player:
        return {"code": room.code, "room_id": room.id, "player_id": player.id, "username": player.username}

    # Count players
    count_result = await db.execute(select(ScribblePlayer).where(ScribblePlayer.room_id == room.id))
    count = len(count_result.scalars().all())
    if count >= room.max_players:
        raise HTTPException(status_code=400, detail="Room is full")

    username = generate_username()
    player = ScribblePlayer(room_id=room.id, user_id=user.id, username=username, draw_order=count)
    db.add(player)
    await db.commit()
    await db.refresh(player)

    return {"code": room.code, "room_id": room.id, "player_id": player.id, "username": username}


@router.get("/rooms/{code}")
async def get_room(
    code: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ScribbleRoom).where(ScribbleRoom.code == code))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    players_result = await db.execute(select(ScribblePlayer).where(ScribblePlayer.room_id == room.id))
    players = players_result.scalars().all()

    return {
        "code": room.code,
        "status": room.status,
        "phase": room.phase,
        "category": room.category,
        "sabotage_mode": room.sabotage_mode,
        "total_rounds": room.total_rounds,
        "current_round": room.current_round,
        "current_drawer_id": room.current_drawer_id,
        "is_blind_round": room.is_blind_round,
        "host_id": room.host_id,
        "players": [
            {"id": p.id, "username": p.username, "score": p.score, "user_id": p.user_id, "is_connected": p.is_connected}
            for p in players
        ],
    }
