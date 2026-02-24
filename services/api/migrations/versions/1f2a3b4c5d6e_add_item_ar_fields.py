"""add_item_ar_fields

Revision ID: 1f2a3b4c5d6e
Revises: 9ef503a3c7a4
Create Date: 2026-01-17 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "1f2a3b4c5d6e"
down_revision = "9ef503a3c7a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("item", sa.Column("ar_job_id", sa.Uuid(), nullable=True))
    op.add_column("item", sa.Column("ar_video_s3_key", sa.String(), nullable=True))
    op.add_column("item", sa.Column("ar_model_glb_s3_key", sa.String(), nullable=True))
    op.add_column("item", sa.Column("ar_model_usdz_s3_key", sa.String(), nullable=True))
    op.add_column("item", sa.Column("ar_model_poster_s3_key", sa.String(), nullable=True))
    op.add_column("item", sa.Column("ar_model_poster_url", sa.String(), nullable=True))

    op.create_index(op.f("ix_item_ar_status"), "item", ["ar_status"], unique=False)
    op.create_index(op.f("ix_item_ar_job_id"), "item", ["ar_job_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_item_ar_job_id"), table_name="item")
    op.drop_index(op.f("ix_item_ar_status"), table_name="item")

    op.drop_column("item", "ar_model_poster_url")
    op.drop_column("item", "ar_model_poster_s3_key")
    op.drop_column("item", "ar_model_usdz_s3_key")
    op.drop_column("item", "ar_model_glb_s3_key")
    op.drop_column("item", "ar_video_s3_key")
    op.drop_column("item", "ar_job_id")
