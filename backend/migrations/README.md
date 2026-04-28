# Database Setup — ClassChaos

## Option A: Supabase (Production)

1. Go to your Supabase project → SQL Editor
2. Run `001_initial_schema.sql` — creates all tables, indexes, RLS policies
3. Run `002_seed_truth_dare.sql` — seeds 100 truth + dare questions
4. Enable pg_cron extension in Supabase dashboard, then run the cron jobs
   at the bottom of `001_initial_schema.sql`

## Option B: Alembic (Self-hosted PostgreSQL)

```bash
cd backend
cp .env.example .env        # fill in DATABASE_URL and other secrets
alembic upgrade head        # runs 0001_initial_schema migration
python -m scripts.verify_schema   # confirms all tables + columns exist
```

## Option C: Auto-create on startup (Development only)

Set `APP_ENV=development` in `.env`. The FastAPI lifespan hook calls
`Base.metadata.create_all()` on startup — creates tables if missing.
Does NOT run RLS or seed data.

## Run local schema tests (no DB needed)

```bash
python -m scripts.test_schema_local
```

## Key design decisions

| Decision | Reason |
|---|---|
| `phone_hash` (SHA-256) stored separately from `phone_encrypted` | Enables O(1) uniqueness lookup without decrypting |
| Fernet symmetric encryption for phone + name | Reversible for identity reveal; key lives in env only |
| `expires_at` column on feed_messages | Enables index-based TTL sweep; pg_cron deletes every 15 min |
| `anon_players.join_order` | Used for dice-mode player number assignment (>20 players) |
| `rooms.current_phase` | Single source of truth — all clients sync from this field on reconnect |
| `banned_phones` table stores hash only | Cannot reverse-engineer phone from a ban record |
