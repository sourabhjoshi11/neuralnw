"""
Phase 5 integration tests for the game engine.
Uses in-memory SQLite via aiosqlite.
"""
import asyncio
import sys
import os

# Set required env vars before any app imports
os.environ.setdefault("SECRET_KEY", "test-secret-key-32-chars-padded!!")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENCRYPTION_KEY", "dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1jaA==")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import select

from app.db.base import Base
from app.models.game import Room, AnonPlayer, GameRound, Vote, Reaction, Comment, TruthOrDare
from app.models.user import User
from app.services import game_engine
from app.services.phase_timer import phase_timer


ENGINE = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
SessionLocal = async_sessionmaker(ENGINE, expire_on_commit=False, class_=AsyncSession)


async def setup_db():
    async with ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def make_user(db: AsyncSession, idx: int) -> User:
    u = User(
        id=f"user-{idx}",
        phone_hash=f"hash{idx}",
        phone_encrypted=f"phone-enc-{idx}",
        name_encrypted=f"name-enc-{idx}",
    )
    db.add(u)
    await db.flush()
    return u


async def make_player(db: AsyncSession, room: Room, user: User, order: int) -> AnonPlayer:
    p = AnonPlayer(
        room_id=room.id,
        user_id=user.id,
        username=f"Player{order}",
        color="#3b82f6",
        join_order=order,
        lives=1,
    )
    db.add(p)
    await db.flush()
    return p


async def seed_content(db: AsyncSession):
    for i in range(5):
        db.add(TruthOrDare(id=f"truth-{i}", type="truth", content=f"Truth {i}", points=10))
        db.add(TruthOrDare(id=f"dare-{i}", type="dare", content=f"Dare {i}", points=20))
    await db.flush()


# Patch room_manager to be a no-op in tests
class _NoopManager:
    async def broadcast(self, *args, **kwargs): pass
    def connect(self, *args, **kwargs): pass
    def disconnect(self, *args, **kwargs): pass

import app.services.room_manager as _rm_module
_rm_module.room_manager = _NoopManager()  # type: ignore
import app.services.game_engine as _ge_module
_ge_module.room_manager = _NoopManager()  # type: ignore


# ─── Tests ───────────────────────────────────────────────────────────────────

async def test_start_game():
    async with SessionLocal() as db:
        room = Room(id="r1", code="111111", host_id="user-1", duration_minutes=15)
        db.add(room)
        u1 = await make_user(db, 1)
        u2 = await make_user(db, 2)
        await db.flush()
        p1 = await make_player(db, room, u1, 1)
        p2 = await make_player(db, room, u2, 2)
        await db.commit()

        await game_engine.start_game("111111", db)

        r = await db.execute(select(Room).where(Room.code == "111111"))
        room_db = r.scalar_one()
        assert room_db.status == "active"
        assert room_db.starts_at is not None
        assert room_db.ends_at is not None
        assert room_db.current_phase == "spinning"
    print("  ✓ test_start_game")


async def test_start_game_too_few_players():
    async with SessionLocal() as db:
        room = Room(id="r2", code="222222", host_id="user-10", duration_minutes=15)
        db.add(room)
        u = await make_user(db, 10)
        await db.flush()
        await make_player(db, room, u, 1)
        await db.commit()

        try:
            await game_engine.start_game("222222", db)
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "2 players" in str(e)
    print("  ✓ test_start_game_too_few_players")


async def test_submit_choice_truth():
    async with SessionLocal() as db:
        room = Room(id="r3", code="333333", host_id="user-3", duration_minutes=15, status="active")
        db.add(room)
        u3 = await make_user(db, 3)
        u4 = await make_user(db, 4)
        await db.flush()
        p3 = await make_player(db, room, u3, 1)
        p4 = await make_player(db, room, u4, 2)

        round_ = GameRound(id="round-1", room_id=room.id, player_id=p3.id, phase="choice")
        db.add(round_)
        await db.commit()

        # Cancel any auto-scheduled timers
        phase_timer.cancel("333333")

        await game_engine.submit_choice("333333", "round-1", "truth", db)

        r = await db.execute(select(GameRound).where(GameRound.id == "round-1"))
        round_db = r.scalar_one()
        assert round_db.choice == "truth"
        assert round_db.phase == "truth_question"
        assert round_db.content_id is not None
        phase_timer.cancel("333333")
    print("  ✓ test_submit_choice_truth")


async def test_submit_answer():
    async with SessionLocal() as db:
        room = Room(id="r4", code="444444", host_id="user-5", duration_minutes=15, status="active")
        db.add(room)
        u5 = await make_user(db, 5)
        u6 = await make_user(db, 6)
        await db.flush()
        p5 = await make_player(db, room, u5, 1)
        p6 = await make_player(db, room, u6, 2)

        round_ = GameRound(
            id="round-2", room_id=room.id, player_id=p5.id,
            phase="truth_answer", choice="truth",
            content_id="truth-0",
        )
        db.add(round_)
        await db.commit()

        phase_timer.cancel("444444")
        await game_engine.submit_answer("444444", "round-2", "My answer", db)

        r = await db.execute(select(GameRound).where(GameRound.id == "round-2"))
        round_db = r.scalar_one()
        assert round_db.answer == "My answer"
        # submit_answer sets truth_revealed then immediately advances to reaction
        assert round_db.phase == "reaction"

        r2 = await db.execute(select(AnonPlayer).where(AnonPlayer.id == p5.id))
        player_db = r2.scalar_one()
        assert player_db.points == 10
        phase_timer.cancel("444444")
    print("  ✓ test_submit_answer")


