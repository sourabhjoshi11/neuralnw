import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ScribbleRoom(Base):
    __tablename__ = "scribble_rooms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False, index=True)
    host_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="lobby")  # lobby, playing, finished
    max_players: Mapped[int] = mapped_column(Integer, default=8)
    total_rounds: Mapped[int] = mapped_column(Integer, default=5)
    current_round: Mapped[int] = mapped_column(Integer, default=0)
    current_drawer_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    current_word: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phase: Mapped[str] = mapped_column(String(16), default="lobby")  # lobby, choosing, drawing, results, finished
    phase_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    category: Mapped[str] = mapped_column(String(32), default="mixed")  # college, hostel, desi, bollywood, mixed
    sabotage_mode: Mapped[bool] = mapped_column(Boolean, default=True)
    blind_draw_interval: Mapped[int] = mapped_column(Integer, default=3)  # every Nth round is blind
    saboteur_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_blind_round: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ScribblePlayer(Base):
    __tablename__ = "scribble_players"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("scribble_rooms.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    score: Mapped[int] = mapped_column(Integer, default=0)
    draw_order: Mapped[int] = mapped_column(Integer, default=0)
    has_guessed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_saboteur: Mapped[bool] = mapped_column(Boolean, default=False)
    is_connected: Mapped[bool] = mapped_column(Boolean, default=True)
    round_reactions: Mapped[dict] = mapped_column(JSON, default=dict)  # {"🎨": 2, "💀": 1}
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
