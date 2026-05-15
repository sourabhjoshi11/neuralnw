"""
Game state machine for ClassChaos Spin-the-Bottle.

All state mutations happen here. Every public method:
  1. Updates the database
  2. Broadcasts the new state via WebSocket
  3. Schedules the next phase timer if needed

Architecture: HTTP action endpoints call into this engine.
WebSocket is push-only (server → client).
"""
import logging
import math
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game import AnonPlayer, Comment, GameRound, Reaction, Room, TruthOrDare, Vote
from app.services.phase_timer import PHASE_DURATIONS, phase_timer
from app.services.probability import select_next_player
from app.services.room_manager import room_manager
from app.services.username import generate_username, pick_color

logger = logging.getLogger(__name__)

# In-memory ready-vote tracker: "room_code:round_id" → set of player_ids
_ready_votes: dict[str, set[str]] = {}

# Custom vote: "room_code:round_id" → {"yes": set[player_id], "no": set[player_id]}
_custom_vote: dict[str, dict] = {}

# Suggestion phase: "room_code:round_id" → player_id randomly selected to suggest
_suggestion_player: dict[str, str] = {}

# Suggestion content: "room_code:round_id" → submitted text (None = not yet submitted)
# "content:round_id" → text kept for reconnect after content_shown
_suggestion_content: dict[str, str | None] = {}

# Punishment votes: room_code → {player_id: 'a'|'b'}
_punishment_votes: dict[str, dict[str, str]] = {}

