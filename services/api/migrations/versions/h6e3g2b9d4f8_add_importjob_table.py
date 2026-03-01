"""add importjob table

Revision ID: h6e3g2b9d4f8
Revises: 4b7c2d9e1a0f
Create Date: 2026-03-01 20:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "h6e3g2b9d4f8"
down_revision = "4b7c2d9e1a0f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "importjob",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("restaurant_name", sa.String(), nullable=False),
        sa.Column("location_hint", sa.String(), nullable=True),
        sa.Column("website_override", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="QUEUED"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_step", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("result_zip_key", sa.String(), nullable=True),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("logs", sa.Text(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_importjob_status"), "importjob", ["status"], unique=False)
    op.create_index(op.f("ix_importjob_created_by"), "importjob", ["created_by"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_importjob_created_by"), table_name="importjob")
    op.drop_index(op.f("ix_importjob_status"), table_name="importjob")
    op.drop_table("importjob")
