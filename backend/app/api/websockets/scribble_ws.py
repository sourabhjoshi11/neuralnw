import asyncio
import json
import random
from datetime import datetime, timezone, timedelta

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import AsyncSessionLocal
from app.models.scribble import ScribbleRoom, ScribblePlayer
from app.services.word_bank import get_word_choices
from app.core.security import decode_access_token

# In-memory state per room
_rooms: dict[str, "RoomState"] = {}


class RoomState:
    def __init__(self, code: str):
        self.code = code
        self.connections: dict[str, WebSocket] = {}  # player_id -> ws
        self.player_ids: list[str] = []
        self.guessed: set[str] = set()
        self.guess_order: int = 0
        self.timer_task: asyncio.Task | None = None
        self.current_word: str = ""
        self.drawer_id: str = ""
        self.saboteur_id: str = ""
        self.round_scores: dict[str, int] = {}

    async def broadcast(self, msg: dict, exclude: str | None = None):
        data = json.dumps(msg)
        for pid, ws in list(self.connections.items()):
            if pid == exclude:
                continue
            try:
                await ws.send_text(data)
            except:
                pass

    async def send_to(self, player_id: str, msg: dict):
        ws = self.connections.get(player_id)
        if ws:
            try:
                await ws.send_text(json.dumps(msg))
            except:
                pass


def _generate_hint(word: str, reveal_count: int = 0) -> str:
    chars = list(word)
    hint = ["_" if c != " " else " " for c in chars]
    if reveal_count > 0:
        indices = [i for i, c in enumerate(chars) if c != " "]
        random.shuffle(indices)
        for i in indices[:reveal_count]:
            hint[i] = chars[i]
    return " ".join(hint)


async def scribble_ws_handler(websocket: WebSocket, code: str, token: str):
    """Main WebSocket handler for Scribble game."""
    # Auth
    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=4001)
        return
    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=4001)
        return

    await websocket.accept()

    # Get player
    async with AsyncSessionLocal() as db:
        room_result = await db.execute(select(ScribbleRoom).where(ScribbleRoom.code == code))
        room = room_result.scalar_one_or_none()
        if not room:
            await websocket.close(code=4004)
            return
        player_result = await db.execute(
            select(ScribblePlayer).where(ScribblePlayer.room_id == room.id, ScribblePlayer.user_id == user_id)
        )
        player = player_result.scalar_one_or_none()
        if not player:
            await websocket.close(code=4003)
            return

    player_id = player.id

    # Join room state
    if code not in _rooms:
        _rooms[code] = RoomState(code)
    state = _rooms[code]
    state.connections[player_id] = websocket
    if player_id not in state.player_ids:
        state.player_ids.append(player_id)

    await state.broadcast({"type": "player_joined", "player_id": player_id, "username": player.username})

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "start_game":
                await _handle_start(code, player_id, state)

            elif msg_type == "choose_word":
                await _handle_choose_word(code, player_id, msg.get("word", ""), state)

            elif msg_type == "draw":
                # Relay drawing to all except drawer
                await state.broadcast({
                    "type": "draw",
                    "points": msg.get("points", []),
                    "color": msg.get("color", "#ffffff"),
                    "width": msg.get("width", 3),
                }, exclude=player_id)

            elif msg_type == "clear":
                await state.broadcast({"type": "clear"}, exclude=player_id)

            elif msg_type == "guess":
                await _handle_guess(code, player_id, msg.get("text", ""), state)

            elif msg_type == "react":
                await state.broadcast({
                    "type": "react",
                    "player_id": player_id,
                    "emoji": msg.get("emoji", "🔥"),
                })

            elif msg_type == "call_saboteur":
                await _handle_call_saboteur(code, player_id, msg.get("suspect_id", ""), state)

    except (WebSocketDisconnect, Exception):
        pass
    finally:
        state.connections.pop(player_id, None)
        await state.broadcast({"type": "player_left", "player_id": player_id})
        if not state.connections:
            _rooms.pop(code, None)


async def _handle_start(code: str, player_id: str, state: RoomState):
    async with AsyncSessionLocal() as db:
        room_result = await db.execute(select(ScribbleRoom).where(ScribbleRoom.code == code))
        room = room_result.scalar_one_or_none()
        if not room or room.host_id != (await _get_user_id(db, player_id)):
            return
        if len(state.player_ids) < 3:
            await state.send_to(player_id, {"type": "error", "message": "Need at least 3 players"})
            return

        room.status = "playing"
        room.current_round = 0
        await db.commit()

    await _start_next_round(code, state)


