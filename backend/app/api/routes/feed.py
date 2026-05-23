import json
import random
import re
import string
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect, status
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
    is_public: bool = False

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
    is_public: bool = False
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
    msg_type: str = "text"
    media_url: str | None = None

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 1 or len(v) > 1000:
            raise ValueError("Message must be 1-1000 characters")
        return v

    @field_validator("msg_type")
    @classmethod
    def validate_msg_type(cls, v: str) -> str:
        if v not in {"text", "voice", "image"}:
            raise ValueError("Invalid message type")
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
    msg_type: str = "text"
    poll_options: list | None = None
    poll_votes: dict | None = None
    media_url: str | None = None
    seen_by: list = []
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


class CreatePollRequest(BaseModel):
    question: str
    options: list[str]

    @field_validator("question")
    @classmethod
    def validate_question(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3 or len(v) > 200:
            raise ValueError("Question must be 3-200 characters")
        return v

    @field_validator("options")
    @classmethod
    def validate_options(cls, v: list[str]) -> list[str]:
        v = [o.strip() for o in v]
        if len(v) < 2 or len(v) > 4:
            raise ValueError("Need 2-4 options")
        if any(len(o) < 1 or len(o) > 80 for o in v):
            raise ValueError("Each option must be 1-80 characters")
        return v


class PollVoteRequest(BaseModel):
    option_index: int


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
        msg_type=body.msg_type,
        media_url=body.media_url,
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
            "is_pinned": message.is_pinned,
            "edited_at": message.edited_at.isoformat() if message.edited_at else None,
            "msg_type": message.msg_type,
            "poll_options": message.poll_options,
            "poll_votes": message.poll_votes,
            "media_url": message.media_url,
            "seen_by": message.seen_by or [],
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
    before_id: str | None = None,
    limit: int = 40,
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
    limit = max(1, min(limit, 100))

    query = (
        select(FeedMessage)
        .where(FeedMessage.feed_id == feed.id, FeedMessage.expires_at > now, FeedMessage.is_deleted == False)
    )

    # If before_id is given, fetch messages older than that message
    if before_id:
        anchor_result = await db.execute(
            select(FeedMessage.created_at).where(FeedMessage.id == before_id)
        )
        anchor_ts = anchor_result.scalar_one_or_none()
        if anchor_ts:
            query = query.where(FeedMessage.created_at < anchor_ts)

    query = query.order_by(FeedMessage.created_at.desc()).limit(limit)
    msgs_result = await db.execute(query)
    # Return in ascending order so frontend can prepend correctly
    return list(reversed(msgs_result.scalars().all()))



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



@router.post("/feeds/{code}/polls", response_model=FeedMessageOut, status_code=201)
async def create_poll(
    code: str,
    body: CreatePollRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from datetime import timedelta
    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")

    member_result = await db.execute(
        select(FeedMember).where(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member")

    now = datetime.now(timezone.utc)
    msg = FeedMessage(
        feed_id=feed.id,
        sender_id=member.id,
        content=body.question,
        msg_type="poll",
        poll_options=body.options,
        poll_votes={str(i): [] for i in range(len(body.options))},
        expires_at=now + timedelta(days=7),
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    out = FeedMessageOut.model_validate(msg)
    await feed_manager.broadcast(code, {"type": "new_message", "data": out.model_dump(mode="json")})
    return out


@router.post("/feeds/{code}/messages/{message_id}/poll_vote", status_code=204)
async def poll_vote(
    code: str,
    message_id: str,
    body: PollVoteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")

    member_result = await db.execute(
        select(FeedMember).where(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member")

    msg_result = await db.execute(
        select(FeedMessage).where(FeedMessage.id == message_id, FeedMessage.feed_id == feed.id)
    )
    msg = msg_result.scalar_one_or_none()
    if not msg or msg.msg_type != "poll":
        raise HTTPException(status_code=404, detail="Poll not found")

    if body.option_index < 0 or body.option_index >= len(msg.poll_options or []):
        raise HTTPException(status_code=400, detail="Invalid option")

    votes = dict(msg.poll_votes or {})
    # Remove previous vote from this member
    for key in votes:
        if member.id in votes[key]:
            votes[key] = [v for v in votes[key] if v != member.id]
    # Add new vote
    key = str(body.option_index)
    votes.setdefault(key, [])
    votes[key].append(member.id)

    msg.poll_votes = votes
    db.add(msg)
    await db.commit()

    out = FeedMessageOut.model_validate(msg)
    await feed_manager.broadcast(code, {"type": "poll_updated", "data": out.model_dump(mode="json")})




@router.get("/link-preview")
async def link_preview(
    url: str,
    user: User = Depends(get_current_user),
):
    import httpx
    import re as _re
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("Invalid scheme")
        domain = parsed.netloc
        async with httpx.AsyncClient(timeout=5, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "ClassChaosBot/1.0"})
            html = resp.text

        def _og(prop):
            for p in [
                r'<meta[^>]+property=["\']' + _re.escape(prop) + r'["\'][^>]+content=["\']([^"\']+)["\']',
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']' + _re.escape(prop) + r'["\']',
            ]:
                m = _re.search(p, html, _re.I)
                if m: return m.group(1).strip()
            return None

        def _meta(name):
            for p in [
                r'<meta[^>]+name=["\']' + _re.escape(name) + r'["\'][^>]+content=["\']([^"\']+)["\']',
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']' + _re.escape(name) + r'["\']',
            ]:
                m = _re.search(p, html, _re.I)
                if m: return m.group(1).strip()
            return None

        def _title():
            m = _re.search(r"<title[^>]*>(.*?)</title>", html, _re.I | _re.DOTALL)
            return m.group(1).strip() if m else None

        return {
            "url": url, "domain": domain,
            "title": _og("og:title") or _meta("title") or _title(),
            "description": _og("og:description") or _meta("description"),
            "image": _og("og:image"),
        }
    except Exception:
        return {"url": url, "domain": "", "title": None, "description": None, "image": None}



@router.post("/feeds/{code}/upload-image")
async def upload_image(
    code: str,
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload image or audio to Supabase Storage, return public URL."""
    import httpx, uuid as _uuid

    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")

    member_result = await db.execute(
        select(FeedMember).where(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id)
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member")

    # Validate content type — allow images and audio (voice messages)
    allowed = {
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "audio/m4a", "audio/mp4", "audio/aac", "audio/mpeg",
        "audio/x-m4a", "audio/3gpp", "audio/webm", "audio/ogg",
        "application/octet-stream",
    }
    if file.content_type and file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="File type not supported")

    # Max 10MB
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    ext = re.sub(r"[^a-zA-Z0-9]", "", ext)[:12] or "jpg"
    filename = f"feed/{code}/{_uuid.uuid4()}.{ext}"
    bucket = "classchaos-media"

    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
        upload_url = f"{settings.SUPABASE_URL}/storage/v1/object/{bucket}/{filename}"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(
                    upload_url,
                    content=contents,
                    headers={
                        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                        "Content-Type": file.content_type or "image/jpeg",
                    },
                )
        except httpx.HTTPError as exc:
            if settings.APP_ENV != "development":
                raise HTTPException(status_code=502, detail="Storage upload failed") from exc
        else:
            if resp.status_code in (200, 201):
                public_url = f"{settings.SUPABASE_URL}/storage/v1/object/public/{bucket}/{filename}"
                return {"url": public_url}
            if settings.APP_ENV != "development":
                raise HTTPException(status_code=502, detail="Storage upload failed")
    elif settings.APP_ENV != "development":
        raise HTTPException(status_code=503, detail="Storage not configured")

    # Development fallback: keep uploads working if Supabase Storage is down
    # or the storage bucket has not been created yet.
    local_path = Path("uploads") / filename
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(contents)
    public_path = filename.replace("\\", "/")
    return {"url": f"{str(request.base_url).rstrip('/')}/uploads/{public_path}"}


@router.post("/feeds/{code}/messages/{message_id}/seen", status_code=204)
async def mark_seen(
    code: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")

    member_result = await db.execute(
        select(FeedMember).where(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member")

    msg_result = await db.execute(
        select(FeedMessage).where(FeedMessage.id == message_id, FeedMessage.feed_id == feed.id)
    )
    msg = msg_result.scalar_one_or_none()
    if not msg or msg.sender_id == member.id:
        return  # Don't mark own messages as seen

    seen = list(msg.seen_by or [])
    if member.id not in seen:
        seen.append(member.id)
        msg.seen_by = seen
        db.add(msg)
        await db.commit()
        await feed_manager.broadcast(code, {
            "type": "message_seen",
            "data": {"message_id": message_id, "seen_by": seen, "member_id": member.id},
        })



@router.get("/discover", response_model=list[FeedOut])
async def discover_feeds(
    q: str = "",
    limit: int = 20,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Browse public feeds, optionally filtered by name."""
    from sqlalchemy import func
    limit = max(1, min(limit, 50))
    query = select(Feed).where(Feed.is_public == True)
    if q.strip():
        query = query.where(Feed.name.ilike(f"%{q.strip()}%"))
    query = query.order_by(Feed.member_count.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/feeds/{code}/visibility", response_model=FeedOut)
async def set_visibility(
    code: str,
    is_public: bool,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Toggle feed public/private (admin only)."""
    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")
    member_result = await db.execute(
        select(FeedMember).where(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id, FeedMember.is_admin == True)
    )
    if not member_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Admin only")
    feed.is_public = is_public
    db.add(feed)
    await db.commit()
    await db.refresh(feed)
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
