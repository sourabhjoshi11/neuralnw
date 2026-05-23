import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CSRoom(Base):
    """Chor Sipahi — game room."""
    __tablename__ = "cs_rooms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(6), unique=True, nullable=False, index=True)
    host_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    # waiting | playing | finished
    status: Mapped[str] = mapped_column(String(20), default="waiting")
    # quick | classic | party
    mode: Mapped[str] = mapped_column(String(20), default="quick")
    # lobby | role_reveal | discussion | guessing | result
    phase: Mapped[str] = mapped_column(String(30), default="lobby")
    current_round: Mapped[int] = mapped_column(Integer, default=0)
    max_players: Mapped[int] = mapped_column(Integer, default=6)
    # phase timer expires at (ISO string)
    phase_ends_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CSPlayer(Base):
    """Player in a Chor Sipahi room."""
    __tablename__ = "cs_players"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("cs_rooms.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False)
    points: Mapped[int] = mapped_column(Integer, default=0)
    join_order: Mapped[int] = mapped_column(Integer, default=1)
    is_bot: Mapped[bool] = mapped_column(Boolean, default=False)
    # NEVER expose to other clients: raja | mantri | sipahi | chor
    role: Mapped[str | None] = mapped_column(String(20), nullable=True)


class CSRound(Base):
    """One round of Chor Sipahi."""
    __tablename__ = "cs_rounds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("cs_rooms.id"), nullable=False, index=True)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # player IDs assigned each role this round
    raja_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    mantri_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    sipahi_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    chor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # Mantri's guesses
    guess_chor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    guess_sipahi_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # result
    chor_caught: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # points awarded this round {player_id: points}
    points_awarded: Mapped[dict | None] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
