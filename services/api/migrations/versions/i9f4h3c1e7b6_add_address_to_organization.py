"""add address to organization

Revision ID: i9f4h3c1e7b6
Revises: 7a8b9c0d1e2f
Create Date: 2026-03-03 22:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "i9f4h3c1e7b6"
down_revision = "7a8b9c0d1e2f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organization", sa.Column("address", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("organization", "address")