WHEEL_COLORS = ["#3b82f6", "#06b6d4", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b"]

BLACKOUT_DURATIONS = {1: 2 * 60, 2: 7 * 60, 3: 12 * 60}  # seconds per skip number

ROAST_MESSAGES = [
    "Someone couldn't handle the heat 😂",
    "Skill issue detected 💀",
    "Touch grass first, then come back 🌿",
    "The skip has been noted. Judgement incoming 👀",
    "Scared? It's just a game 🐔",
    "The class has seen everything 😭",
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _player_dict(p: AnonPlayer) -> dict[str, Any]:
    return {
        "id": p.id,
        "un": p.username,
        "color": p.color,
        "pts": p.points,
        "lives": p.lives,
        "skips": p.skips_used,
        "blacked_out": p.is_blacked_out,
        "blackout_ends_at": p.blackout_ends_at.isoformat() if p.blackout_ends_at else None,
        "turn_count": p.turn_count,
        "join_order": p.join_order,
    }


def _content_dict(c: TruthOrDare) -> dict[str, Any]:
    return {"id": c.id, "type": c.type, "content": c.content, "pts": c.points}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _get_room(code: str, db: AsyncSession) -> Room:
    r = await db.execute(select(Room).where(Room.code == code))
    room = r.scalar_one_or_none()
    if not room:
        raise ValueError(f"Room {code} not found")
    return room


async def _get_active_players(room_id: str, db: AsyncSession) -> list[AnonPlayer]:
    r = await db.execute(
        select(AnonPlayer).where(
            AnonPlayer.room_id == room_id,
            AnonPlayer.is_banned == False,
        )
    )
    return list(r.scalars().all())


async def _get_current_round(room_id: str, db: AsyncSession) -> GameRound | None:
    r = await db.execute(
        select(GameRound)
        .where(GameRound.room_id == room_id, GameRound.phase != "done")
        .order_by(GameRound.created_at.desc())
        .limit(1)
    )
    return r.scalar_one_or_none()


async def _random_content(choice: str, db: AsyncSession) -> TruthOrDare | None:
    r = await db.execute(
        select(TruthOrDare)
        .where(TruthOrDare.type == choice, TruthOrDare.is_active == True)
        .order_by(func.random())
        .limit(1)
    )
    return r.scalar_one_or_none()


def _shuffle_colors(players: list[AnonPlayer]) -> dict[str, str]:
    """Reassign wheel colors randomly to all active players."""
    colors = WHEEL_COLORS.copy()
    random.shuffle(colors)
    color_map: dict[str, str] = {}
    for i, p in enumerate(players):
        new_color = colors[i % len(colors)]
        p.color = new_color
        color_map[p.id] = new_color
    return color_map


# ─────────────────────────────────────────────────────────────────────────────
# Phase transition helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _set_phase(
    room: Room,
    phase: str,
    db: AsyncSession,
    duration: float | None = None,
) -> datetime | None:
    """Update room.current_phase and return phase_ends_at if duration given."""
    room.current_phase = phase
    ends_at = None
    if duration is not None:
        ends_at = _now() + timedelta(seconds=duration)
    return ends_at


async def _advance_to_reaction(room: Room, round_: GameRound, db: AsyncSession) -> None:
    dur = PHASE_DURATIONS["reaction"]
    ends_at = await _set_phase(room, "reaction", db, dur)
    round_.phase = "reaction"
    round_.phase_ends_at = ends_at
    await db.commit()

    await room_manager.broadcast(room.code, {
        "type": "phase_change",
        "data": {"phase": "reaction", "ends_at": ends_at.isoformat() if ends_at else None},
    })
    phase_timer.schedule(room.code, dur, lambda: _on_reaction_end(room.code))


async def _on_reaction_end(room_code: str) -> None:
    from app.db.base import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            room = await _get_room(room_code, db)
            if room.status != "active":
                return
            await _finish_round(room, db)
        except Exception:
            logger.exception("Error in reaction end for room %s", room_code)


async def _finish_round(room: Room, db: AsyncSession) -> None:
    """Mark current round done, shuffle colors, schedule next spin (or end game)."""
    round_ = await _get_current_round(room.id, db)
    if round_:
        round_.phase = "done"
        # Clean up all in-memory state for this round
        key = f"{room.code}:{round_.id}"
        _custom_vote.pop(key, None)
        _suggestion_player.pop(key, None)
        _suggestion_content.pop(key, None)
        _suggestion_content.pop(f"content:{round_.id}", None)
        _ready_votes.pop(key, None)

    # Clean up punishment votes for this room
    _punishment_votes.pop(room.code, None)

    # Check if overall game timer has expired — end instead of spinning again
    if room.ends_at and _now() >= room.ends_at:
        await end_game(room.code, db)
        return

    players = await _get_active_players(room.id, db)
    color_map = _shuffle_colors(players)
    await _set_phase(room, "spinning", db)
    await db.commit()

    await room_manager.broadcast(room.code, {
        "type": "player_colors_shuffle",
        "data": {"color_map": color_map},
    })
    # Small pause before next spin
    phase_timer.schedule(room.code, 2.0, lambda: _auto_spin(room.code))


async def submit_ready(room_code: str, round_id: str, player_id: str, db: AsyncSession) -> None:
    """Player marks themselves ready to move to next turn (skips reaction timer)."""
    key = f"{room_code}:{round_id}"
    if key not in _ready_votes:
        _ready_votes[key] = set()
    _ready_votes[key].add(player_id)

    players = await _get_active_players(
        (await db.execute(select(Room.id).where(Room.code == room_code))).scalar_one(), db
    )
    total = max(len(players), 1)
    ready_count = len(_ready_votes[key])
    threshold = math.ceil(total / 2)  # simple majority

    await room_manager.broadcast(room_code, {
        "type": "ready_update",
        "data": {
            "round_id": round_id,
            "ready_count": ready_count,
            "total": total,
            "threshold": threshold,
        },
    })

    if ready_count >= threshold:
        _ready_votes.pop(key, None)
        room = await _get_room(room_code, db)
        if room.current_phase == "reaction" and room.status == "active":
            phase_timer.cancel(room_code)
            await _finish_round(room, db)


async def submit_custom_vote(
    room_code: str,
    round_id: str,
    player_id: str,
    value: str,
    db: AsyncSession,
) -> None:
    """Non-turn player votes yes/no for a custom question this round."""
    key = f"{room_code}:{round_id}"
    if key not in _custom_vote:
        _custom_vote[key] = {"yes": set(), "no": set()}

    # Idempotent — remove previous vote first
    _custom_vote[key]["yes"].discard(player_id)
    _custom_vote[key]["no"].discard(player_id)
    _custom_vote[key]["yes" if value == "yes" else "no"].add(player_id)

    r = await db.execute(select(GameRound).where(GameRound.id == round_id))
    round_ = r.scalar_one_or_none()
    if not round_ or round_.phase != "custom_vote":
        return

    room_id_row = await db.execute(select(Room.id).where(Room.code == room_code))
    room_id = room_id_row.scalar_one()
    all_players = await _get_active_players(room_id, db)
    eligible = [p for p in all_players if p.id != round_.player_id]
    total = max(len(eligible), 1)
    yes_count = len(_custom_vote[key]["yes"])
    no_count = len(_custom_vote[key]["no"])
    threshold = math.ceil(total / 2)

    await room_manager.broadcast(room_code, {
        "type": "custom_vote_update",
        "data": {
            "round_id": round_id,
            "yes": yes_count,
            "no": no_count,
            "total": total,
            "threshold": threshold,
        },
    })

    # Majority YES reached → start suggestion phase immediately
    if yes_count >= threshold:
        _custom_vote.pop(key, None)
        phase_timer.cancel(room_code)
        await _start_suggestion_phase(room_code, round_id, round_.choice, eligible, db)
    # Majority NO is unbeatable (remaining votes can't flip it) → go to DB content
    elif no_count > total - threshold:
        _custom_vote.pop(key, None)
        phase_timer.cancel(room_code)
        await _use_db_content(room_code, round_id, round_.choice, db)


async def _on_custom_vote_end(room_code: str, round_id: str) -> None:
    from app.db.base import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            key = f"{room_code}:{round_id}"
            votes = _custom_vote.pop(key, {"yes": set(), "no": set()})

            r = await db.execute(select(GameRound).where(GameRound.id == round_id))
            round_ = r.scalar_one_or_none()
            if not round_ or round_.phase != "custom_vote":
                return

            room_id_row = await db.execute(select(Room.id).where(Room.code == room_code))
            room_id = room_id_row.scalar_one()
            all_players = await _get_active_players(room_id, db)
            eligible = [p for p in all_players if p.id != round_.player_id]
            total = max(len(eligible), 1)
            yes_count = len(votes["yes"])
            threshold = math.ceil(total / 2)

            if yes_count >= threshold:
                await _start_suggestion_phase(room_code, round_id, round_.choice, eligible, db)
            else:
                await _use_db_content(room_code, round_id, round_.choice, db)
        except Exception:
            logger.exception("Error in custom vote end for room %s", room_code)


async def _start_suggestion_phase(
    room_code: str,
    round_id: str,
    choice: str,
    eligible_players: list[AnonPlayer],
    db: AsyncSession,
) -> None:
    """Pick one random player to submit a custom question."""
    if not eligible_players:
        await _use_db_content(room_code, round_id, choice, db)
        return

    suggester = random.choice(eligible_players)
    key = f"{room_code}:{round_id}"
    _suggestion_player[key] = suggester.id
    _suggestion_content[key] = None  # not yet submitted

    r = await db.execute(select(GameRound).where(GameRound.id == round_id))
    round_ = r.scalar_one_or_none()
    if not round_:
        return

    room = await _get_room(room_code, db)
    dur = PHASE_DURATIONS["suggestion"]
    ends_at = _now() + timedelta(seconds=dur)
    round_.phase = "suggestion"
    round_.phase_ends_at = ends_at
    room.current_phase = "suggestion"
    await db.commit()

    await room_manager.broadcast(room_code, {
        "type": "phase_change",
        "data": {
            "phase": "suggestion",
            "choice": choice,
            "suggester_player_id": suggester.id,
            "round_id": round_id,
            "ends_at": ends_at.isoformat(),
        },
    })
    phase_timer.schedule(room_code, dur, lambda: _on_suggestion_end(room_code, round_id, choice))


async def submit_suggestion(
    room_code: str,
    round_id: str,
    player_id: str,
    content: str,
    db: AsyncSession,
) -> None:
    """The randomly-selected player submits their custom question.
    Timer is cancelled immediately — no need to wait once content is in."""
    key = f"{room_code}:{round_id}"
    if _suggestion_player.get(key) != player_id:
        raise ValueError("You are not selected to suggest this round")
    if not content or len(content.strip()) == 0:
        raise ValueError("Question cannot be empty")
    if len(content) > 300:
        raise ValueError("Question too long (max 300 chars)")

    stored = content.strip()
    _suggestion_content[key] = stored
    _suggestion_player.pop(key, None)

    # Broadcast first so clients show "submitted" state briefly
    await room_manager.broadcast(room_code, {
        "type": "suggestion_submitted",
        "data": {"round_id": round_id},
    })

    # Cancel the suggestion timer and proceed immediately
    r = await db.execute(select(GameRound).where(GameRound.id == round_id))
    round_ = r.scalar_one_or_none()
    if not round_ or round_.phase != "suggestion":
        return

    phase_timer.cancel(room_code)
    _suggestion_content.pop(key, None)
    await _apply_content(room_code, round_id, round_.choice, stored, None, db)


async def _on_suggestion_end(room_code: str, round_id: str, choice: str) -> None:
    from app.db.base import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            key = f"{room_code}:{round_id}"
            content = _suggestion_content.pop(key, None)
            _suggestion_player.pop(key, None)

            r = await db.execute(select(GameRound).where(GameRound.id == round_id))
            round_ = r.scalar_one_or_none()
            if not round_ or round_.phase != "suggestion":
                return

            if content:
                await _apply_content(room_code, round_id, choice, content, None, db)
            else:
                await _use_db_content(room_code, round_id, choice, db)
        except Exception:
            logger.exception("Error in suggestion end for room %s", room_code)


async def _use_db_content(room_code: str, round_id: str, choice: str, db: AsyncSession) -> None:
    content = await _random_content(choice, db)
    if not content:
        room = await _get_room(room_code, db)
        await _finish_round(room, db)
        return
    await _apply_content(room_code, round_id, choice, None, content, db)


async def _apply_content(
    room_code: str,
    round_id: str,
    choice: str,
    custom_text: str | None,
    db_content: TruthOrDare | None,
    db: AsyncSession,
) -> None:
    """Set content on round and advance to truth_question or dare_show."""
    r = await db.execute(select(GameRound).where(GameRound.id == round_id))
    round_ = r.scalar_one_or_none()
    if not round_:
        return

    if custom_text:
        pts = 10 if choice == "truth" else 20
        content_data: dict[str, Any] = {"id": None, "type": choice, "content": custom_text, "pts": pts}
        round_.content_id = None
        # Store for reconnect
        _suggestion_content[f"content:{round_id}"] = custom_text
    else:
        assert db_content is not None
        content_data = _content_dict(db_content)
        round_.content_id = db_content.id

    room = await _get_room(room_code, db)

    if choice == "truth":
        show_dur = PHASE_DURATIONS["truth_question"]
        answer_dur = PHASE_DURATIONS["truth_answer"]
        ends_at = _now() + timedelta(seconds=show_dur)
        round_.phase = "truth_question"
        round_.phase_ends_at = ends_at
        room.current_phase = "truth_question"
        await db.commit()

        await room_manager.broadcast(room_code, {
            "type": "content_shown",
            "data": {
                "round_id": round_id,
                "phase": "truth_question",
                "content": content_data,
                "phase_ends_at": ends_at.isoformat(),
            },
        })
        phase_timer.schedule(
            room_code, show_dur,
            lambda: _on_truth_question_shown(room_code, round_id, answer_dur),
        )
    else:
        show_dur = PHASE_DURATIONS["dare_show"]
        vote_dur = PHASE_DURATIONS["dare_vote"]
        ends_at = _now() + timedelta(seconds=show_dur)
        round_.phase = "dare_show"
        round_.phase_ends_at = ends_at
        room.current_phase = "dare_show"
        await db.commit()

        await room_manager.broadcast(room_code, {
            "type": "content_shown",
            "data": {
                "round_id": round_id,
                "phase": "dare_show",
                "content": content_data,
                "phase_ends_at": ends_at.isoformat(),
            },
        })
        phase_timer.schedule(
            room_code, show_dur,
            lambda: _on_dare_shown(room_code, round_id, vote_dur),
        )


async def _auto_spin(room_code: str) -> None:
    from app.db.base import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            room = await _get_room(room_code, db)
            if room.status != "active":
                return
            # Check game timer
            if room.ends_at and _now() >= room.ends_at:
                await end_game(room_code, db)
                return
            await trigger_spin(room_code, db)
        except Exception:
            logger.exception("Error in auto-spin for room %s", room_code)


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

async def get_room_state(room_code: str, db: AsyncSession) -> dict[str, Any]:
    """Return serialisable snapshot of full room state for reconnect."""
    room = await _get_room(room_code, db)
    players = await _get_active_players(room.id, db)
    round_ = await _get_current_round(room.id, db)

    content = None
    votes: list[dict] = []
    reactions: list[dict] = []
    comments: list[dict] = []

    if round_ and round_.content_id:
        r = await db.execute(select(TruthOrDare).where(TruthOrDare.id == round_.content_id))
        tod = r.scalar_one_or_none()
        if tod:
            content = _content_dict(tod)
    elif round_:
        custom_text = _suggestion_content.get(f"content:{round_.id}")
        if custom_text:
            choice = round_.choice or "truth"
            content = {"id": None, "type": choice, "content": custom_text,
                       "pts": 10 if choice == "truth" else 20}

    if round_:
        v_r = await db.execute(select(Vote).where(Vote.round_id == round_.id))
        votes = [{"player_id": v.player_id, "value": v.value} for v in v_r.scalars().all()]

        rc_r = await db.execute(select(Reaction).where(Reaction.round_id == round_.id))
        reactions = [{"player_id": rc.player_id, "emoji": rc.emoji} for rc in rc_r.scalars().all()]

        cm_r = await db.execute(select(Comment).where(Comment.round_id == round_.id))
        comments = [
            {"id": c.id, "player_id": c.player_id, "text": c.text, "created_at": c.created_at.isoformat()}
            for c in cm_r.scalars().all()
        ]

    return {
        "room": {
            "id": room.id,
            "code": room.code,
            "status": room.status,
            "phase": room.current_phase,
            "host_id": room.host_id,
            "duration_minutes": room.duration_minutes,
            "starts_at": room.starts_at.isoformat() if room.starts_at else None,
            "ends_at": room.ends_at.isoformat() if room.ends_at else None,
            "current_turn_player_id": room.current_turn_player_id,
        },
        "players": [_player_dict(p) for p in players],
        "round": {
            "id": round_.id,
            "player_id": round_.player_id,
            "choice": round_.choice,
            "phase": round_.phase,
            "answer": round_.answer,
            "phase_ends_at": round_.phase_ends_at.isoformat() if round_.phase_ends_at else None,
            "content": content,
            "votes": votes,
            "reactions": reactions,
            "comments": comments,
            "suggester_player_id": _suggestion_player.get(f"{room_code}:{round_.id}"),
        } if round_ else None,
        "server_time": _now().isoformat(),
    }


async def start_game(room_code: str, db: AsyncSession) -> None:
    room = await _get_room(room_code, db)
    if room.status != "waiting":
        raise ValueError("Room is not in waiting state")

    players = await _get_active_players(room.id, db)
    if len(players) < 2:
        raise ValueError("Need at least 2 players to start")

    now = _now()
    room.status = "active"
    room.starts_at = now
    room.ends_at = now + timedelta(minutes=room.duration_minutes)
    room.current_phase = "waiting_spin"  # host must press spin to start

    color_map = _shuffle_colors(players)
    for p in players:
        p.username = generate_username()

    await db.commit()

    await room_manager.broadcast(room.code, {
        "type": "game_start",
        "data": {
            "starts_at": now.isoformat(),
            "ends_at": room.ends_at.isoformat(),
            "color_map": color_map,
            "players": [_player_dict(p) for p in players],
        },
    })
    # No auto-spin — host presses the spin button manually for the first spin


async def trigger_spin(room_code: str, db: AsyncSession) -> None:
    room = await _get_room(room_code, db)
    if room.status != "active":
        raise ValueError("Game not active")

    players = await _get_active_players(room.id, db)

    # Build excluded set: currently blacked-out + recently had their turn
    excluded: set[str] = set()
    now = _now()
    for p in players:
        if p.is_blacked_out:
            if p.blackout_ends_at and now < p.blackout_ends_at:
                excluded.add(p.id)
            else:
                # Blackout expired — lift it
                p.is_blacked_out = False
                p.blackout_ends_at = None

    eligible = [p for p in players if p.id not in excluded]
    if not eligible:
        # Everyone is blacked out — skip to next cycle
        await db.commit()
        phase_timer.schedule(room.code, 5.0, lambda: _auto_spin(room.code))
        return

    player_dicts = [
        {"id": p.id, "turn_count": p.turn_count, "last_turn_at": p.last_turn_at, "is_banned": p.is_banned}
        for p in eligible
    ]
    target_id = select_next_player(player_dicts, excluded)
    if not target_id:
        await db.commit()
        return

    target = next(p for p in players if p.id == target_id)
    room.current_turn_player_id = target_id
    room.current_phase = "spinning"

    spin_dur = PHASE_DURATIONS["spinning"]
    await db.commit()

    await room_manager.broadcast(room.code, {
        "type": "spin_start",
        "data": {
            "target_player_id": target_id,
            "target_color": target.color,
            "server_time": _now().isoformat(),
        },
    })

    phase_timer.schedule(
        room.code,
        spin_dur,
        lambda: _on_spin_land(room.code, target_id),
    )


async def _on_spin_land(room_code: str, target_id: str) -> None:
    from app.db.base import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            room = await _get_room(room_code, db)
            if room.status != "active":
                return

            dur = PHASE_DURATIONS["choice"]
            ends_at = _now() + timedelta(seconds=dur)
            room.current_phase = "choice"

            # Create the game round
            round_ = GameRound(
                room_id=room.id,
                player_id=target_id,
                phase="choice",
                phase_ends_at=ends_at,
            )
            db.add(round_)
            await db.commit()
            await db.refresh(round_)

            await room_manager.broadcast(room_code, {
                "type": "spin_result",
                "data": {
                    "target_player_id": target_id,
                    "round_id": round_.id,
                    "phase": "choice",
                    "phase_ends_at": ends_at.isoformat(),
                },
            })

            phase_timer.schedule(
                room_code,
                dur,
                lambda: _on_choice_timeout(room_code, round_.id),
            )
        except Exception:
            logger.exception("Error in spin land for room %s", room_code)


async def _on_choice_timeout(room_code: str, round_id: str) -> None:
    """Player didn't choose — treat as skip."""
    from app.db.base import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(GameRound).where(GameRound.id == round_id))
        round_ = r.scalar_one_or_none()
        if not round_ or round_.phase != "choice":
            return
        await handle_skip(room_code, round_.player_id, db, auto=True)


