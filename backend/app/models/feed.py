import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Feed(Base):
    __tablename__ = "feeds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False, index=True)
    admin_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    member_count: Mapped[int] = mapped_column(Integer, default=1)
    pinned_message_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FeedMember(Base):
    __tablename__ = "feed_members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    feed_id: Mapped[str] = mapped_column(String(36), ForeignKey("feeds.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    strike_count: Mapped[int] = mapped_column(Integer, default=0)
    weekly_message_count: Mapped[int] = mapped_column(Integer, default=0)
    week_resets_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FeedMessage(Base):
    __tablename__ = "feed_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    feed_id: Mapped[str] = mapped_column(String(36), ForeignKey("feeds.id"), nullable=False, index=True)
    sender_id: Mapped[str] = mapped_column(String(36), ForeignKey("feed_members.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    reply_to_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("feed_messages.id"), nullable=True)
    reactions: Mapped[dict] = mapped_column(JSON, default=dict)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
