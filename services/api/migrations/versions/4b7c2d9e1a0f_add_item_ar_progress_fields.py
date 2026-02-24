"""add_item_ar_progress_fields

Revision ID: 4b7c2d9e1a0f
Revises: 1f2a3b4c5d6e
Create Date: 2026-01-17 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "4b7c2d9e1a0f"
down_revision = "1f2a3b4c5d6e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("item", sa.Column("ar_stage", sa.String(), nullable=True))
    op.add_column("item", sa.Column("ar_stage_detail", sa.String(), nullable=True))
    op.add_column("item", sa.Column("ar_progress", sa.Float(), nullable=True))
    op.add_column("item", sa.Column("ar_updated_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("item", "ar_updated_at")
    op.drop_column("item", "ar_progress")
    op.drop_column("item", "ar_stage_detail")
    op.drop_column("item", "ar_stage")

