"""add menu show_item_images

Revision ID: g5d2f1a8c3e7
Revises: c19a6d3d2f0a
Create Date: 2026-01-11 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "g5d2f1a8c3e7"
down_revision = "8a4e6f9d0b12"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("menu", sa.Column("show_item_images", sa.Boolean(), nullable=False, server_default=sa.text("true")))


def downgrade() -> None:
    op.drop_column("menu", "show_item_images")