async def submit_choice(room_code: str, round_id: str, choice: str, db: AsyncSession) -> None:
    r = await db.execute(select(GameRound).where(GameRound.id == round_id))
    round_ = r.scalar_one_or_none()
    if not round_ or round_.phase != "choice":
        raise ValueError("Invalid round state for choice")

    phase_timer.cancel(room_code)

    round_.choice = choice

    # After choice → go to custom_vote phase (others vote: custom question or random?)
    dur = PHASE_DURATIONS["custom_vote"]
    ends_at = _now() + timedelta(seconds=dur)
    round_.phase = "custom_vote"
    round_.phase_ends_at = ends_at

    room = await _get_room(room_code, db)
    room.current_phase = "custom_vote"
    await db.commit()

    await room_manager.broadcast(room_code, {
        "type": "phase_change",
        "data": {
            "phase": "custom_vote",
            "choice": choice,
            "round_id": round_id,
            "ends_at": ends_at.isoformat(),
        },
    })
    phase_timer.schedule(room_code, dur, lambda: _on_custom_vote_end(room_code, round_id))


async def _on_truth_question_shown(room_code: str, round_id: str, answer_dur: float) -> None:
    from app.db.base import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(GameRound).where(GameRound.id == round_id))
        round_ = r.scalar_one_or_none()
        if not round_:
            return
        ends_at = _now() + timedelta(seconds=answer_dur)
        round_.phase = "truth_answer"
        round_.phase_ends_at = ends_at
        await db.commit()

        await room_manager.broadcast(room_code, {
            "type": "phase_change",
            "data": {"phase": "truth_answer", "round_id": round_id, "ends_at": ends_at.isoformat()},
        })
        phase_timer.schedule(
            room_code,
            answer_dur,
            lambda: _on_truth_answer_timeout(room_code, round_id),
        )


