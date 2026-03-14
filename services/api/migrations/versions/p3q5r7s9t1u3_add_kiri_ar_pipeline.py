"""add_kiri_ar_pipeline

Revision ID: p3q5r7s9t1u3
Revises: n2q4r6s8t0u2
Create Date: 2026-03-13 11:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "p3q5r7s9t1u3"
down_revision: Union[str, Sequence[str], None] = "n2q4r6s8t0u2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("item", sa.Column("ar_provider", sa.String(), nullable=True))
    op.add_column("item", sa.Column("ar_capture_mode", sa.String(), nullable=True))
    op.add_column("item", sa.Column("ar_metadata_json", sa.JSON(), nullable=True))
    op.create_index(op.f("ix_item_ar_provider"), "item", ["ar_provider"], unique=False)

    op.create_table(
        "arcaptureasset",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("s3_key", sa.String(), nullable=False),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["item.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_arcaptureasset_item_id"), "arcaptureasset", ["item_id"], unique=False)
    op.create_index(op.f("ix_arcaptureasset_kind"), "arcaptureasset", ["kind"], unique=False)

    op.create_table(
        "arconversionjob",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("usdz_s3_key", sa.String(), nullable=False),
        sa.Column("usdz_url", sa.String(), nullable=False),
        sa.Column("glb_s3_key", sa.String(), nullable=True),
        sa.Column("glb_url", sa.String(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["item.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_arconversionjob_item_id"), "arconversionjob", ["item_id"], unique=False)
    op.create_index(op.f("ix_arconversionjob_status"), "arconversionjob", ["status"], unique=False)

    op.execute(
        """
        UPDATE item
        SET ar_provider = 'legacy_object_capture'
        WHERE ar_provider IS NULL
          AND (
            ar_video_s3_key IS NOT NULL
            OR ar_model_glb_s3_key IS NOT NULL
            OR ar_model_usdz_s3_key IS NOT NULL
            OR ar_model_glb_url IS NOT NULL
            OR ar_model_usdz_url IS NOT NULL
          )
        """
    )

    op.execute(
        """
        UPDATE item
        SET
          ar_status = 'failed',
          ar_error_message = 'Legacy AR job needs retry under the KIRI pipeline.',
          ar_stage = 'failed',
          ar_stage_detail = 'Legacy in-flight AR job migrated to failed. Retry to regenerate with KIRI.',
          ar_progress = NULL,
          ar_job_id = NULL,
          ar_updated_at = CURRENT_TIMESTAMP
        WHERE ar_status IN ('pending', 'processing')
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_arconversionjob_status"), table_name="arconversionjob")
    op.drop_index(op.f("ix_arconversionjob_item_id"), table_name="arconversionjob")
    op.drop_table("arconversionjob")

    op.drop_index(op.f("ix_arcaptureasset_kind"), table_name="arcaptureasset")
    op.drop_index(op.f("ix_arcaptureasset_item_id"), table_name="arcaptureasset")
    op.drop_table("arcaptureasset")

    op.drop_index(op.f("ix_item_ar_provider"), table_name="item")
    op.drop_column("item", "ar_metadata_json")
    op.drop_column("item", "ar_capture_mode")
    op.drop_column("item", "ar_provider")
