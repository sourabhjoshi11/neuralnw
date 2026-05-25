"""
Harami-Shurta — API routes.
Classic social-deduction party game with Arabic names.
Roles: Malik (King) | Wazir (Minister) | Shurta (Police) | Harami (Thief)
Wazir must identify who is Harami (and Shurta). Harami wins if not caught.

Scoring:
- Malik: Always 1000 pts
- If Wazir correct: Wazir 500, Shurta 300, Harami 0
- If Wazir wrong: Harami 500, Shurta 300, Wazir 0
"""
import asyncio
import random
import string
from pathlib import Path
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.chor_sipahi import CSRoom, CSPlayer, CSRound
from app.models.user import User
from app.services.room_manager import RoomConnectionManager
from app.services.username import generate_username, pick_color

router = APIRouter(prefix="/cs", tags=["chor-sipahi"])
DEBUG_LOG = Path("cs_debug.log")


def _cs_log(message: str) -> None:
    print(message, flush=True)
    try:
        DEBUG_LOG.write_text(
            (DEBUG_LOG.read_text(encoding="utf-8") if DEBUG_LOG.exists() else "") + message + "\n",
            encoding="utf-8",
        )
    except Exception:
        pass

# Separate WS manager for Chor Sipahi rooms
cs_manager = RoomConnectionManager()

# Mode timings (seconds)
MODE_TIMINGS = {
    "quick":   {"discussion": 30, "guessing": 15, "result": 8},
    "classic": {"discussion": 60, "guessing": 20, "result": 10},
    "party":   {"discussion": 90, "guessing": 25, "result": 12},
}

SCORING = {
    "malik":   1000,
    "wazir": {"correct": 500, "wrong": 0},
    "shurta": 300,  # Always gets 300
    "harami":   {"caught": 0, "free": 500},
}

ROLE_EMOJIS = {"malik": "👑", "wazir": "🧾", "shurta": "👮", "harami": "🕵️"}


def _gen_code() -> str:
    return "".join(random.choices(string.digits, k=6))


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _phase_end_iso(seconds: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


async def _get_room(code: str, db: AsyncSession) -> CSRoom:
    r = await db.execute(select(CSRoom).where(CSRoom.code == code))
    room = r.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


async def _get_player(room_id: str, user_id: str, db: AsyncSession) -> CSPlayer:
    r = await db.execute(
        select(CSPlayer).where(CSPlayer.room_id == room_id, CSPlayer.user_id == user_id)
    )
    p = r.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=403, detail="Not in this room")
    return p


def _safe_players(players: list[CSPlayer], viewer_user_id: str, reveal_all: bool = False) -> list[dict]:
    """Return player list — only include role for the viewer themselves."""
    out = []
    for p in players:
        d = {
            "id": p.id,
            "userId": p.user_id,
            "username": p.username,
            "color": p.color,
            "points": p.points,
            "joinOrder": p.join_order,
            "isBot": p.is_bot,
            # Raja and Mantri are public; Sipahi/Chor stay hidden until result.
            "role": p.role if (reveal_all or p.user_id == viewer_user_id or p.role in {"raja", "mantri"}) else None,
        }
        out.append(d)
    return out


async def _broadcast_state(room: CSRoom, players: list[CSPlayer], db: AsyncSession, round_data: dict | None = None) -> None:
    """Broadcast current room state to all connected players."""
    for p in players:
        if p.is_bot:
            continue
        payload = {
            "type": "state_sync",
            "data": {
                "roomCode": room.code,
                "status": room.status,
                "phase": room.phase,
                "currentRound": room.current_round,
                "phaseEndsAt": room.phase_ends_at,
                "players": _safe_players(players, p.user_id),
                "round": round_data,
            },
        }
        await cs_manager.send_to(room.code, p.id, payload)


