"""add chor sipahi tables

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-17 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0006'
down_revision: Union[str, None] = '0005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'cs_rooms',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('code', sa.String(6), nullable=False, unique=True, index=True),
        sa.Column('host_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='waiting'),
        sa.Column('mode', sa.String(20), nullable=False, server_default='quick'),
        sa.Column('phase', sa.String(30), nullable=False, server_default='lobby'),
        sa.Column('current_round', sa.Integer, nullable=False, server_default='0'),
        sa.Column('max_players', sa.Integer, nullable=False, server_default='6'),
        sa.Column('phase_ends_at', sa.String(40), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        'cs_players',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('room_id', sa.String(36), sa.ForeignKey('cs_rooms.id'), nullable=False, index=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('username', sa.String(64), nullable=False),
        sa.Column('color', sa.String(7), nullable=False),
        sa.Column('points', sa.Integer, nullable=False, server_default='0'),
        sa.Column('join_order', sa.Integer, nullable=False, server_default='1'),
        sa.Column('is_bot', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('role', sa.String(20), nullable=True),
    )
    op.create_table(
        'cs_rounds',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('room_id', sa.String(36), sa.ForeignKey('cs_rooms.id'), nullable=False, index=True),
        sa.Column('round_number', sa.Integer, nullable=False),
        sa.Column('raja_id', sa.String(36), nullable=True),
        sa.Column('mantri_id', sa.String(36), nullable=True),
        sa.Column('sipahi_id', sa.String(36), nullable=True),
        sa.Column('chor_id', sa.String(36), nullable=True),
        sa.Column('guess_chor_id', sa.String(36), nullable=True),
        sa.Column('guess_sipahi_id', sa.String(36), nullable=True),
        sa.Column('chor_caught', sa.Boolean, nullable=True),
        sa.Column('points_awarded', sa.JSON, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('cs_rounds')
    op.drop_table('cs_players')
    op.drop_table('cs_rooms')