async def _start_next_round(code: str, state: RoomState):
    async with AsyncSessionLocal() as db:
        room_result = await db.execute(select(ScribbleRoom).where(ScribbleRoom.code == code))
        room = room_result.scalar_one_or_none()
        if not room:
            return

        room.current_round += 1
        if room.current_round > room.total_rounds:
            room.status = "finished"
            room.phase = "finished"
            await db.commit()
            await _send_final_results(code, state, db)
            return

        # Pick drawer (rotate)
        players_result = await db.execute(
            select(ScribblePlayer).where(ScribblePlayer.room_id == room.id).order_by(ScribblePlayer.draw_order)
        )
        players = players_result.scalars().all()
        drawer_idx = (room.current_round - 1) % len(players)
        drawer = players[drawer_idx]
        room.current_drawer_id = drawer.id
        state.drawer_id = drawer.id

        # Blind draw check
        room.is_blind_round = (room.current_round % room.blind_draw_interval == 0)

        # Saboteur (pick random non-drawer)
        if room.sabotage_mode:
            non_drawers = [p for p in players if p.id != drawer.id]
            saboteur = random.choice(non_drawers) if non_drawers else None
            room.saboteur_id = saboteur.id if saboteur else None
            state.saboteur_id = saboteur.id if saboteur else ""
            # Reset saboteur flags
            for p in players:
                p.is_saboteur = (p.id == room.saboteur_id)
                p.has_guessed = False
        else:
            room.saboteur_id = None
            state.saboteur_id = ""
            for p in players:
                p.has_guessed = False

        room.phase = "choosing"
        await db.commit()

        # Reset round state
        state.guessed = set()
        state.guess_order = 0
        state.round_scores = {}

        # Send word choices to drawer
        words = get_word_choices(room.category)
        await state.send_to(drawer.id, {"type": "word_choices", "words": words})

        # Notify others
        await state.broadcast({
            "type": "round_start",
            "round": room.current_round,
            "total_rounds": room.total_rounds,
            "drawer_id": drawer.id,
            "drawer_username": drawer.username,
            "is_blind_round": room.is_blind_round,
        })

        # Notify saboteur
        if room.sabotage_mode and room.saboteur_id:
            await state.send_to(room.saboteur_id, {"type": "you_are_saboteur"})


async def _handle_choose_word(code: str, player_id: str, word: str, state: RoomState):
    if player_id != state.drawer_id or not word:
        return

    state.current_word = word.lower().strip()

    async with AsyncSessionLocal() as db:
        room_result = await db.execute(select(ScribbleRoom).where(ScribbleRoom.code == code))
        room = room_result.scalar_one_or_none()
        if not room:
            return
        room.current_word = state.current_word
        room.phase = "drawing"
        room.phase_ends_at = datetime.now(timezone.utc) + timedelta(seconds=60)
        await db.commit()

    hint = _generate_hint(state.current_word, 0)
    await state.broadcast({
        "type": "drawing_start",
        "hint": hint,
        "length": len(state.current_word),
        "time_limit": 60,
    })

    # Start timer for hints and round end
    if state.timer_task:
        state.timer_task.cancel()
    state.timer_task = asyncio.create_task(_round_timer(code, state))


async def _round_timer(code: str, state: RoomState):
    """Send hints at intervals and end round after 60s."""
    try:
        await asyncio.sleep(15)
        if state.current_word:
            hint = _generate_hint(state.current_word, 1)
            await state.broadcast({"type": "hint_reveal", "hint": hint})

        await asyncio.sleep(15)
        if state.current_word:
            hint = _generate_hint(state.current_word, 2)
            await state.broadcast({"type": "hint_reveal", "hint": hint})

        await asyncio.sleep(15)
        if state.current_word:
            hint = _generate_hint(state.current_word, 3)
            await state.broadcast({"type": "hint_reveal", "hint": hint})

        await asyncio.sleep(15)
        # Time's up
        await _end_round(code, state)
    except asyncio.CancelledError:
        pass