async def _assign_roles(room: CSRoom, players: list[CSPlayer], db: AsyncSession) -> CSRound:
    """Randomly assign roles for a new round. Rotates so everyone gets turns."""
    base_roles = ["raja", "mantri", "chor"] if len(players) == 3 else ["raja", "mantri", "sipahi", "chor"]
    # If fewer players, skip some roles (minimum 3 needed)
    active = [p for p in players]
    n = len(active)
    if n < 4:
        raise ValueError("Need at least 4 players")

    # Rotate starting position each round so roles rotate
    offset = (room.current_round - 1) % n
    shuffled = active[offset:] + active[:offset]
    random.shuffle(shuffled)

    assigned: dict[str, str] = {}  # role -> player_id
    role_map: dict[str, str] = {}  # player_id -> role

    for i, player in enumerate(shuffled):
        role = base_roles[i] if i < len(base_roles) else "sipahi"
        player.role = role
        assigned[role] = player.id
        role_map[player.id] = role
        await db.merge(player)

    round_ = CSRound(
        room_id=room.id,
        round_number=room.current_round,
        raja_id=assigned.get("raja"),
        mantri_id=assigned.get("mantri"),
        sipahi_id=assigned.get("sipahi"),
        chor_id=assigned.get("chor"),
    )
    db.add(round_)
    await db.flush()
    return round_


async def _run_phase_timer(room_code: str, phase: str, seconds: int, db_factory) -> None:
    """Background task: wait then auto-advance phase."""
    await asyncio.sleep(seconds)
    async with db_factory() as db:
        r = await db.execute(select(CSRoom).where(CSRoom.code == room_code))
        room = r.scalar_one_or_none()
        if not room or room.phase != phase:
            return  # Already advanced manually
        if phase == "discussion":
            await _advance_to_guessing(room, db)
        elif phase == "guessing":
            await _advance_to_result(room, db, timed_out=True)
        elif phase == "result":
            await _start_next_round(room, db)


async def _advance_to_discussion(room: CSRoom, players: list[CSPlayer], round_: CSRound, db: AsyncSession) -> None:
    timings = MODE_TIMINGS[room.mode]
    room.phase = "discussion"
    room.phase_ends_at = _phase_end_iso(timings["discussion"])
    await db.commit()
    await _broadcast_state(room, players, db, _round_public(round_))
    from app.db.base import AsyncSessionLocal
    asyncio.create_task(_run_phase_timer(room.code, "discussion", timings["discussion"], AsyncSessionLocal))


async def _advance_to_guessing(room: CSRoom, db: AsyncSession) -> None:
    timings = MODE_TIMINGS[room.mode]
    room.phase = "guessing"
    room.phase_ends_at = _phase_end_iso(timings["guessing"])
    await db.commit()
    players_r = await db.execute(select(CSPlayer).where(CSPlayer.room_id == room.id))
    players = list(players_r.scalars().all())
    round_r = await db.execute(
        select(CSRound).where(CSRound.room_id == room.id, CSRound.round_number == room.current_round)
    )
    round_ = round_r.scalar_one_or_none()
    await _broadcast_state(room, players, db, _round_public(round_) if round_ else None)
    from app.db.base import AsyncSessionLocal
    asyncio.create_task(_run_phase_timer(room.code, "guessing", timings["guessing"], AsyncSessionLocal))


async def _advance_to_result(room: CSRoom, db: AsyncSession, timed_out: bool = False) -> None:
    timings = MODE_TIMINGS[room.mode]
    players_r = await db.execute(select(CSPlayer).where(CSPlayer.room_id == room.id))
    players = list(players_r.scalars().all())
    round_r = await db.execute(
        select(CSRound).where(CSRound.room_id == room.id, CSRound.round_number == room.current_round)
    )
    round_ = round_r.scalar_one_or_none()
    if not round_:
        return

    # If timed out and no guess, Chor wins
    if timed_out and not round_.guess_chor_id:
        round_.guess_chor_id = "none"

    chor_caught = round_.guess_chor_id == round_.chor_id
    round_.chor_caught = chor_caught

    pid_map = {p.id: p for p in players}
    points: dict[str, int] = {}

    for p in players:
        role = p.role or ""
        if role == "raja":
            pts = SCORING["raja"]
        elif role == "mantri":
            pts = SCORING["mantri"]["correct"] if chor_caught else SCORING["mantri"]["wrong"]
        elif role == "sipahi":
            pts = SCORING["sipahi"]["chor_caught"] if chor_caught else SCORING["sipahi"]["chor_free"]
        elif role == "chor":
            pts = SCORING["chor"]["caught"] if chor_caught else SCORING["chor"]["free"]
        else:
            pts = 0
        p.points += pts
        points[p.id] = pts

    round_.points_awarded = points
    room.phase = "result"
    room.phase_ends_at = _phase_end_iso(timings["result"])
    await db.commit()

    # Broadcast FULL round data (roles revealed) for result screen
    await _broadcast_full_result(room, players, round_)
    from app.db.base import AsyncSessionLocal
    asyncio.create_task(_run_phase_timer(room.code, "result", timings["result"], AsyncSessionLocal))


