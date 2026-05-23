"""add msg_type, poll_options, poll_votes, media_url to feed_messages

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-17 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('feed_messages', sa.Column('msg_type', sa.String(16), nullable=False, server_default='text'))
    op.add_column('feed_messages', sa.Column('poll_options', sa.JSON, nullable=True))
    op.add_column('feed_messages', sa.Column('poll_votes', sa.JSON, nullable=True))
    op.add_column('feed_messages', sa.Column('media_url', sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column('feed_messages', 'msg_type')
    op.drop_column('feed_messages', 'poll_options')
    op.drop_column('feed_messages', 'poll_votes')
    op.drop_column('feed_messages', 'media_url')
