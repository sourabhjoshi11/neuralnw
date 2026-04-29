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


class ChoiceRequest(BaseModel):
    choice: str

    @field_validator("choice")
    @classmethod
    def validate_choice(cls, v: str) -> str:
        if v not in ("truth", "dare"):
            raise ValueError("Choice must be 'truth' or 'dare'")
        return v


class AnswerRequest(BaseModel):
    answer: str

    @field_validator("answer")
    @classmethod
    def validate_answer(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Answer cannot be empty")
        if len(v) > 500:
            raise ValueError("Answer too long (max 500 chars)")
        return v


class VoteRequest(BaseModel):
    value: str

    @field_validator("value")
    @classmethod
    def validate_value(cls, v: str) -> str:
        if v not in ("yes", "no"):
            raise ValueError("Vote must be 'yes' or 'no'")
        return v


class ReactionRequest(BaseModel):
    emoji: str

    @field_validator("emoji")
    @classmethod
    def validate_emoji(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 4:
            raise ValueError("Invalid emoji")
        return v


class CommentRequest(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Comment cannot be empty")
        if len(v) > 280:
            raise ValueError("Comment too long (max 280 chars)")
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
