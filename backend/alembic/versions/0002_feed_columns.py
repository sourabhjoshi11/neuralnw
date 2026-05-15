"""add edited_at, is_pinned to feed_messages; pinned_message_id to feeds

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-16 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # feed_messages: new columns
    op.add_column('feed_messages', sa.Column('edited_at', sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column('feed_messages', sa.Column('is_pinned', sa.Boolean, nullable=False, server_default='false'))

    # feeds: pinned message reference
    op.add_column('feeds', sa.Column('pinned_message_id', sa.String(36), nullable=True))


def downgrade() -> None:
    op.drop_column('feed_messages', 'edited_at')
    op.drop_column('feed_messages', 'is_pinned')
    op.drop_column('feeds', 'pinned_message_id')
