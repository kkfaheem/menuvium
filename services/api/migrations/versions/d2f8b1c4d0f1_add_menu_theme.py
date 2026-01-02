"""add menu theme

Revision ID: d2f8b1c4d0f1
Revises: bc38c81ada05
Create Date: 2026-01-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d2f8b1c4d0f1"
down_revision = "bc38c81ada05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("menu", sa.Column("theme", sa.String(), server_default="noir", nullable=False))


def downgrade() -> None:
    op.drop_column("menu", "theme")