async def _start_next_round(room: CSRoom, db: AsyncSession) -> None:
    players_r = await db.execute(select(CSPlayer).where(CSPlayer.room_id == room.id))
    players = list(players_r.scalars().all())
    room.current_round += 1
    room.phase = "role_reveal"
    room.phase_ends_at = _phase_end_iso(5)
    try:
        round_ = await _assign_roles(room, players, db)
        await db.commit()
        await _broadcast_state(room, players, db, _round_public(round_))
        from app.db.base import AsyncSessionLocal
        asyncio.create_task(_run_phase_timer(room.code, "role_reveal", 5, AsyncSessionLocal))
        # After role_reveal timer: advance to discussion
        async def _after_reveal():
            await asyncio.sleep(5)
            async with AsyncSessionLocal() as db2:
                r2 = await db2.execute(select(CSRoom).where(CSRoom.code == room.code))
                room2 = r2.scalar_one_or_none()
                if room2 and room2.phase == "role_reveal":
                    pl_r = await db2.execute(select(CSPlayer).where(CSPlayer.room_id == room2.id))
                    pl = list(pl_r.scalars().all())
                    rnd_r = await db2.execute(
                        select(CSRound).where(CSRound.room_id == room2.id, CSRound.round_number == room2.current_round)
                    )
                    rnd = rnd_r.scalar_one_or_none()
                    if rnd:
                        await _advance_to_discussion(room2, pl, rnd, db2)
        asyncio.create_task(_after_reveal())
    except ValueError:
        room.status = "finished"
        room.phase = "finished"
        await db.commit()


def _round_public(round_: CSRound | None) -> dict | None:
    if not round_:
        return None
    return {
        "id": round_.id,
        "roundNumber": round_.round_number,
        "rajaId": round_.raja_id,
        # Only public info: Raja is always known
        "mantriId": round_.mantri_id,
        "sipahiId": None,
        "chorId": None,
        "guessChorId": round_.guess_chor_id,
        "guessSipahiId": round_.guess_sipahi_id,
        "chorCaught": round_.chor_caught,
        "pointsAwarded": round_.points_awarded,
    }


def _round_revealed(round_: CSRound | None) -> dict | None:
    if not round_:
        return None
    return {
        "id": round_.id,
        "roundNumber": round_.round_number,
        "rajaId": round_.raja_id,
        "mantriId": round_.mantri_id,
        "sipahiId": round_.sipahi_id,
        "chorId": round_.chor_id,
        "guessChorId": round_.guess_chor_id,
        "guessSipahiId": round_.guess_sipahi_id,
        "chorCaught": round_.chor_caught,
        "pointsAwarded": round_.points_awarded,
    }