async def _on_truth_answer_timeout(room_code: str, round_id: str) -> None:
    from app.db.base import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(GameRound).where(GameRound.id == round_id))
        round_ = r.scalar_one_or_none()
        if not round_ or round_.phase != "truth_answer":
            return
        room = await _get_room(room_code, db)
        # No answer given — advance to reaction (player gets no points)
        await _advance_to_reaction(room, round_, db)


async def submit_answer(room_code: str, round_id: str, answer: str, db: AsyncSession) -> None:
    r = await db.execute(select(GameRound).where(GameRound.id == round_id))
    round_ = r.scalar_one_or_none()
    if not round_ or round_.phase != "truth_answer":
        raise ValueError("Not in answer phase")

    phase_timer.cancel(room_code)
    round_.answer = answer
    round_.phase = "truth_revealed"

    # Award points
    player_r = await db.execute(select(AnonPlayer).where(AnonPlayer.id == round_.player_id))
    player = player_r.scalar_one_or_none()
    if player:
        player.points += 10
        player.turn_count += 1
        player.last_turn_at = _now()

    room = await _get_room(room_code, db)
    await db.commit()

    await room_manager.broadcast(room_code, {
        "type": "answer_submitted",
        "data": {
            "round_id": round_id,
            "answer": answer,
            "player_id": round_.player_id,
        },
    })
    if player:
        await room_manager.broadcast(room_code, {
            "type": "points_update",
            "data": {"player_id": player.id, "pts": player.points, "delta": 10},
        })

    await _advance_to_reaction(room, round_, db)