async def _handle_guess(code: str, player_id: str, text: str, state: RoomState):
    if player_id == state.drawer_id or player_id in state.guessed:
        return

    text = text.strip().lower()
    if not text:
        return

    # Check if correct
    if text == state.current_word:
        state.guessed.add(player_id)
        state.guess_order += 1
        # Score: 100, 80, 60, 40
        points = max(40, 120 - state.guess_order * 20)
        state.round_scores[player_id] = points

        # Get username
        async with AsyncSessionLocal() as db:
            p_result = await db.execute(select(ScribblePlayer).where(ScribblePlayer.id == player_id))
            p = p_result.scalar_one_or_none()
            username = p.username if p else "?"
            p.has_guessed = True
            p.score += points
            # Drawer gets points per correct guess
            drawer_result = await db.execute(select(ScribblePlayer).where(ScribblePlayer.id == state.drawer_id))
            drawer = drawer_result.scalar_one_or_none()
            if drawer:
                drawer.score += 20
                state.round_scores[state.drawer_id] = state.round_scores.get(state.drawer_id, 0) + 20
            await db.commit()

        await state.broadcast({
            "type": "correct_guess",
            "player_id": player_id,
            "username": username,
            "position": state.guess_order,
            "points": points,
        })

        # Check if all non-drawer, non-saboteur guessed
        non_drawers = [pid for pid in state.player_ids if pid != state.drawer_id]
        if len(state.guessed) >= len(non_drawers):
            await _end_round(code, state)
    else:
        # Wrong guess — broadcast it
        async with AsyncSessionLocal() as db:
            p_result = await db.execute(select(ScribblePlayer).where(ScribblePlayer.id == player_id))
            p = p_result.scalar_one_or_none()
            username = p.username if p else "?"

        await state.broadcast({
            "type": "guess",
            "player_id": player_id,
            "username": username,
            "text": text,
        })


async def _handle_call_saboteur(code: str, player_id: str, suspect_id: str, state: RoomState):
    if not state.saboteur_id or player_id == state.drawer_id:
        return

    correct = (suspect_id == state.saboteur_id)
    bonus = 50 if correct else -20

    async with AsyncSessionLocal() as db:
        p_result = await db.execute(select(ScribblePlayer).where(ScribblePlayer.id == player_id))
        p = p_result.scalar_one_or_none()
        if p:
            p.score += bonus
            await db.commit()

    await state.broadcast({
        "type": "saboteur_called",
        "caller_id": player_id,
        "suspect_id": suspect_id,
        "correct": correct,
        "saboteur_id": state.saboteur_id if correct else None,
        "bonus": bonus,
    })


async def _end_round(code: str, state: RoomState):
    if state.timer_task:
        state.timer_task.cancel()
        state.timer_task = None

    word = state.current_word
    state.current_word = ""

    # Get scores
    async with AsyncSessionLocal() as db:
        room_result = await db.execute(select(ScribbleRoom).where(ScribbleRoom.code == code))
        room = room_result.scalar_one_or_none()
        if room:
            room.phase = "results"
            await db.commit()

        players_result = await db.execute(
            select(ScribblePlayer).where(ScribblePlayer.room_id == room.id).order_by(ScribblePlayer.score.desc())
        )
        players = players_result.scalars().all()
        scores = [{"id": p.id, "username": p.username, "score": p.score, "round_points": state.round_scores.get(p.id, 0)} for p in players]

    await state.broadcast({
        "type": "round_end",
        "word": word,
        "scores": scores,
        "saboteur_id": state.saboteur_id if state.saboteur_id else None,
    })

    # Wait 8 seconds for reactions, then next round
    await asyncio.sleep(8)
    await _start_next_round(code, state)


async def _send_final_results(code: str, state: RoomState, db: AsyncSession):
    room_result = await db.execute(select(ScribbleRoom).where(ScribbleRoom.code == code))
    room = room_result.scalar_one_or_none()
    if not room:
        return

    players_result = await db.execute(
        select(ScribblePlayer).where(ScribblePlayer.room_id == room.id).order_by(ScribblePlayer.score.desc())
    )
    players = players_result.scalars().all()

    leaderboard = [{"id": p.id, "username": p.username, "score": p.score} for p in players]

    # Awards
    awards = {}
    if players:
        awards["winner"] = {"id": players[0].id, "username": players[0].username}
    # Worst drawer could be tracked but skip for now

    await state.broadcast({
        "type": "game_end",
        "leaderboard": leaderboard,
        "awards": awards,
    })


async def _get_user_id(db: AsyncSession, player_id: str) -> str | None:
    result = await db.execute(select(ScribblePlayer).where(ScribblePlayer.id == player_id))
    p = result.scalar_one_or_none()
    return p.user_id if p else None
