"""rename menu logo qr fields

Revision ID: r5s7t9u1v3w5
Revises: q4s6t8u0v2w4
Create Date: 2026-03-15 21:05:00.000000
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "r5s7t9u1v3w5"
down_revision = "q4s6t8u0v2w4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("menu", "logo_qr_url", new_column_name="qr_url")
    op.alter_column("menu", "logo_qr_generated_at", new_column_name="qr_generated_at")


def downgrade() -> None:
    op.alter_column("menu", "qr_generated_at", new_column_name="logo_qr_generated_at")
    op.alter_column("menu", "qr_url", new_column_name="logo_qr_url")
