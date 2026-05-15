import json
import random
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import decode_access_token
from app.db.base import get_db
from app.models.feed import Feed, FeedMember, FeedMessage
from app.models.user import User
from app.services.feed_manager import feed_manager
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
    pinned_message_id: str | None = None
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
    is_pinned: bool = False
    edited_at: datetime | None = None
    created_at: datetime
    expires_at: datetime
    model_config = {"from_attributes": True}


class EditMessageRequest(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 1 or len(v) > 1000:
            raise ValueError("Message must be 1-1000 characters")
        return v


class ReactRequest(BaseModel):
    emoji: str

    @field_validator("emoji")
    @classmethod
    def validate_emoji(cls, v: str) -> str:
        if len(v) > 8:
            raise ValueError("Invalid emoji")
        return v


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

    # Weekly limit check (premium bypasses) — TEMPORARILY DISABLED
    now = datetime.now(timezone.utc)
    # if not user.is_premium:
    #     week_reset = member.week_resets_at
    #     if week_reset is None or now > week_reset:
    #         member.weekly_message_count = 0
    #         member.week_resets_at = now + timedelta(days=(6 - now.weekday()) % 7 or 7)
    #     if member.weekly_message_count >= 5:
    #         raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Weekly message limit reached")

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

    # Broadcast to all connected feed members in real-time
    await feed_manager.broadcast(code, {
        "type": "new_message",
        "data": {
            "id": message.id,
            "feed_id": str(message.feed_id),
            "sender_id": str(message.sender_id),
            "username": member.username,
            "content": message.content,
            "reply_to_id": str(message.reply_to_id) if message.reply_to_id else None,
            "reactions": message.reactions or {},
            "created_at": message.created_at.isoformat(),
            "expires_at": message.expires_at.isoformat(),
        },
    })

    return message


@router.get("/feeds", response_model=list[FeedOut])
async def get_my_feeds(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return all feeds the current user is a member of."""
    result = await db.execute(
        select(Feed)
        .join(FeedMember, FeedMember.feed_id == Feed.id)
        .where(FeedMember.user_id == user.id)
        .order_by(Feed.created_at.desc())
    )
    return result.scalars().all()


@router.get("/feeds/{code}/me", response_model=FeedMemberOut)
async def get_my_membership(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the current user's member record for this feed."""
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

    return FeedMemberOut.model_validate(member)


@router.get("/feeds/{code}/members", response_model=list[FeedMemberOut])
async def get_members(
    code: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return all members of the feed (must be a member yourself)."""
    result = await db.execute(select(Feed).where(Feed.code == code))
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    # verify caller is a member
    caller = await db.execute(
        select(FeedMember).where(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id)
    )
    if not caller.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")

    members_result = await db.execute(
        select(FeedMember)
        .where(FeedMember.feed_id == feed.id, FeedMember.is_banned == False)
        .order_by(FeedMember.joined_at.asc())
    )
    return members_result.scalars().all()


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



@router.delete("/feeds/{code}/messages/{message_id}", status_code=204)
async def delete_message(
    code: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    member_result = await db.execute(
        select(FeedMember).where(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")

    msg_result = await db.execute(
        select(FeedMessage).where(FeedMessage.id == message_id, FeedMessage.feed_id == feed.id)
    )
    message = msg_result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    # Only sender or admin can delete
    if message.sender_id != member.id and not member.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your message")

    message.is_deleted = True
    await db.commit()

    await feed_manager.broadcast(code, {
        "type": "message_deleted",
        "data": {"id": message_id},
    })


@router.patch("/feeds/{code}/messages/{message_id}", response_model=FeedMessageOut)
async def edit_message(
    code: str,
    message_id: str,
    body: EditMessageRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    member_result = await db.execute(
        select(FeedMember).where(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")

    msg_result = await db.execute(
        select(FeedMessage).where(FeedMessage.id == message_id, FeedMessage.feed_id == feed.id, FeedMessage.is_deleted == False)
    )
    message = msg_result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    if message.sender_id != member.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your message")

    safe = await is_content_safe(body.content)
    if not safe:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message flagged by moderation")

    now = datetime.now(timezone.utc)
    message.content = body.content
    message.edited_at = now
    await db.commit()
    await db.refresh(message)

    await feed_manager.broadcast(code, {
        "type": "message_edited",
        "data": {
            "id": message.id,
            "content": message.content,
            "edited_at": message.edited_at.isoformat(),
        },
    })

    return message


@router.post("/feeds/{code}/messages/{message_id}/react", status_code=204)
async def react_to_message(
    code: str,
    message_id: str,
    body: ReactRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    member_result = await db.execute(
        select(FeedMember).where(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")

    msg_result = await db.execute(
        select(FeedMessage).where(FeedMessage.id == message_id, FeedMessage.feed_id == feed.id, FeedMessage.is_deleted == False)
    )
    message = msg_result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    # Toggle reaction: add if not present, remove if already reacted with same emoji
    reactions = dict(message.reactions or {})
    reactions[body.emoji] = reactions.get(body.emoji, 0) + 1
    message.reactions = reactions
    await db.commit()

    await feed_manager.broadcast(code, {
        "type": "reaction_updated",
        "data": {
            "message_id": message_id,
            "reactions": reactions,
        },
    })


@router.patch("/feeds/{code}/pin", response_model=FeedOut)
async def pin_message(
    code: str,
    message_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Pin or unpin a message (admins only). Pass message_id=null to unpin."""
    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")

    member_result = await db.execute(
        select(FeedMember).where(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id)
    )
    member = member_result.scalar_one_or_none()
    if not member or not member.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")

    feed.pinned_message_id = message_id
    await db.commit()
    await db.refresh(feed)

    await feed_manager.broadcast(code, {
        "type": "pin_updated",
        "data": {"pinned_message_id": message_id},
    })

    return FeedOut.model_validate(feed)


@router.websocket("/ws/{code}")
async def feed_websocket(
    code: str,
    ws: WebSocket,
    db: AsyncSession = Depends(get_db),
):
    """
    WebSocket for real-time feed message delivery.
    Auth via ?token=<jwt> query param (WS can't send Authorization headers).
    """
    from jose import JWTError

    token = ws.query_params.get("token")
    if not token:
        await ws.close(code=4001)
        return

    # Verify JWT
    try:
        payload = decode_access_token(token)
        user_id: str = payload["sub"]
    except (JWTError, KeyError, Exception):
        await ws.close(code=4001)
        return

    # Load user
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user or user.is_banned:
        await ws.close(code=4001)
        return

    # Check feed + membership
    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one_or_none()
    if not feed:
        await ws.close(code=4004)
        return

    member_result = await db.execute(
        select(FeedMember).where(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id)
    )
    member = member_result.scalar_one_or_none()
    if not member or member.is_banned:
        await ws.close(code=4003)
        return

    await ws.accept()
    feed_manager.connect(code, member.id, ws)

    # Announce presence to other members
    await feed_manager.broadcast(code, {
        "type": "presence",
        "data": {"member_id": member.id, "username": member.username, "online": True},
    }, exclude=member.id)

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
                if msg.get("type") == "typing":
                    # Relay typing event to everyone else in the feed
                    await feed_manager.broadcast(code, {
                        "type": "typing",
                        "data": {"member_id": member.id, "username": member.username},
                    }, exclude=member.id)
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        feed_manager.disconnect(code, member.id)
        # Announce departure
        await feed_manager.broadcast(code, {
            "type": "presence",
            "data": {"member_id": member.id, "username": member.username, "online": False},
        })