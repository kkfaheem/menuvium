"""add menu logo url

Revision ID: c19a6d3d2f0a
Revises: 2c3d7f8a1b9e
Create Date: 2026-01-07 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c19a6d3d2f0a"
down_revision = "2c3d7f8a1b9e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("menu", sa.Column("logo_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("menu", "logo_url")
