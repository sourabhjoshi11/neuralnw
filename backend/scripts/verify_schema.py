"""
Verify all tables exist and have the expected columns.
Run: python -m scripts.verify_schema
Requires DATABASE_URL in environment.
"""
import asyncio
import os
import sys

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

EXPECTED_TABLES = {
    "users": ["id", "phone_encrypted", "phone_hash", "name_encrypted", "is_premium", "is_banned", "strike_count", "created_at", "updated_at"],
    "rooms": ["id", "code", "host_id", "status", "duration_minutes", "starts_at", "ends_at", "current_turn_player_id", "current_phase", "created_at"],
    "anon_players": ["id", "room_id", "user_id", "username", "color", "points", "lives", "skips_used", "is_blacked_out", "blackout_ends_at", "turn_count", "last_turn_at", "is_banned", "join_order", "created_at"],
    "truth_or_dare": ["id", "type", "content", "points", "is_active"],
    "game_rounds": ["id", "room_id", "player_id", "choice", "content_id", "answer", "phase", "phase_ends_at", "dare_passed", "created_at"],
    "votes": ["id", "round_id", "player_id", "value", "created_at"],
    "reactions": ["id", "round_id", "player_id", "emoji", "created_at"],
    "comments": ["id", "round_id", "player_id", "text", "created_at"],
    "feeds": ["id", "code", "admin_id", "name", "member_count", "created_at"],
    "feed_members": ["id", "feed_id", "user_id", "username", "is_admin", "is_banned", "strike_count", "weekly_message_count", "week_resets_at", "joined_at"],
    "feed_messages": ["id", "feed_id", "sender_id", "content", "reply_to_id", "reactions", "is_deleted", "created_at", "expires_at"],
    "banned_phones": ["phone_hash", "reason", "banned_at"],
}


async def verify(url: str) -> bool:
    engine = create_async_engine(url)
    passed = True

    async with engine.connect() as conn:
        # Check tables exist
        result = await conn.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        )
        existing = {row[0] for row in result}

        for table, cols in EXPECTED_TABLES.items():
            if table not in existing:
                print(f"  ❌  MISSING table: {table}")
                passed = False
                continue

            col_result = await conn.execute(
                text(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table}'")
            )
            existing_cols = {row[0] for row in col_result}
            missing_cols = set(cols) - existing_cols
            if missing_cols:
                print(f"  ❌  {table}: missing columns {missing_cols}")
                passed = False
            else:
                print(f"  ✅  {table} ({len(cols)} columns)")

        # Check truth_or_dare has rows
        count = await conn.execute(text("SELECT COUNT(*) FROM truth_or_dare"))
        n = count.scalar()
        if n and n >= 20:
            print(f"  ✅  truth_or_dare seed: {n} rows")
        else:
            print(f"  ⚠️   truth_or_dare seed: only {n} rows (expected ≥ 20)")

    await engine.dispose()
    return passed


if __name__ == "__main__":
    url = os.getenv("DATABASE_URL", "")
    if not url:
        print("❌  DATABASE_URL not set")
        sys.exit(1)
    ok = asyncio.run(verify(url))
    sys.exit(0 if ok else 1)
