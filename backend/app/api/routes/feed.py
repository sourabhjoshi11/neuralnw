import random
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.feed import Feed, FeedMember, FeedMessage
from app.models.user import User
from app.services.moderation import is_content_safe
from app.services.username import generate_username

router = APIRouter(prefix="/feed", tags=["feed"])


def _generate_feed_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=8))


class CreateFeedRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3 or len(v) > 100:
            raise ValueError("Name must be 3-100 characters")
        return v


class FeedOut(BaseModel):
    id: str
    code: str
    admin_id: str
    name: str
    member_count: int
    created_at: datetime
    model_config = {"from_attributes": True}


class FeedMemberOut(BaseModel):
    id: str
    feed_id: str
    user_id: str
    username: str
    is_admin: bool
    weekly_message_count: int
    week_resets_at: datetime | None
    model_config = {"from_attributes": True}


class PostMessageRequest(BaseModel):
    content: str
    reply_to_id: str | None = None

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 1 or len(v) > 1000:
            raise ValueError("Message must be 1-1000 characters")
        return v


class FeedMessageOut(BaseModel):
    id: str
    feed_id: str
    sender_id: str
    content: str
    reply_to_id: str | None
    reactions: dict
    created_at: datetime
    expires_at: datetime
    model_config = {"from_attributes": True}


@router.post("/feeds")
async def create_feed(
    body: CreateFeedRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    for _ in range(10):
        code = _generate_feed_code()
        existing = await db.execute(select(Feed).where(Feed.code == code))
        if not existing.scalar_one_or_none():
            break

    feed = Feed(code=code, admin_id=user.id, name=body.name)
    db.add(feed)
    await db.flush()

    member = FeedMember(
        feed_id=feed.id,
        user_id=user.id,
        username=generate_username(),
        is_admin=True,
    )
    db.add(member)
    await db.commit()
    await db.refresh(feed)
    await db.refresh(member)

    return {"feed": FeedOut.model_validate(feed), "member": FeedMemberOut.model_validate(member)}


@router.post("/feeds/{code}/join")
async def join_feed(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Feed).where(Feed.code == code))
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    existing = await db.execute(
        select(FeedMember).where(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member")

    member = FeedMember(
        feed_id=feed.id,
        user_id=user.id,
        username=generate_username(),
    )
    feed.member_count += 1
    db.add(member)
    await db.commit()
    await db.refresh(member)

    return {"feed": FeedOut.model_validate(feed), "member": FeedMemberOut.model_validate(member)}


@router.post("/feeds/{code}/messages", response_model=FeedMessageOut)
async def post_message(
    code: str,
    body: PostMessageRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Feed).where(Feed.code == code))
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    member_result = await db.execute(
        select(FeedMember).where(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
    if member.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are banned from this feed")

    # Weekly limit check (premium bypasses)
    now = datetime.now(timezone.utc)
    if not user.is_premium:
        week_reset = member.week_resets_at
        if week_reset is None or now > week_reset:
            member.weekly_message_count = 0
            member.week_resets_at = now + timedelta(days=(6 - now.weekday()) % 7 or 7)
        if member.weekly_message_count >= 5:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Weekly message limit reached")

    safe = await is_content_safe(body.content)
    if not safe:
        member.strike_count += 1
        if member.strike_count >= 3:
            member.is_banned = True
        await db.commit()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message flagged by moderation")

    message = FeedMessage(
        feed_id=feed.id,
        sender_id=member.id,
        content=body.content,
        reply_to_id=body.reply_to_id,
        expires_at=now + timedelta(hours=24),
    )
    member.weekly_message_count += 1
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


@router.get("/feeds/{code}/messages", response_model=list[FeedMessageOut])
async def get_messages(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Feed).where(Feed.code == code))
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    member_result = await db.execute(
        select(FeedMember).where(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id)
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")

    now = datetime.now(timezone.utc)
    msgs_result = await db.execute(
        select(FeedMessage)
        .where(FeedMessage.feed_id == feed.id, FeedMessage.expires_at > now, FeedMessage.is_deleted == False)
        .order_by(FeedMessage.created_at.asc())
    )
    return msgs_result.scalars().all()
