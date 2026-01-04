"""add menu banner url

Revision ID: f4c1e2a9b7d6
Revises: e1c7b5a3f4b2
Create Date: 2026-01-03 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f4c1e2a9b7d6"
down_revision = "e1c7b5a3f4b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("menu", sa.Column("banner_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("menu", "banner_url")
