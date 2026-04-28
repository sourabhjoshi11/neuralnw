from datetime import datetime
from pydantic import BaseModel, field_validator


class CreateRoomRequest(BaseModel):
    duration_minutes: int

    @field_validator("duration_minutes")
    @classmethod
    def validate_duration(cls, v: int) -> int:
        if v not in (15, 30, 45, 60):
            raise ValueError("Duration must be 15, 30, 45, or 60 minutes")
        return v


class RoomOut(BaseModel):
    id: str
    code: str
    host_id: str
    status: str
    duration_minutes: int
    starts_at: datetime | None
    ends_at: datetime | None
    player_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AnonPlayerOut(BaseModel):
    id: str
    room_id: str
    user_id: str
    username: str
    color: str
    points: int
    lives: int
    skips_used: int
    is_blacked_out: bool
    blackout_ends_at: datetime | None
    turn_count: int
    last_turn_at: datetime | None
    join_order: int

    model_config = {"from_attributes": True}


class JoinRoomResponse(BaseModel):
    room: RoomOut
    player: AnonPlayerOut
    players: list[AnonPlayerOut]
