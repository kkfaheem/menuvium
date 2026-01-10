"""add menu title design config

Revision ID: 8a4e6f9d0b12
Revises: c19a6d3d2f0a
Create Date: 2026-01-08 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "8a4e6f9d0b12"
down_revision = "c19a6d3d2f0a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("menu", sa.Column("title_design_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("menu", "title_design_config")