async def _on_dare_shown(room_code: str, round_id: str, vote_dur: float) -> None:
    from app.db.base import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(GameRound).where(GameRound.id == round_id))
        round_ = r.scalar_one_or_none()
        if not round_:
            return
        ends_at = _now() + timedelta(seconds=vote_dur)
        round_.phase = "dare_vote"
        round_.phase_ends_at = ends_at
        await db.commit()

        await room_manager.broadcast(room_code, {
            "type": "phase_change",
            "data": {"phase": "dare_vote", "round_id": round_id, "ends_at": ends_at.isoformat()},
        })
        phase_timer.schedule(
            room_code,
            vote_dur,
            lambda: _on_dare_vote_end(room_code, round_id),
        )


async def cast_vote(
    room_code: str,
    round_id: str,
    voter_id: str,
    value: str,
    db: AsyncSession,
) -> None:
    # Idempotent — upsert by (round_id, player_id)
    existing = await db.execute(
        select(Vote).where(Vote.round_id == round_id, Vote.player_id == voter_id)
    )
    vote = existing.scalar_one_or_none()
    if vote:
        vote.value = value
    else:
        vote = Vote(round_id=round_id, player_id=voter_id, value=value)
        db.add(vote)
    await db.commit()

    all_votes_r = await db.execute(select(Vote).where(Vote.round_id == round_id))
    all_votes = list(all_votes_r.scalars().all())

    await room_manager.broadcast(room_code, {
        "type": "vote_update",
        "data": {
            "round_id": round_id,
            "votes": [{"player_id": v.player_id, "value": v.value} for v in all_votes],
            "total": len(all_votes),
        },
    })

    # Auto-proceed dare vote when majority is reached
    r_round = await db.execute(select(GameRound).where(GameRound.id == round_id))
    round_ = r_round.scalar_one_or_none()
    if round_ and round_.phase == "dare_vote":
        all_players = await _get_active_players(round_.room_id, db)
        eligible_count = max(len([p for p in all_players if p.id != round_.player_id]), 1)
        yes_count = sum(1 for v in all_votes if v.value == "yes")
        no_count = sum(1 for v in all_votes if v.value == "no")
        threshold = math.ceil(eligible_count / 2)
        if yes_count >= threshold or no_count >= threshold:
            phase_timer.cancel(room_code)
            await _process_dare_vote_end(room_code, round_id, round_, list(all_votes), db)


