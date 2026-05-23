import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TTRoom(Base):
    """Two Truths One Lie — game room."""
    __tablename__ = "tt_rooms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(6), unique=True, nullable=False, index=True)
    host_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    # waiting | playing | finished
    status: Mapped[str] = mapped_column(String(20), default="waiting")
    # index into players turn order
    current_player_index: Mapped[int] = mapped_column(Integer, default=0)
    # waiting_statements | voting | reveal | finished
    phase: Mapped[str] = mapped_column(String(30), default="lobby")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TTPlayer(Base):
    """Player in a Two Truths room."""
    __tablename__ = "tt_players"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("tt_rooms.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False)
    points: Mapped[int] = mapped_column(Integer, default=0)
    join_order: Mapped[int] = mapped_column(Integer, default=1)


class TTRound(Base):
    """One round = one player submits 3 statements, others vote."""
    __tablename__ = "tt_rounds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("tt_rooms.id"), nullable=False, index=True)
    player_id: Mapped[str] = mapped_column(String(36), ForeignKey("tt_players.id"), nullable=False)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # JSON list of 3 strings e.g. ["I've been to Paris", "I can juggle", "I've met a celebrity"]
    statements: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # index 0/1/2 — which statement is the lie
    lie_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # {player_id: 0|1|2} — each voter's guess
    votes: Mapped[dict | None] = mapped_column(JSON, default=dict)
    # waiting_statements | voting | reveal
    phase: Mapped[str] = mapped_column(String(30), default="waiting_statements")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
