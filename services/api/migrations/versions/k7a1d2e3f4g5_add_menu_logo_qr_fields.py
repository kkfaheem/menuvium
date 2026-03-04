"""add menu logo qr fields

Revision ID: k7a1d2e3f4g5
Revises: j1b2c3d4e5f6
Create Date: 2026-03-04 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "k7a1d2e3f4g5"
down_revision = "j1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("menu", sa.Column("logo_qr_url", sa.String(), nullable=True))
    op.add_column("menu", sa.Column("logo_qr_generated_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("menu", "logo_qr_generated_at")
    op.drop_column("menu", "logo_qr_url")