async def _on_dare_vote_end(room_code: str, round_id: str) -> None:
    """Timer callback — runs in its own session."""
    from app.db.base import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            r = await db.execute(select(GameRound).where(GameRound.id == round_id))
            round_ = r.scalar_one_or_none()
            if not round_ or round_.phase != "dare_vote":
                return
            votes_r = await db.execute(select(Vote).where(Vote.round_id == round_id))
            votes = list(votes_r.scalars().all())
            await _process_dare_vote_end(room_code, round_id, round_, votes, db)
        except Exception:
            logger.exception("Error in dare vote end for room %s", room_code)


async def _process_dare_vote_end(
    room_code: str,
    round_id: str,
    round_: GameRound,
    votes: list[Vote],
    db: AsyncSession,
) -> None:
    """Shared logic for dare vote resolution (called by timer or auto-proceed)."""
    if round_.phase != "dare_vote":
        return

    yes = sum(1 for v in votes if v.value == "yes")
    total = len(votes)
    passed = total > 0 and yes > total / 2

    round_.dare_passed = passed

    player_r = await db.execute(select(AnonPlayer).where(AnonPlayer.id == round_.player_id))
    player = player_r.scalar_one_or_none()
    if player:
        if passed:
            player.points += 20
        player.turn_count += 1
        player.last_turn_at = _now()

    room = await _get_room(room_code, db)
    await db.commit()

    await room_manager.broadcast(room_code, {
        "type": "dare_result",
        "data": {
            "round_id": round_id,
            "passed": passed,
            "yes_votes": yes,
            "total_votes": total,
        },
    })
    if player:
        await room_manager.broadcast(room_code, {
            "type": "points_update",
            "data": {"player_id": player.id, "pts": player.points, "delta": 20 if passed else 0},
        })

    await _advance_to_reaction(room, round_, db)


