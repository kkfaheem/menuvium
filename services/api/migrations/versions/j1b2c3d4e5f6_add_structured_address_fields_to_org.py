"""add structured address fields to organization

Revision ID: j1b2c3d4e5f6
Revises: i9f4h3c1e7b6
Create Date: 2026-03-04 01:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "j1b2c3d4e5f6"
down_revision = "i9f4h3c1e7b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organization", sa.Column("address_line1", sa.String(), nullable=True))
    op.add_column("organization", sa.Column("address_line2", sa.String(), nullable=True))
    op.add_column("organization", sa.Column("city", sa.String(), nullable=True))
    op.add_column("organization", sa.Column("state_province", sa.String(), nullable=True))
    op.add_column("organization", sa.Column("country", sa.String(), nullable=True))
    op.add_column("organization", sa.Column("postal_code", sa.String(), nullable=True))
    op.execute(
        """
        UPDATE organization
        SET address_line1 = address
        WHERE address IS NOT NULL
          AND address <> ''
          AND (address_line1 IS NULL OR address_line1 = '')
        """
    )


def downgrade() -> None:
    op.drop_column("organization", "postal_code")
    op.drop_column("organization", "country")
    op.drop_column("organization", "state_province")
    op.drop_column("organization", "city")
    op.drop_column("organization", "address_line2")
    op.drop_column("organization", "address_line1")
