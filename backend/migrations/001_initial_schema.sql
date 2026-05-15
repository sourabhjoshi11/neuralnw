-- ============================================================
-- ClassChaos — Initial Schema
-- Run against Supabase PostgreSQL (pgcrypto extension required)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_encrypted   TEXT        NOT NULL,                  -- Fernet-encrypted phone
    phone_hash        CHAR(64)    NOT NULL UNIQUE,           -- SHA-256 for uniqueness lookup
    name_encrypted    TEXT        NOT NULL,                  -- Fernet-encrypted real name
    is_premium        BOOLEAN     NOT NULL DEFAULT FALSE,
    is_banned         BOOLEAN     NOT NULL DEFAULT FALSE,
    strike_count      SMALLINT    NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON users (phone_hash);
CREATE INDEX IF NOT EXISTS idx_users_is_banned  ON users (is_banned) WHERE is_banned = TRUE;

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- GAME ROOMS
-- ============================================================
CREATE TABLE IF NOT EXISTS rooms (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code                     CHAR(6)     NOT NULL UNIQUE,
    host_id                  UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status                   VARCHAR(20) NOT NULL DEFAULT 'waiting'
                                         CHECK (status IN ('waiting','active','ended')),
    duration_minutes         SMALLINT    NOT NULL CHECK (duration_minutes IN (15,30,45,60)),
    starts_at                TIMESTAMPTZ,
    ends_at                  TIMESTAMPTZ,
    current_turn_player_id   UUID,
    current_phase            VARCHAR(30) NOT NULL DEFAULT 'lobby',
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_code       ON rooms (code);
CREATE INDEX IF NOT EXISTS idx_rooms_status     ON rooms (status) WHERE status != 'ended';
CREATE INDEX IF NOT EXISTS idx_rooms_ends_at    ON rooms (ends_at) WHERE status = 'active';

-- ============================================================
-- ANONYMOUS PLAYERS (per-room identity)
-- ============================================================
CREATE TABLE IF NOT EXISTS anon_players (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id           UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    username          VARCHAR(64) NOT NULL,
    color             CHAR(7)     NOT NULL,                  -- hex color e.g. #3b82f6
    points            INT         NOT NULL DEFAULT 0,
    lives             SMALLINT    NOT NULL DEFAULT 1,
    skips_used        SMALLINT    NOT NULL DEFAULT 0,
    is_blacked_out    BOOLEAN     NOT NULL DEFAULT FALSE,
    blackout_ends_at  TIMESTAMPTZ,
    turn_count        SMALLINT    NOT NULL DEFAULT 0,
    last_turn_at      TIMESTAMPTZ,
    is_banned         BOOLEAN     NOT NULL DEFAULT FALSE,
    join_order        SMALLINT    NOT NULL DEFAULT 1,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_anon_players_room_id   ON anon_players (room_id);
CREATE INDEX IF NOT EXISTS idx_anon_players_user_id   ON anon_players (user_id);
CREATE INDEX IF NOT EXISTS idx_anon_players_blackout  ON anon_players (blackout_ends_at)
    WHERE is_blacked_out = TRUE;

-- ============================================================
-- TRUTH OR DARE CONTENT POOL
-- ============================================================
CREATE TABLE IF NOT EXISTS truth_or_dare (
    id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    type      VARCHAR(5)  NOT NULL CHECK (type IN ('truth','dare')),
    content   TEXT        NOT NULL,
    points    SMALLINT    NOT NULL,
    is_active BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_tod_type_active ON truth_or_dare (type) WHERE is_active = TRUE;

-- ============================================================
-- GAME ROUNDS (one per spin)
-- ============================================================
CREATE TABLE IF NOT EXISTS game_rounds (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id        UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id      UUID        NOT NULL REFERENCES anon_players(id) ON DELETE CASCADE,
    choice         VARCHAR(5)  CHECK (choice IN ('truth','dare')),
    content_id     UUID        REFERENCES truth_or_dare(id),
    answer         TEXT,
    phase          VARCHAR(30) NOT NULL DEFAULT 'spinning',
    phase_ends_at  TIMESTAMPTZ,
    dare_passed    BOOLEAN,                                  -- NULL = pending vote
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_rounds_room_id ON game_rounds (room_id);
CREATE INDEX IF NOT EXISTS idx_game_rounds_active  ON game_rounds (room_id, created_at DESC)
    WHERE phase != 'done';

-- ============================================================
-- VOTES (dare completion / punishment / report)
-- ============================================================
CREATE TABLE IF NOT EXISTS votes (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id   UUID        NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
    player_id  UUID        NOT NULL REFERENCES anon_players(id) ON DELETE CASCADE,
    value      VARCHAR(5)  NOT NULL CHECK (value IN ('yes','no','a','b')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (round_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_round_id ON votes (round_id);

-- ============================================================
-- REACTIONS (emoji per round)
-- ============================================================
CREATE TABLE IF NOT EXISTS reactions (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id   UUID        NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
    player_id  UUID        NOT NULL REFERENCES anon_players(id) ON DELETE CASCADE,
    emoji      VARCHAR(4)  NOT NULL CHECK (emoji IN ('😂','😱','🔥','❤️','💀')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reactions_round_id ON reactions (round_id);

-- ============================================================
-- COMMENTS (1-min reaction window)
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id   UUID        NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
    player_id  UUID        NOT NULL REFERENCES anon_players(id) ON DELETE CASCADE,
    text       TEXT        NOT NULL CHECK (char_length(text) BETWEEN 1 AND 280),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_round_id ON comments (round_id);

-- ============================================================
-- CLASS FEEDS
-- ============================================================
CREATE TABLE IF NOT EXISTS feeds (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    code         VARCHAR(8)   NOT NULL UNIQUE,
    admin_id     UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    name         VARCHAR(100) NOT NULL,
    member_count INT          NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feeds_code ON feeds (code);

-- ============================================================
-- FEED MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS feed_members (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id              UUID        NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    user_id              UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    username             VARCHAR(64) NOT NULL,
    is_admin             BOOLEAN     NOT NULL DEFAULT FALSE,
    is_banned            BOOLEAN     NOT NULL DEFAULT FALSE,
    strike_count         SMALLINT    NOT NULL DEFAULT 0,
    weekly_message_count SMALLINT    NOT NULL DEFAULT 0,
    week_resets_at       TIMESTAMPTZ,
    joined_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (feed_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_members_feed_id ON feed_members (feed_id);
CREATE INDEX IF NOT EXISTS idx_feed_members_user_id ON feed_members (user_id);

-- ============================================================
-- FEED MESSAGES (24h TTL)
-- ============================================================
CREATE TABLE IF NOT EXISTS feed_messages (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id     UUID        NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    sender_id   UUID        NOT NULL REFERENCES feed_members(id) ON DELETE CASCADE,
    content     TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
    reply_to_id UUID        REFERENCES feed_messages(id) ON DELETE SET NULL,
    reactions   JSONB       NOT NULL DEFAULT '{}',
    is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_feed_messages_feed_id    ON feed_messages (feed_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_feed_messages_expires_at ON feed_messages (expires_at);
CREATE INDEX IF NOT EXISTS idx_feed_messages_live       ON feed_messages (feed_id, expires_at)
    WHERE is_deleted = FALSE;

-- ============================================================
-- BANNED PHONES (permanent blacklist — stores hash only)
-- ============================================================
CREATE TABLE IF NOT EXISTS banned_phones (
    phone_hash  CHAR(64)    PRIMARY KEY,
    reason      TEXT,
    banned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE anon_players   ENABLE ROW LEVEL SECURITY;
ALTER TABLE truth_or_dare  ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rounds    ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE feeds          ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE banned_phones  ENABLE ROW LEVEL SECURITY;

-- Service role (backend) bypasses RLS — no policies needed for it.
-- The policies below guard direct Supabase client access (anon/authenticated roles).

-- USERS: users can only read their own row
CREATE POLICY users_select_own ON users
    FOR SELECT USING (auth.uid()::text = id::text);

-- ROOMS: any authenticated user can read active/waiting rooms
CREATE POLICY rooms_select ON rooms
    FOR SELECT TO authenticated USING (TRUE);

-- ANON PLAYERS: readable by anyone in the same room (handled server-side)
CREATE POLICY anon_players_select ON anon_players
    FOR SELECT TO authenticated USING (TRUE);

-- TRUTH OR DARE: readable by authenticated users
CREATE POLICY tod_select ON truth_or_dare
    FOR SELECT TO authenticated USING (is_active = TRUE);

-- GAME ROUNDS: readable by authenticated users
CREATE POLICY rounds_select ON game_rounds
    FOR SELECT TO authenticated USING (TRUE);

-- VOTES: readable by authenticated users
CREATE POLICY votes_select ON votes
    FOR SELECT TO authenticated USING (TRUE);

-- REACTIONS: readable by authenticated users
CREATE POLICY reactions_select ON reactions
    FOR SELECT TO authenticated USING (TRUE);

-- COMMENTS: readable by authenticated users
CREATE POLICY comments_select ON comments
    FOR SELECT TO authenticated USING (TRUE);

-- FEEDS: readable by authenticated users
CREATE POLICY feeds_select ON feeds
    FOR SELECT TO authenticated USING (TRUE);

-- FEED MEMBERS: readable by authenticated users
CREATE POLICY feed_members_select ON feed_members
    FOR SELECT TO authenticated USING (TRUE);

-- FEED MESSAGES: readable by authenticated users, only live messages
CREATE POLICY feed_messages_select ON feed_messages
    FOR SELECT TO authenticated
    USING (is_deleted = FALSE AND expires_at > NOW());

-- BANNED PHONES: no direct client access
CREATE POLICY banned_phones_no_access ON banned_phones
    FOR ALL USING (FALSE);

-- ============================================================
-- AUTO-EXPIRE FEED MESSAGES (pg_cron job — enable in Supabase)
-- ============================================================
-- Run this after enabling the pg_cron extension in Supabase dashboard:
--
-- SELECT cron.schedule(
--   'delete-expired-feed-messages',
--   '*/15 * * * *',
--   $$DELETE FROM feed_messages WHERE expires_at < NOW()$$
-- );
--
-- SELECT cron.schedule(
--   'end-expired-rooms',
--   '* * * * *',
--   $$UPDATE rooms SET status = 'ended' WHERE status = 'active' AND ends_at < NOW()$$
-- );
