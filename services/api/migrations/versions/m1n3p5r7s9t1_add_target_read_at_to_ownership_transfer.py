"""add target read timestamp to ownership transfer

Revision ID: m1n3p5r7s9t1
Revises: l8m2n4p6q8r0
Create Date: 2026-03-06 11:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "m1n3p5r7s9t1"
down_revision = "l8m2n4p6q8r0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizationownershiptransfer", sa.Column("target_read_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizationownershiptransfer", "target_read_at")
