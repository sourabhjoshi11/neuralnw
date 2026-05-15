"""
In-memory WebSocket connection manager for game rooms.
Handles broadcast, targeted sends, and connection lifecycle.
"""
import json
from collections import defaultdict
from fastapi import WebSocket


class RoomConnectionManager:
    def __init__(self) -> None:
        # room_code -> {player_id -> WebSocket}
        self._rooms: dict[str, dict[str, WebSocket]] = defaultdict(dict)

    def connect(self, room_code: str, player_id: str, ws: WebSocket) -> None:
        self._rooms[room_code][player_id] = ws

    def disconnect(self, room_code: str, player_id: str) -> None:
        room = self._rooms.get(room_code, {})
        room.pop(player_id, None)
        if not room:
            self._rooms.pop(room_code, None)

    def player_count(self, room_code: str) -> int:
        return len(self._rooms.get(room_code, {}))

    async def broadcast(self, room_code: str, message: dict, exclude: str | None = None) -> None:
        room = self._rooms.get(room_code, {})
        dead: list[str] = []
        for pid, ws in list(room.items()):
            if pid == exclude:
                continue
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(pid)
        for pid in dead:
            self.disconnect(room_code, pid)

    async def send_to(self, room_code: str, player_id: str, message: dict) -> None:
        ws = self._rooms.get(room_code, {}).get(player_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                self.disconnect(room_code, player_id)


room_manager = RoomConnectionManager()
