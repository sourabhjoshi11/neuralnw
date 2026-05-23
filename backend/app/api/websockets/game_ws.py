"""
Game room WebSocket handler.
Handles player join/leave, ping/pong, and relays game events.
"""
import json
from fastapi import WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.models.game import AnonPlayer, Room
from app.models.user import User
from app.services import game_engine
from app.services.room_manager import room_manager


async def game_ws_handler(ws: WebSocket, room_code: str, db: AsyncSession) -> None:
    # Accept first so the client receives proper WebSocket close frames
    # (without accept(), Starlette returns HTTP 403 which the client can't distinguish)
    await ws.accept()

    # Authenticate via query param token
    token = ws.query_params.get("token", "")

    try:
        payload = decode_access_token(token)
        user_id: str = payload["sub"]
    except (JWTError, KeyError):
        print(f"[WS] Auth failed for room {room_code}: invalid token")
        await ws.send_text(json.dumps({"type": "error", "code": 4001, "reason": "invalid_token"}))
        await ws.close(code=4001)
        return

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user or user.is_banned:
        print(f"[WS] Auth failed for room {room_code}: user not found or banned (uid={user_id})")
        await ws.send_text(json.dumps({"type": "error", "code": 4003, "reason": "user_not_found"}))
        await ws.close(code=4003)
        return

    room_result = await db.execute(select(Room).where(Room.code == room_code))
    room = room_result.scalar_one_or_none()
    if not room:
        print(f"[WS] Room not found: {room_code}")
        await ws.send_text(json.dumps({"type": "error", "code": 4004, "reason": "room_not_found"}))
        await ws.close(code=4004)
        return
    if room.status == "ended":
        print(f"[WS] Room {room_code} has ended")
        await ws.send_text(json.dumps({"type": "error", "code": 4004, "reason": "room_ended"}))
        await ws.close(code=4004)
        return

    player_result = await db.execute(
        select(AnonPlayer).where(AnonPlayer.room_id == room.id, AnonPlayer.user_id == user_id)
    )
    player = player_result.scalar_one_or_none()
    if not player:
        print(f"[WS] Player not found in room {room_code} for user {user_id}")
        await ws.send_text(json.dumps({"type": "error", "code": 4005, "reason": "not_a_member"}))
        await ws.close(code=4005)
        return
    room_manager.connect(room_code, player.id, ws)

    # Send full state snapshot to the connecting client for reconnect
    try:
        state = await game_engine.get_room_state(room_code, db)
        await ws.send_text(json.dumps({"type": "state_sync", "data": state}))
    except Exception:
        pass

    # Notify others of join/reconnect
    await room_manager.broadcast(
        room_code,
        {
            "type": "player_join",
            "data": {
                "player": {
                    "id": player.id,
                    "un": player.username,
                    "color": player.color,
                    "pts": player.points,
                    "lives": player.lives,
                    "is_blacked_out": player.is_blacked_out,
                }
            },
        },
        exclude=player.id,
    )

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            if msg_type == "ping":
                await ws.send_text(json.dumps({"type": "pong", "data": {}}))
                continue

            # All other game events are handled by game logic routes;
            # WS here is primarily for real-time push. Client actions go via HTTP.
            # Forward client broadcasts (reactions, comments) to the room.
            if msg_type in ("reaction", "comment", "vote"):
                await room_manager.broadcast(room_code, msg, exclude=player.id)

    except WebSocketDisconnect:
        pass
    finally:
        room_manager.disconnect(room_code, player.id)
        await room_manager.broadcast(
            room_code,
            {"type": "player_leave", "data": {"playerId": player.id}},
        )