async def add_reaction(
    room_code: str,
    round_id: str,
    player_id: str,
    emoji: str,
    db: AsyncSession,
) -> None:
    # Check before adding so autoflush doesn't see the new row
    existing_rc = await db.execute(
        select(Reaction).where(
            Reaction.round_id == round_id,
            Reaction.player_id == player_id,
        )
    )
    is_first = existing_rc.scalar_one_or_none() is None

    rc = Reaction(round_id=round_id, player_id=player_id, emoji=emoji)
    db.add(rc)
    await db.commit()
    await db.refresh(rc)  # populate rc.id

    if is_first:
        player_r = await db.execute(select(AnonPlayer).where(AnonPlayer.id == player_id))
        player = player_r.scalar_one_or_none()
        if player:
            player.points += 1
            await db.commit()
            await room_manager.broadcast(room_code, {
                "type": "points_update",
                "data": {"player_id": player_id, "pts": player.points, "delta": 1},
            })

    await room_manager.broadcast(room_code, {
        "type": "reaction",
        "data": {"id": rc.id, "round_id": round_id, "player_id": player_id, "emoji": emoji},
    })


async def add_comment(
    room_code: str,
    round_id: str,
    player_id: str,
    text: str,
    db: AsyncSession,
) -> None:
    if len(text.strip()) < 1 or len(text) > 280:
        raise ValueError("Comment must be 1-280 characters")

    comment = Comment(round_id=round_id, player_id=player_id, text=text.strip())
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    # Look up username + color for display
    player_r = await db.execute(select(AnonPlayer).where(AnonPlayer.id == player_id))
    player = player_r.scalar_one_or_none()

    await room_manager.broadcast(room_code, {
        "type": "comment",
        "data": {
            "id": comment.id,
            "round_id": round_id,
            "player_id": player_id,
            "username": player.username if player else "?",
            "color": player.color if player else "#3b82f6",
            "text": comment.text,
            "created_at": comment.created_at.isoformat(),
        },
    })


async def dare_complete(
    room_code: str,
    round_id: str,
    player_id: str,
    db: AsyncSession,
) -> None:
    """Dare player manually signals they are done — advance to dare_vote immediately."""
    r = await db.execute(select(GameRound).where(GameRound.id == round_id))
    round_ = r.scalar_one_or_none()
    if not round_ or round_.phase != "dare_show":
        raise ValueError("Not in dare_show phase")
    if round_.player_id != player_id:
        raise ValueError("Only the dare player can mark dare as complete")

    phase_timer.cancel(room_code)

    vote_dur = PHASE_DURATIONS["dare_vote"]
    ends_at = _now() + timedelta(seconds=vote_dur)
    round_.phase = "dare_vote"
    round_.phase_ends_at = ends_at

    room = await _get_room(room_code, db)
    room.current_phase = "dare_vote"
    await db.commit()

    await room_manager.broadcast(room_code, {
        "type": "phase_change",
        "data": {"phase": "dare_vote", "round_id": round_id, "ends_at": ends_at.isoformat()},
    })
    phase_timer.schedule(
        room_code,
        vote_dur,
        lambda: _on_dare_vote_end(room_code, round_id),
    )


async def handle_skip(
    room_code: str,
    player_id: str,
    db: AsyncSession,
    *,
    auto: bool = False,
) -> None:
    player_r = await db.execute(select(AnonPlayer).where(AnonPlayer.id == player_id))
    player = player_r.scalar_one_or_none()
    if not player:
        raise ValueError("Player not found")

    phase_timer.cancel(room_code)

    if player.lives > 0:
        # Use a free skip/life
        player.lives -= 1
        player.points = max(0, player.points - 5)
        player.turn_count += 1
        player.last_turn_at = _now()
        await db.commit()

        await room_manager.broadcast(room_code, {
            "type": "skip_life_used",
            "data": {
                "player_id": player_id,
                "lives_remaining": player.lives,
                "pts": player.points,
            },
        })
        await _finish_round(await _get_room(room_code, db), db)
        return

    # No lives — apply blackout
    player.skips_used += 1
    skip_n = player.skips_used
    player.points = max(0, player.points - 5)
    player.turn_count += 1
    player.last_turn_at = _now()

    if skip_n >= 3:
        # Third skip — punishment vote
        await db.commit()
        await _start_punishment_vote(room_code, player_id, db)
        return

    duration = BLACKOUT_DURATIONS.get(skip_n, 2 * 60)
    player.is_blacked_out = True
    player.blackout_ends_at = _now() + timedelta(seconds=duration)
    player.turn_count += 1
    player.last_turn_at = _now()
    await db.commit()

    roast = random.choice(ROAST_MESSAGES)
    await room_manager.broadcast(room_code, {
        "type": "blackout_start",
        "data": {
            "player_id": player_id,
            "duration_seconds": duration,
            "ends_at": player.blackout_ends_at.isoformat(),
            "message": roast,
            "skip_number": skip_n,
        },
    })
    await _finish_round(await _get_room(room_code, db), db)


