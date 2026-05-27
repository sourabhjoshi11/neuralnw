from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, validator
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.feed import Feed, FeedMember
from app.models.social import Confession, Crush
from app.models.user import User

router = APIRouter(prefix="/social", tags=["social"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class CreateConfessionRequest(BaseModel):
    content: str

    @validator("content")
    def validate_content(cls, v):
        v = v.strip()
        if len(v) < 3 or len(v) > 500:
            raise ValueError("Confession must be 3-500 characters")
        return v


class ConfessionOut(BaseModel):
    id: str
    content: str
    reactions: dict
    created_at: str

    class Config:
        from_attributes = True


class ReactRequest(BaseModel):
    emoji: str


class SetCrushRequest(BaseModel):
    to_member_id: str


class CrushStatusOut(BaseModel):
    has_crush: bool
    crush_member_id: str | None = None
    is_matched: bool = False
    match_username: str | None = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _get_member(db: AsyncSession, feed_code: str, user: User) -> FeedMember:
    feed_result = await db.execute(select(Feed).where(Feed.code == feed_code))
    feed = feed_result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")
    member_result = await db.execute(
        select(FeedMember).where(and_(FeedMember.feed_id == feed.id, FeedMember.user_id == user.id))
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this feed")
    return member


# ─── Confessions ──────────────────────────────────────────────────────────────

@router.post("/feeds/{code}/confessions", status_code=201)
async def create_confession(
    code: str,
    body: CreateConfessionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await _get_member(db, code, user)
    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one()

    confession = Confession(feed_id=feed.id, author_id=member.id, content=body.content)
    db.add(confession)
    await db.commit()
    await db.refresh(confession)
    return {"id": confession.id, "content": confession.content, "reactions": confession.reactions, "created_at": str(confession.created_at)}


@router.get("/feeds/{code}/confessions")
async def list_confessions(
    code: str,
    limit: int = 30,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await _get_member(db, code, user)
    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one()

    result = await db.execute(
        select(Confession)
        .where(and_(Confession.feed_id == feed.id, Confession.is_reported == False))
        .order_by(Confession.created_at.desc())
        .offset(offset)
        .limit(min(limit, 50))
    )
    confessions = result.scalars().all()
    return [{"id": c.id, "content": c.content, "reactions": c.reactions, "created_at": str(c.created_at)} for c in confessions]


@router.post("/confessions/{confession_id}/react")
async def react_confession(
    confession_id: str,
    body: ReactRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Confession).where(Confession.id == confession_id))
    confession = result.scalar_one_or_none()
    if not confession:
        raise HTTPException(status_code=404, detail="Confession not found")

    reactions = dict(confession.reactions or {})
    reactions[body.emoji] = reactions.get(body.emoji, 0) + 1
    confession.reactions = reactions
    await db.commit()
    return {"reactions": confession.reactions}


@router.post("/confessions/{confession_id}/report")
async def report_confession(
    confession_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Confession).where(Confession.id == confession_id))
    confession = result.scalar_one_or_none()
    if not confession:
        raise HTTPException(status_code=404, detail="Confession not found")
    confession.is_reported = True
    await db.commit()
    return {"status": "reported"}


# ─── Secret Crush ─────────────────────────────────────────────────────────────

@router.post("/feeds/{code}/crush")
async def set_crush(
    code: str,
    body: SetCrushRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await _get_member(db, code, user)
    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one()

    if body.to_member_id == member.id:
        raise HTTPException(status_code=400, detail="Cannot set crush on yourself")

    # Verify target exists in feed
    target_result = await db.execute(
        select(FeedMember).where(and_(FeedMember.id == body.to_member_id, FeedMember.feed_id == feed.id))
    )
    if not target_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Member not found in this feed")

    # Upsert: remove old crush in this feed, set new one
    old_result = await db.execute(
        select(Crush).where(and_(Crush.feed_id == feed.id, Crush.from_member_id == member.id))
    )
    old = old_result.scalar_one_or_none()
    if old:
        await db.delete(old)

    crush = Crush(feed_id=feed.id, from_member_id=member.id, to_member_id=body.to_member_id)

    # Check if it's a match (target also has crush on this member)
    reverse_result = await db.execute(
        select(Crush).where(and_(
            Crush.feed_id == feed.id,
            Crush.from_member_id == body.to_member_id,
            Crush.to_member_id == member.id,
        ))
    )
    reverse = reverse_result.scalar_one_or_none()
    if reverse:
        crush.is_matched = True
        reverse.is_matched = True

    db.add(crush)
    await db.commit()

    return {"is_matched": crush.is_matched}


@router.get("/feeds/{code}/crush", response_model=CrushStatusOut)
async def get_crush_status(
    code: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await _get_member(db, code, user)
    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one()

    result = await db.execute(
        select(Crush).where(and_(Crush.feed_id == feed.id, Crush.from_member_id == member.id))
    )
    crush = result.scalar_one_or_none()

    if not crush:
        return CrushStatusOut(has_crush=False)

    match_username = None
    if crush.is_matched:
        target_result = await db.execute(select(FeedMember).where(FeedMember.id == crush.to_member_id))
        target = target_result.scalar_one_or_none()
        match_username = target.username if target else None

    return CrushStatusOut(
        has_crush=True,
        crush_member_id=crush.to_member_id,
        is_matched=crush.is_matched,
        match_username=match_username,
    )


@router.delete("/feeds/{code}/crush")
async def remove_crush(
    code: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    member = await _get_member(db, code, user)
    feed_result = await db.execute(select(Feed).where(Feed.code == code))
    feed = feed_result.scalar_one()

    result = await db.execute(
        select(Crush).where(and_(Crush.feed_id == feed.id, Crush.from_member_id == member.id))
    )
    crush = result.scalar_one_or_none()
    if crush:
        # If was matched, un-match the other side
        if crush.is_matched:
            reverse_result = await db.execute(
                select(Crush).where(and_(
                    Crush.feed_id == feed.id,
                    Crush.from_member_id == crush.to_member_id,
                    Crush.to_member_id == member.id,
                ))
            )
            reverse = reverse_result.scalar_one_or_none()
            if reverse:
                reverse.is_matched = False
        await db.delete(crush)
        await db.commit()
    return {"status": "removed"}
