import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(6), unique=True, nullable=False, index=True)
    host_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="waiting")
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_turn_player_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    current_phase: Mapped[str] = mapped_column(String(30), default="lobby")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AnonPlayer(Base):
    __tablename__ = "anon_players"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("rooms.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False)
    points: Mapped[int] = mapped_column(Integer, default=0)
    lives: Mapped[int] = mapped_column(Integer, default=1)
    skips_used: Mapped[int] = mapped_column(Integer, default=0)
    is_blacked_out: Mapped[bool] = mapped_column(Boolean, default=False)
    blackout_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    turn_count: Mapped[int] = mapped_column(Integer, default=0)
    last_turn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    join_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TruthOrDare(Base):
    __tablename__ = "truth_or_dare"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    type: Mapped[str] = mapped_column(String(5), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class GameRound(Base):
    __tablename__ = "game_rounds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("rooms.id"), nullable=False, index=True)
    player_id: Mapped[str] = mapped_column(String(36), ForeignKey("anon_players.id"), nullable=False)
    choice: Mapped[str | None] = mapped_column(String(5), nullable=True)
    content_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("truth_or_dare.id"), nullable=True)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    phase: Mapped[str] = mapped_column(String(30), default="spinning")
    phase_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dare_passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Vote(Base):
    __tablename__ = "votes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    round_id: Mapped[str] = mapped_column(String(36), ForeignKey("game_rounds.id"), nullable=False, index=True)
    player_id: Mapped[str] = mapped_column(String(36), ForeignKey("anon_players.id"), nullable=False)
    value: Mapped[str] = mapped_column(String(5), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Reaction(Base):
    __tablename__ = "reactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    round_id: Mapped[str] = mapped_column(String(36), ForeignKey("game_rounds.id"), nullable=False, index=True)
    player_id: Mapped[str] = mapped_column(String(36), ForeignKey("anon_players.id"), nullable=False)
    emoji: Mapped[str] = mapped_column(String(4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    round_id: Mapped[str] = mapped_column(String(36), ForeignKey("game_rounds.id"), nullable=False, index=True)
    player_id: Mapped[str] = mapped_column(String(36), ForeignKey("anon_players.id"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