async def _start_punishment_vote(room_code: str, target_id: str, db: AsyncSession) -> None:
    room = await _get_room(room_code, db)
    dur = PHASE_DURATIONS["punishment_vote"]
    ends_at = _now() + timedelta(seconds=dur)
    room.current_phase = "punishment_vote"
    await db.commit()

    await room_manager.broadcast(room_code, {
        "type": "phase_change",
        "data": {
            "phase": "punishment_vote",
            "target_player_id": target_id,
            "ends_at": ends_at.isoformat(),
            "options": {
                "a": "Permanent ban from room",
                "b": "Identity reveal vote",
            },
        },
    })
    phase_timer.schedule(
        room_code,
        dur,
        lambda: _on_punishment_vote_end(room_code, target_id),
    )


async def submit_punishment_vote(
    room_code: str,
    voter_id: str,
    value: str,
    db: AsyncSession,
) -> None:
    """Record a punishment vote ('a' = ban, 'b' = reveal) and broadcast live tally."""
    if room_code not in _punishment_votes:
        _punishment_votes[room_code] = {}
    _punishment_votes[room_code][voter_id] = value

    votes = _punishment_votes[room_code]
    a_count = sum(1 for v in votes.values() if v == "a")
    b_count = sum(1 for v in votes.values() if v == "b")

    room_id_row = await db.execute(select(Room.id).where(Room.code == room_code))
    room_id = room_id_row.scalar_one()
    all_players = await _get_active_players(room_id, db)
    total_voters = len(all_players)

    await room_manager.broadcast(room_code, {
        "type": "vote_update",
        "data": {
            "votes": [{"player_id": pid, "value": v} for pid, v in votes.items()],
            "total": len(votes),
            "total_voters": total_voters,
        },
    })


async def _on_punishment_vote_end(room_code: str, target_id: str) -> None:
    from app.db.base import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            room = await _get_room(room_code, db)

            # Tally votes — majority A = ban, majority B = reveal, tie = ban
            votes = _punishment_votes.pop(room_code, {})
            a_count = sum(1 for v in votes.values() if v == "a")
            b_count = sum(1 for v in votes.values() if v == "b")
            result = "reveal" if b_count > a_count else "ban"

            await room_manager.broadcast(room_code, {
                "type": "punishment_vote_result",
                "data": {"result": result, "target_player_id": target_id},
            })

            player_r = await db.execute(select(AnonPlayer).where(AnonPlayer.id == target_id))
            player = player_r.scalar_one_or_none()

            if result == "ban" and player:
                player.is_banned = True
            elif result == "reveal" and player:
                # Identity will be revealed at game end — mark with a flag (use skips_used as proxy)
                # Actual reveal happens in end_game; here we just broadcast identity now
                from app.models.user import User
                from app.core.security import decrypt_field
                user_r = await db.execute(select(User).where(User.id == player.user_id))
                user = user_r.scalar_one_or_none()
                if user:
                    try:
                        real_name = decrypt_field(user.name_encrypted)
                        phone = decrypt_field(user.phone_encrypted)
                        # Schedule identity_reveal phase briefly
                        reveal_dur = PHASE_DURATIONS["identity_reveal"]
                        ends_at = _now() + timedelta(seconds=reveal_dur)
                        room.current_phase = "identity_reveal"
                        await db.commit()

                        await room_manager.broadcast(room_code, {
                            "type": "identity_reveal",
                            "data": {
                                "playerId": player.id,
                                "realName": real_name,
                                "phoneLast4": phone[-4:],
                                "ends_at": ends_at.isoformat(),
                            },
                        })
                        phase_timer.schedule(
                            room_code, reveal_dur,
                            lambda: _after_identity_reveal(room_code)
                        )
                        return
                    except Exception:
                        logger.exception("Identity reveal failed for room %s", room_code)

            room.current_phase = "spinning"
            await db.commit()
            await _finish_round(room, db)
        except Exception:
            logger.exception("Error in punishment vote end for room %s", room_code)


async def _after_identity_reveal(room_code: str) -> None:
    """Called after identity_reveal display — proceed to next round."""
    from app.db.base import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            room = await _get_room(room_code, db)
            await _finish_round(room, db)
        except Exception:
            logger.exception("Error after identity reveal for room %s", room_code)


async def end_game(room_code: str, db: AsyncSession) -> None:
    room = await _get_room(room_code, db)
    phase_timer.cancel(room_code)
    room.status = "ended"
    room.current_phase = "ended"

    players = await _get_active_players(room.id, db)
    players_sorted = sorted(players, key=lambda p: p.points, reverse=True)

    last_place = players_sorted[-1] if players_sorted else None
    last_place_reveal = None

    if last_place:
        # Get real name for last place reveal
        from app.models.user import User
        from app.core.security import decrypt_field
        user_r = await db.execute(select(User).where(User.id == last_place.user_id))
        user = user_r.scalar_one_or_none()
        if user:
            try:
                real_name = decrypt_field(user.name_encrypted)
                phone = decrypt_field(user.phone_encrypted)
                last_place_reveal = {"name": real_name, "phone_last4": phone[-4:]}
            except Exception:
                last_place_reveal = None

    await db.commit()

    await room_manager.broadcast(room_code, {
        "type": "game_end",
        "data": {
            "leaderboard": [_player_dict(p) for p in players_sorted],
            "last_place_reveal": last_place_reveal,
        },
    })
