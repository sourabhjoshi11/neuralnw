"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-01-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    op.create_table(
        'users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('phone_encrypted', sa.Text, nullable=False),
        sa.Column('phone_hash', sa.CHAR(64), nullable=False, unique=True),
        sa.Column('name_encrypted', sa.Text, nullable=False),
        sa.Column('is_premium', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('is_banned', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('strike_count', sa.SmallInteger, nullable=False, server_default='0'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_users_phone_hash', 'users', ['phone_hash'])

    op.create_table(
        'rooms',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('code', sa.CHAR(6), nullable=False, unique=True),
        sa.Column('host_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='waiting'),
        sa.Column('duration_minutes', sa.SmallInteger, nullable=False),
        sa.Column('starts_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('ends_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('current_turn_player_id', sa.String(36), nullable=True),
        sa.Column('current_phase', sa.String(30), nullable=False, server_default='lobby'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_rooms_code', 'rooms', ['code'])

    op.create_table(
        'anon_players',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('room_id', sa.String(36), sa.ForeignKey('rooms.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('username', sa.String(64), nullable=False),
        sa.Column('color', sa.CHAR(7), nullable=False),
        sa.Column('points', sa.Integer, nullable=False, server_default='0'),
        sa.Column('lives', sa.SmallInteger, nullable=False, server_default='1'),
        sa.Column('skips_used', sa.SmallInteger, nullable=False, server_default='0'),
        sa.Column('is_blacked_out', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('blackout_ends_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('turn_count', sa.SmallInteger, nullable=False, server_default='0'),
        sa.Column('last_turn_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('is_banned', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('join_order', sa.SmallInteger, nullable=False, server_default='1'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.UniqueConstraint('room_id', 'user_id', name='uq_anon_players_room_user'),
    )
    op.create_index('idx_anon_players_room_id', 'anon_players', ['room_id'])
    op.create_index('idx_anon_players_user_id', 'anon_players', ['user_id'])

    op.create_table(
        'truth_or_dare',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('type', sa.String(5), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('points', sa.SmallInteger, nullable=False),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
    )
    op.create_index('idx_tod_type_active', 'truth_or_dare', ['type'])

    op.create_table(
        'game_rounds',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('room_id', sa.String(36), sa.ForeignKey('rooms.id', ondelete='CASCADE'), nullable=False),
        sa.Column('player_id', sa.String(36), sa.ForeignKey('anon_players.id', ondelete='CASCADE'), nullable=False),
        sa.Column('choice', sa.String(5), nullable=True),
        sa.Column('content_id', sa.String(36), sa.ForeignKey('truth_or_dare.id'), nullable=True),
        sa.Column('answer', sa.Text, nullable=True),
        sa.Column('phase', sa.String(30), nullable=False, server_default='spinning'),
        sa.Column('phase_ends_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('dare_passed', sa.Boolean, nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_game_rounds_room_id', 'game_rounds', ['room_id'])

    op.create_table(
        'votes',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('round_id', sa.String(36), sa.ForeignKey('game_rounds.id', ondelete='CASCADE'), nullable=False),
        sa.Column('player_id', sa.String(36), sa.ForeignKey('anon_players.id', ondelete='CASCADE'), nullable=False),
        sa.Column('value', sa.String(5), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.UniqueConstraint('round_id', 'player_id', name='uq_votes_round_player'),
    )
    op.create_index('idx_votes_round_id', 'votes', ['round_id'])

    op.create_table(
        'reactions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('round_id', sa.String(36), sa.ForeignKey('game_rounds.id', ondelete='CASCADE'), nullable=False),
        sa.Column('player_id', sa.String(36), sa.ForeignKey('anon_players.id', ondelete='CASCADE'), nullable=False),
        sa.Column('emoji', sa.String(4), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_reactions_round_id', 'reactions', ['round_id'])

    op.create_table(
        'comments',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('round_id', sa.String(36), sa.ForeignKey('game_rounds.id', ondelete='CASCADE'), nullable=False),
        sa.Column('player_id', sa.String(36), sa.ForeignKey('anon_players.id', ondelete='CASCADE'), nullable=False),
        sa.Column('text', sa.Text, nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_comments_round_id', 'comments', ['round_id'])

    op.create_table(
        'feeds',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('code', sa.String(8), nullable=False, unique=True),
        sa.Column('admin_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('member_count', sa.Integer, nullable=False, server_default='1'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )
    op.create_index('idx_feeds_code', 'feeds', ['code'])

    op.create_table(
        'feed_members',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('feed_id', sa.String(36), sa.ForeignKey('feeds.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('username', sa.String(64), nullable=False),
        sa.Column('is_admin', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('is_banned', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('strike_count', sa.SmallInteger, nullable=False, server_default='0'),
        sa.Column('weekly_message_count', sa.SmallInteger, nullable=False, server_default='0'),
        sa.Column('week_resets_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('joined_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.UniqueConstraint('feed_id', 'user_id', name='uq_feed_members_feed_user'),
    )
    op.create_index('idx_feed_members_feed_id', 'feed_members', ['feed_id'])
    op.create_index('idx_feed_members_user_id', 'feed_members', ['user_id'])

    op.create_table(
        'feed_messages',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('feed_id', sa.String(36), sa.ForeignKey('feeds.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sender_id', sa.String(36), sa.ForeignKey('feed_members.id', ondelete='CASCADE'), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('reply_to_id', sa.String(36), sa.ForeignKey('feed_messages.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reactions', sa.JSON, nullable=False, server_default='{}'),
        sa.Column('is_deleted', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('expires_at', sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.text("NOW() + INTERVAL '24 hours'")),
    )
    op.create_index('idx_feed_messages_feed_id', 'feed_messages', ['feed_id', 'created_at'])
    op.create_index('idx_feed_messages_expires_at', 'feed_messages', ['expires_at'])

    op.create_table(
        'banned_phones',
        sa.Column('phone_hash', sa.CHAR(64), primary_key=True),
        sa.Column('reason', sa.Text, nullable=True),
        sa.Column('banned_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )


def downgrade() -> None:
    op.drop_table('banned_phones')
    op.drop_table('feed_messages')
    op.drop_table('feed_members')
    op.drop_table('feeds')
    op.drop_table('comments')
    op.drop_table('reactions')
    op.drop_table('votes')
    op.drop_table('game_rounds')
    op.drop_table('truth_or_dare')
    op.drop_table('anon_players')
    op.drop_table('rooms')
    op.drop_table('users')
