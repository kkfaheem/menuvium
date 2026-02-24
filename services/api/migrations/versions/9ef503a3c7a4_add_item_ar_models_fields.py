"""add_item_ar_models_fields

Revision ID: 9ef503a3c7a4
Revises: g5d2f1a8c3e7
Create Date: 2026-01-17 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9ef503a3c7a4"
down_revision = "g5d2f1a8c3e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("item", sa.Column("ar_video_url", sa.String(), nullable=True))
    op.add_column("item", sa.Column("ar_model_glb_url", sa.String(), nullable=True))
    op.add_column("item", sa.Column("ar_model_usdz_url", sa.String(), nullable=True))
    op.add_column("item", sa.Column("ar_status", sa.String(), nullable=True))
    op.add_column("item", sa.Column("ar_luma_capture_id", sa.String(), nullable=True))
    op.add_column("item", sa.Column("ar_error_message", sa.String(), nullable=True))
    op.add_column("item", sa.Column("ar_created_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("item", "ar_created_at")
    op.drop_column("item", "ar_error_message")
    op.drop_column("item", "ar_luma_capture_id")
    op.drop_column("item", "ar_status")
    op.drop_column("item", "ar_model_usdz_url")
    op.drop_column("item", "ar_model_glb_url")
    op.drop_column("item", "ar_video_url")

