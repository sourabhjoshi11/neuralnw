"""
In-memory WebSocket connection manager for feed rooms.
Reuses the same pattern as room_manager but scoped to feed codes.
"""
from app.services.room_manager import RoomConnectionManager

feed_manager = RoomConnectionManager()
