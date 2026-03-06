"""add organization ownership transfer table

Revision ID: l8m2n4p6q8r0
Revises: k7a1d2e3f4g5
Create Date: 2026-03-05 18:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "l8m2n4p6q8r0"
down_revision = "k7a1d2e3f4g5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizationownershiptransfer",
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column("requested_by_user_id", sa.String(), nullable=False),
        sa.Column("requested_by_email", sa.String(), nullable=True),
        sa.Column("target_member_id", sa.Uuid(), nullable=False),
        sa.Column("target_user_id", sa.String(), nullable=True),
        sa.Column("target_email", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["target_member_id"], ["organizationmember.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        op.f("ix_organizationownershiptransfer_org_id"),
        "organizationownershiptransfer",
        ["org_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_organizationownershiptransfer_requested_by_user_id"),
        "organizationownershiptransfer",
        ["requested_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_organizationownershiptransfer_requested_by_email"),
        "organizationownershiptransfer",
        ["requested_by_email"],
        unique=False,
    )
    op.create_index(
        op.f("ix_organizationownershiptransfer_target_member_id"),
        "organizationownershiptransfer",
        ["target_member_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_organizationownershiptransfer_target_user_id"),
        "organizationownershiptransfer",
        ["target_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_organizationownershiptransfer_target_email"),
        "organizationownershiptransfer",
        ["target_email"],
        unique=False,
    )
    op.create_index(
        op.f("ix_organizationownershiptransfer_status"),
        "organizationownershiptransfer",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_organizationownershiptransfer_status"), table_name="organizationownershiptransfer")
    op.drop_index(op.f("ix_organizationownershiptransfer_target_email"), table_name="organizationownershiptransfer")
    op.drop_index(op.f("ix_organizationownershiptransfer_target_user_id"), table_name="organizationownershiptransfer")
    op.drop_index(op.f("ix_organizationownershiptransfer_target_member_id"), table_name="organizationownershiptransfer")
    op.drop_index(
        op.f("ix_organizationownershiptransfer_requested_by_email"),
        table_name="organizationownershiptransfer",
    )
    op.drop_index(
        op.f("ix_organizationownershiptransfer_requested_by_user_id"),
        table_name="organizationownershiptransfer",
    )
    op.drop_index(op.f("ix_organizationownershiptransfer_org_id"), table_name="organizationownershiptransfer")
    op.drop_table("organizationownershiptransfer")