async def test_cast_vote():
    async with SessionLocal() as db:
        room = Room(id="r5", code="555555", host_id="user-7", duration_minutes=15, status="active")
        db.add(room)
        u7 = await make_user(db, 7)
        u8 = await make_user(db, 8)
        await db.flush()
        p7 = await make_player(db, room, u7, 1)
        p8 = await make_player(db, room, u8, 2)

        round_ = GameRound(
            id="round-3", room_id=room.id, player_id=p7.id,
            phase="dare_vote", choice="dare",
        )
        db.add(round_)
        await db.commit()

        await game_engine.cast_vote("555555", "round-3", p8.id, "yes", db)

        r = await db.execute(select(Vote).where(Vote.round_id == "round-3"))
        votes = r.scalars().all()
        assert len(votes) == 1
        assert votes[0].value == "yes"

        # Idempotent — same player changes vote
        await game_engine.cast_vote("555555", "round-3", p8.id, "no", db)
        r2 = await db.execute(select(Vote).where(Vote.round_id == "round-3"))
        votes2 = r2.scalars().all()
        assert len(votes2) == 1
        assert votes2[0].value == "no"
    print("  ✓ test_cast_vote")


async def test_add_reaction():
    async with SessionLocal() as db:
        room = Room(id="r6", code="666666", host_id="user-9", duration_minutes=15, status="active")
        db.add(room)
        u9 = await make_user(db, 9)
        u11 = await make_user(db, 11)
        await db.flush()
        p9 = await make_player(db, room, u9, 1)
        p11 = await make_player(db, room, u11, 2)

        round_ = GameRound(
            id="round-4", room_id=room.id, player_id=p9.id,
            phase="reaction",
        )
        db.add(round_)
        await db.commit()

        await game_engine.add_reaction("666666", "round-4", p11.id, "🔥", db)

        r = await db.execute(select(Reaction).where(Reaction.round_id == "round-4"))
        reactions = r.scalars().all()
        assert len(reactions) == 1
        assert reactions[0].emoji == "🔥"

        # First reaction awards +1 point
        r2 = await db.execute(select(AnonPlayer).where(AnonPlayer.id == p11.id))
        player_db = r2.scalar_one()
        assert player_db.points == 1
    print("  ✓ test_add_reaction")


async def test_add_comment():
    async with SessionLocal() as db:
        room = Room(id="r7", code="777777", host_id="user-12", duration_minutes=15, status="active")
        db.add(room)
        u12 = await make_user(db, 12)
        u13 = await make_user(db, 13)
        await db.flush()
        p12 = await make_player(db, room, u12, 1)
        p13 = await make_player(db, room, u13, 2)

        round_ = GameRound(
            id="round-5", room_id=room.id, player_id=p12.id,
            phase="reaction",
        )
        db.add(round_)
        await db.commit()

        await game_engine.add_comment("777777", "round-5", p13.id, "LOL amazing!", db)

        r = await db.execute(select(Comment).where(Comment.round_id == "round-5"))
        comments = r.scalars().all()
        assert len(comments) == 1
        assert comments[0].text == "LOL amazing!"
    print("  ✓ test_add_comment")


async def test_skip_uses_life():
    async with SessionLocal() as db:
        room = Room(id="r8", code="888888", host_id="user-14", duration_minutes=15, status="active",
                    current_turn_player_id="p14-id")
        db.add(room)
        u14 = await make_user(db, 14)
        u15 = await make_user(db, 15)
        await db.flush()

        p14 = AnonPlayer(
            id="p14-id", room_id=room.id, user_id=u14.id,
            username="PlayerA", color="#3b82f6", join_order=1, lives=1, points=10,
        )
        db.add(p14)
        p15 = await make_player(db, room, u15, 2)

        round_ = GameRound(
            id="round-6", room_id=room.id, player_id="p14-id", phase="choice",
        )
        db.add(round_)
        await db.commit()

        phase_timer.cancel("888888")
        await game_engine.handle_skip("888888", "p14-id", db)

        r = await db.execute(select(AnonPlayer).where(AnonPlayer.id == "p14-id"))
        player_db = r.scalar_one()
        assert player_db.lives == 0
        assert player_db.points == 5  # 10 - 5 penalty
        phase_timer.cancel("888888")
    print("  ✓ test_skip_uses_life")


async def test_get_room_state():
    async with SessionLocal() as db:
        room = Room(id="r9", code="999999", host_id="user-16", duration_minutes=15, status="active")
        db.add(room)
        u16 = await make_user(db, 16)
        await db.flush()
        await make_player(db, room, u16, 1)
        await db.commit()

        state = await game_engine.get_room_state("999999", db)
        assert state["room"]["code"] == "999999"
        assert state["room"]["status"] == "active"
        assert len(state["players"]) == 1
        assert state["round"] is None
        assert "server_time" in state
    print("  ✓ test_get_room_state")


async def main():
    await setup_db()
    # Seed content once before all tests
    async with SessionLocal() as db:
        await seed_content(db)
        await db.commit()
    phase_timer.cancel_all()

    tests = [
        test_start_game,
        test_start_game_too_few_players,
        test_submit_choice_truth,
        test_submit_answer,
        test_cast_vote,
        test_add_reaction,
        test_add_comment,
        test_skip_uses_life,
        test_get_room_state,
    ]

    passed = 0
    failed = 0
    for t in tests:
        try:
            await t()
            passed += 1
        except Exception as e:
            print(f"  ✗ {t.__name__}: {e}")
            import traceback; traceback.print_exc()
            failed += 1

    phase_timer.cancel_all()
    print(f"\n{'='*40}")
    print(f"Results: {passed} passed, {failed} failed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