async def _broadcast_full_result(room: CSRoom, players: list[CSPlayer], round_: CSRound) -> None:
    """Broadcast result with all roles revealed."""
    for p in players:
        if p.is_bot:
            continue
        payload = {
            "type": "state_sync",
            "data": {
                "roomCode": room.code,
                "status": room.status,
                "phase": "result",
                "currentRound": room.current_round,
                "phaseEndsAt": room.phase_ends_at,
                "players": [
                    {
                        "id": pl.id,
                        "userId": pl.user_id,
                        "username": pl.username,
                        "color": pl.color,
                        "points": pl.points,
                        "joinOrder": pl.join_order,
                        "isBot": pl.is_bot,
                        "role": pl.role,  # All roles revealed at result
                    }
                    for pl in players
                ],
                "round": {
                    "id": round_.id,
                    "roundNumber": round_.round_number,
                    "rajaId": round_.raja_id,
                    "mantriId": round_.mantri_id,
                    "sipahiId": round_.sipahi_id,
                    "chorId": round_.chor_id,
                    "guessChorId": round_.guess_chor_id,
                    "guessSipahiId": round_.guess_sipahi_id,
                    "chorCaught": round_.chor_caught,
                    "pointsAwarded": round_.points_awarded,
                },
            },
        }
        await cs_manager.send_to(room.code, p.id, payload)


# ─── Pydantic models ──────────────────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
    mode: str = "quick"
    max_players: int = 6


