"""add seen_by to feed_messages

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-17 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('feed_messages', sa.Column('seen_by', sa.JSON, nullable=True, server_default='[]'))


def downgrade() -> None:
    op.drop_column('feed_messages', 'seen_by')
