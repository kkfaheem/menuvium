"""add organization members

Revision ID: 2c3d7f8a1b9e
Revises: f4c1e2a9b7d6
Create Date: 2026-01-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "2c3d7f8a1b9e"
down_revision = "f4c1e2a9b7d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizationmember",
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("can_manage_availability", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("can_edit_items", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("can_manage_menus", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("can_manage_users", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", "email", name="uq_org_member_org_id_email"),
    )
    op.create_index(op.f("ix_organizationmember_org_id"), "organizationmember", ["org_id"], unique=False)
    op.create_index(op.f("ix_organizationmember_email"), "organizationmember", ["email"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_organizationmember_email"), table_name="organizationmember")
    op.drop_index(op.f("ix_organizationmember_org_id"), table_name="organizationmember")
    op.drop_table("organizationmember")