class GuessRequest(BaseModel):
    guess_chor_id: str
    guess_sipahi_id: str


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/rooms")
async def create_room(
    body: CreateRoomRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _cs_log(f"[CS create] request user={getattr(user, 'id', None)} mode={body.mode} max_players={body.max_players}")
    try:
        if body.mode not in MODE_TIMINGS:
            raise HTTPException(status_code=400, detail="Invalid mode")
        code = _gen_code()
        for _ in range(10):
            code = _gen_code()
            existing = await db.execute(select(CSRoom).where(CSRoom.code == code))
            if not existing.scalar_one_or_none():
                break

        room = CSRoom(code=code, host_id=user.id, mode=body.mode, max_players=body.max_players)
        db.add(room)
        _cs_log(f"[CS create] room add code={code}")
        await db.flush()
        _cs_log(f"[CS create] room flushed id={room.id}")

        player = CSPlayer(
            room_id=room.id,
            user_id=user.id,
            username=generate_username(),
            color=pick_color([]),
            join_order=1,
        )
        db.add(player)
        _cs_log("[CS create] player add")
        await db.commit()
        _cs_log("[CS create] committed")
        await db.refresh(room)

        return {"code": room.code, "mode": room.mode, "maxPlayers": room.max_players, "playerId": player.id}
    except HTTPException:
        raise
    except Exception as exc:
        _cs_log(f"[CS create] failed: {type(exc).__name__}: {exc}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Create CS room failed: {exc}")


@router.post("/rooms/{code}/join")
async def join_room(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    room = await _get_room(code, db)
    if room.status != "waiting":
        raise HTTPException(status_code=400, detail="Game already started")

    players_r = await db.execute(select(CSPlayer).where(CSPlayer.room_id == room.id))
    players = list(players_r.scalars().all())

    existing = next((p for p in players if p.user_id == user.id), None)
    if existing:
        return {
            "code": room.code, "mode": room.mode,
            "playerId": existing.id,
            "players": _safe_players(players, user.id),
        }

    if len(players) >= room.max_players:
        raise HTTPException(status_code=400, detail="Room is full")

    used_colors = [p.color for p in players]
    used_names = {p.username for p in players}
    player = CSPlayer(
        room_id=room.id, user_id=user.id,
        username=generate_username(exclude=used_names),
        color=pick_color(used_colors),
        join_order=len(players) + 1,
    )
    db.add(player)
    await db.commit()
    players.append(player)

    await _broadcast_state(room, players, db)

    return {
        "code": room.code, "mode": room.mode,
        "playerId": player.id,
        "players": _safe_players(players, user.id),
    }


@router.get("/rooms/{code}")
async def get_room(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    room = await _get_room(code, db)
    player = await _get_player(room.id, user.id, db)
    players_r = await db.execute(select(CSPlayer).where(CSPlayer.room_id == room.id))
    players = list(players_r.scalars().all())

    round_data = None
    if room.current_round > 0:
        rnd_r = await db.execute(
            select(CSRound).where(CSRound.room_id == room.id, CSRound.round_number == room.current_round)
        )
        rnd = rnd_r.scalar_one_or_none()
        round_data = _round_revealed(rnd) if (rnd and room.phase == "result") else (_round_public(rnd) if rnd else None)

    return {
        "code": room.code,
        "status": room.status,
        "phase": room.phase,
        "mode": room.mode,
        "currentRound": room.current_round,
        "phaseEndsAt": room.phase_ends_at,
        "isHost": room.host_id == user.id,
        "myPlayerId": player.id,
        "players": _safe_players(players, user.id, reveal_all=room.phase == "result"),
        "round": round_data,
    }


@router.post("/rooms/{code}/start")
async def start_game(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    room = await _get_room(code, db)
    if room.host_id != user.id:
        raise HTTPException(status_code=403, detail="Only host can start")
    if room.status != "waiting":
        raise HTTPException(status_code=400, detail="Already started")

    players_r = await db.execute(select(CSPlayer).where(CSPlayer.room_id == room.id))
    players = list(players_r.scalars().all())
    if len(players) < 4:
        raise HTTPException(status_code=400, detail="Need at least 4 players")

    room.status = "playing"
    room.current_round = 1
    room.phase = "role_reveal"
    room.phase_ends_at = _phase_end_iso(5)

    round_ = await _assign_roles(room, players, db)
    await db.commit()

    await _broadcast_state(room, players, db, _round_public(round_))

    # After role reveal, auto-advance to discussion
    from app.db.base import AsyncSessionLocal
    async def _after_reveal():
        await asyncio.sleep(5)
        async with AsyncSessionLocal() as db2:
            r2 = await db2.execute(select(CSRoom).where(CSRoom.code == code))
            room2 = r2.scalar_one_or_none()
            if room2 and room2.phase == "role_reveal":
                pl_r = await db2.execute(select(CSPlayer).where(CSPlayer.room_id == room2.id))
                pl = list(pl_r.scalars().all())
                rnd_r = await db2.execute(
                    select(CSRound).where(CSRound.room_id == room2.id, CSRound.round_number == room2.current_round)
                )
                rnd = rnd_r.scalar_one_or_none()
                if rnd:
                    await _advance_to_discussion(room2, pl, rnd, db2)
    asyncio.create_task(_after_reveal())

    return {"ok": True}


@router.post("/rooms/{code}/guess")
async def submit_guess(
    code: str,
    body: GuessRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    room = await _get_room(code, db)
    if room.phase != "guessing":
        raise HTTPException(status_code=400, detail="Not in guessing phase")

    player = await _get_player(room.id, user.id, db)
    rnd_r = await db.execute(
        select(CSRound).where(CSRound.room_id == room.id, CSRound.round_number == room.current_round)
    )
    round_ = rnd_r.scalar_one_or_none()
    if not round_:
        raise HTTPException(status_code=404, detail="Round not found")
    if round_.mantri_id != player.id:
        raise HTTPException(status_code=403, detail="Only Mantri can guess")
    if round_.guess_chor_id:
        raise HTTPException(status_code=400, detail="Already guessed")
    valid_unknown = {round_.chor_id, round_.sipahi_id}
    if (
        body.guess_chor_id == body.guess_sipahi_id
        or body.guess_chor_id not in valid_unknown
        or body.guess_sipahi_id not in valid_unknown
    ):
        raise HTTPException(status_code=400, detail="Guess must assign Chor and Sipahi from the two hidden players")

    round_.guess_chor_id = body.guess_chor_id
    round_.guess_sipahi_id = body.guess_sipahi_id
    await db.flush()
    await _advance_to_result(room, db)

    return {"ok": True}


@router.post("/rooms/{code}/next-round")
async def next_round(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    room = await _get_room(code, db)
    if room.host_id != user.id:
        raise HTTPException(status_code=403, detail="Only host can advance")
    if room.phase != "result":
        raise HTTPException(status_code=400, detail="Not in result phase")
    await _start_next_round(room, db)
    return {"ok": True}
