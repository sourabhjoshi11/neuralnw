"""
Chor Sipahi — WebSocket handler.
Handles real-time game state sync, chat, and typing indicators.
"""
import json
from fastapi import WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.models.chor_sipahi import CSRoom, CSPlayer, CSRound
from app.models.user import User
from app.api.routes.chor_sipahi import cs_manager, _safe_players, _round_public, _round_revealed


async def cs_ws_handler(ws: WebSocket, room_code: str, db: AsyncSession) -> None:
    await ws.accept()

    token = ws.query_params.get("token", "")
    try:
        payload = decode_access_token(token)
        user_id: str = payload["sub"]
    except (JWTError, KeyError):
        await ws.send_text(json.dumps({"type": "error", "code": 4001, "reason": "invalid_token"}))
        await ws.close(code=4001)
        return

    user_r = await db.execute(select(User).where(User.id == user_id))
    user = user_r.scalar_one_or_none()
    if not user:
        await ws.send_text(json.dumps({"type": "error", "code": 4003, "reason": "user_not_found"}))
        await ws.close(code=4003)
        return

    room_r = await db.execute(select(CSRoom).where(CSRoom.code == room_code))
    room = room_r.scalar_one_or_none()
    if not room:
        await ws.send_text(json.dumps({"type": "error", "code": 4004, "reason": "room_not_found"}))
        await ws.close(code=4004)
        return

    player_r = await db.execute(
        select(CSPlayer).where(CSPlayer.room_id == room.id, CSPlayer.user_id == user_id)
    )
    player = player_r.scalar_one_or_none()
    if not player:
        await ws.send_text(json.dumps({"type": "error", "code": 4005, "reason": "not_a_member"}))
        await ws.close(code=4005)
        return

    cs_manager.connect(room_code, player.id, ws)

    # Send full state snapshot on connect
    players_r = await db.execute(select(CSPlayer).where(CSPlayer.room_id == room.id))
    players = list(players_r.scalars().all())
    round_data = None
    if room.current_round > 0:
        rnd_r = await db.execute(
            select(CSRound).where(CSRound.room_id == room.id, CSRound.round_number == room.current_round)
        )
        rnd = rnd_r.scalar_one_or_none()
        round_data = _round_revealed(rnd) if (rnd and room.phase == "result") else (_round_public(rnd) if rnd else None)

    await ws.send_text(json.dumps({
        "type": "state_sync",
        "data": {
            "roomCode": room.code,
            "status": room.status,
            "phase": room.phase,
            "currentRound": room.current_round,
            "phaseEndsAt": room.phase_ends_at,
            "players": _safe_players(players, user_id, reveal_all=room.phase == "result"),
            "round": round_data,
        },
    }))

    # Notify others
    await cs_manager.broadcast(room_code, {
        "type": "player_online",
        "data": {"playerId": player.id, "username": player.username},
    }, exclude=player.id)

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            if msg_type == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))

            elif msg_type == "chat":
                text = str(msg.get("text", ""))[:300].strip()
                if text:
                    await cs_manager.broadcast(room_code, {
                        "type": "chat",
                        "data": {
                            "playerId": player.id,
                            "username": player.username,
                            "color": player.color,
                            "text": text,
                        },
                    })

            elif msg_type == "typing":
                await cs_manager.broadcast(room_code, {
                    "type": "typing",
                    "data": {"playerId": player.id, "username": player.username},
                }, exclude=player.id)

            elif msg_type == "guess_preview":
                await db.refresh(room)
                await db.refresh(player)
                if room.phase != "guessing" or player.role != "mantri":
                    continue

                guess_chor_id = msg.get("guessChorId")
                guess_sipahi_id = msg.get("guessSipahiId")
                round_r = await db.execute(
                    select(CSRound).where(CSRound.room_id == room.id, CSRound.round_number == room.current_round)
                )
                round_ = round_r.scalar_one_or_none()
                valid_ids = {round_.chor_id, round_.sipahi_id} if round_ else set()

                if guess_chor_id is not None and guess_chor_id not in valid_ids:
                    guess_chor_id = None
                if guess_sipahi_id is not None and guess_sipahi_id not in valid_ids:
                    guess_sipahi_id = None

                await cs_manager.broadcast(room_code, {
                    "type": "guess_preview",
                    "data": {
                        "mantriId": player.id,
                        "guessChorId": guess_chor_id,
                        "guessSipahiId": guess_sipahi_id,
                    },
                })

            elif msg_type == "reaction":
                emoji = str(msg.get("emoji", ""))[:2]
                if emoji:
                    await cs_manager.broadcast(room_code, {
                        "type": "reaction",
                        "data": {"playerId": player.id, "emoji": emoji},
                    })

    except WebSocketDisconnect:
        pass
    finally:
        cs_manager.disconnect(room_code, player.id)
        await cs_manager.broadcast(room_code, {
            "type": "player_offline",
            "data": {"playerId": player.id},
        })
