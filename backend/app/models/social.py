import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Confession(Base):
    __tablename__ = "confessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    feed_id: Mapped[str] = mapped_column(String(36), ForeignKey("feeds.id"), nullable=False, index=True)
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("feed_members.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    reactions: Mapped[dict] = mapped_column(JSON, default=dict)  # {"🔥": 3, "💀": 1}
    is_reported: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Crush(Base):
    __tablename__ = "crushes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    feed_id: Mapped[str] = mapped_column(String(36), ForeignKey("feeds.id"), nullable=False, index=True)
    from_member_id: Mapped[str] = mapped_column(String(36), ForeignKey("feed_members.id"), nullable=False)
    to_member_id: Mapped[str] = mapped_column(String(36), ForeignKey("feed_members.id"), nullable=False)
    is_matched: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
