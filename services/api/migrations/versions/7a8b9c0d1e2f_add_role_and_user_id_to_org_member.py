"""add role and user_id to organizationmember

Revision ID: 7a8b9c0d1e2f
Revises: h6e3g2b9d4f8
Create Date: 2026-03-02 02:20:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "7a8b9c0d1e2f"
down_revision = "h6e3g2b9d4f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizationmember", sa.Column("user_id", sa.String(), nullable=True))
    op.add_column("organizationmember", sa.Column("role", sa.String(), nullable=True, server_default="member"))
    op.create_index(op.f("ix_organizationmember_user_id"), "organizationmember", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_organizationmember_user_id"), table_name="organizationmember")
    op.drop_column("organizationmember", "role")
    op.drop_column("organizationmember", "user_id")
