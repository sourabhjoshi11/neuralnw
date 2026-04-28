"""
Local in-process schema test using SQLite (no Supabase needed).
Verifies all models create correctly and basic CRUD works.
Run: python -m scripts.test_schema_local
"""
import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select, text

# Import all models to register with Base
from app.db.base import Base
from app.models.user import User
from app.models.game import Room, AnonPlayer, TruthOrDare, GameRound
from app.models.feed import Feed, FeedMember, FeedMessage


async def run_tests() -> bool:
    # Use in-memory SQLite for local testing
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    passed = True
    print("\nRunning schema tests...\n")

    async with SessionLocal() as db:
        # --- Users ---
        user = User(
            id=str(uuid.uuid4()),
            phone_encrypted="enc_phone",
            phone_hash="a" * 64,
            name_encrypted="enc_name",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        assert user.id, "User ID missing"
        assert user.is_premium is False
        assert user.is_banned is False
        print("  ✅  User: create + defaults")

        # --- Room ---
        room = Room(
            id=str(uuid.uuid4()),
            code="123456",
            host_id=user.id,
            duration_minutes=30,
        )
        db.add(room)
        await db.commit()
        await db.refresh(room)
        assert room.status == "waiting"
        print("  ✅  Room: create + defaults")

        # --- AnonPlayer ---
        player = AnonPlayer(
            id=str(uuid.uuid4()),
            room_id=room.id,
            user_id=user.id,
            username="SleepyPanda",
            color="#3b82f6",
        )
        db.add(player)
        await db.commit()
        await db.refresh(player)
        assert player.points == 0
        assert player.lives == 1
        print("  ✅  AnonPlayer: create + defaults")

        # --- TruthOrDare ---
        tod = TruthOrDare(
            id=str(uuid.uuid4()),
            type="truth",
            content="Have you ever cheated on a test?",
            points=10,
        )
        db.add(tod)
        await db.commit()
        await db.refresh(tod)
        assert tod.is_active is True
        print("  ✅  TruthOrDare: create + defaults")

        # --- GameRound ---
        gr = GameRound(
            id=str(uuid.uuid4()),
            room_id=room.id,
            player_id=player.id,
            choice="truth",
            content_id=tod.id,
        )
        db.add(gr)
        await db.commit()
        await db.refresh(gr)
        assert gr.phase == "spinning"
        print("  ✅  GameRound: create + defaults")

        # --- Points update ---
        player.points += 10
        player.turn_count += 1
        player.last_turn_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(player)
        assert player.points == 10
        assert player.turn_count == 1
        print("  ✅  AnonPlayer: points + turn_count update")

        # --- Feed ---
        feed = Feed(
            id=str(uuid.uuid4()),
            code="ABCD1234",
            admin_id=user.id,
            name="CS-A Batch 2024",
        )
        db.add(feed)
        await db.commit()
        await db.refresh(feed)
        assert feed.member_count == 1
        print("  ✅  Feed: create + defaults")

        # --- FeedMember ---
        member = FeedMember(
            id=str(uuid.uuid4()),
            feed_id=feed.id,
            user_id=user.id,
            username="BiryaniLover",
            is_admin=True,
        )
        db.add(member)
        await db.commit()
        await db.refresh(member)
        assert member.is_admin is True
        assert member.strike_count == 0
        print("  ✅  FeedMember: create + defaults")

        # --- FeedMessage ---
        now = datetime.now(timezone.utc)
        msg = FeedMessage(
            id=str(uuid.uuid4()),
            feed_id=feed.id,
            sender_id=member.id,
            content="Hello anonymous world!",
            expires_at=now + timedelta(hours=24),
        )
        db.add(msg)
        await db.commit()
        await db.refresh(msg)
        assert msg.is_deleted is False
        assert msg.reactions == {}
        print("  ✅  FeedMessage: create + defaults")

        # --- Query: live messages ---
        result = await db.execute(
            select(FeedMessage).where(
                FeedMessage.feed_id == feed.id,
                FeedMessage.expires_at > now,
                FeedMessage.is_deleted == False,
            )
        )
        msgs = result.scalars().all()
        assert len(msgs) == 1
        print("  ✅  FeedMessage: live messages query")

        # --- Blackout ---
        player.is_blacked_out = True
        player.blackout_ends_at = now + timedelta(minutes=2)
        await db.commit()
        await db.refresh(player)
        assert player.is_blacked_out is True
        print("  ✅  AnonPlayer: blackout state")

        # --- Room end ---
        room.status = "ended"
        await db.commit()
        await db.refresh(room)
        assert room.status == "ended"
        print("  ✅  Room: status → ended")

    await engine.dispose()

    print(f"\n{'✅  All schema tests passed!' if passed else '❌  Some tests failed'}\n")
    return passed


if __name__ == "__main__":
    # Need aiosqlite for local tests
    try:
        import aiosqlite  # noqa
    except ImportError:
        print("Installing aiosqlite for local tests...")
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "aiosqlite", "-q"], check=True)

    ok = asyncio.run(run_tests())
    sys.exit(0 if ok else 1)
