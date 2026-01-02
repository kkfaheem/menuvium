"""remove location, use org on menu

Revision ID: e1c7b5a3f4b2
Revises: d2f8b1c4d0f1
Create Date: 2026-01-02 21:05:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e1c7b5a3f4b2"
down_revision: Union[str, Sequence[str], None] = "d2f8b1c4d0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("menu", sa.Column("org_id", sa.Uuid(), nullable=True))
    op.execute(
        """
        UPDATE menu
        SET org_id = location.org_id
        FROM location
        WHERE menu.location_id = location.id
        """
    )
    op.alter_column("menu", "org_id", nullable=False)
    op.create_index(op.f("ix_menu_org_id"), "menu", ["org_id"], unique=False)
    op.create_foreign_key("menu_org_id_fkey", "menu", "organization", ["org_id"], ["id"])
    op.drop_constraint("menu_location_id_fkey", "menu", type_="foreignkey")
    op.drop_index(op.f("ix_menu_location_id"), table_name="menu")
    op.drop_column("menu", "location_id")
    op.drop_table("location")


def downgrade() -> None:
    op.create_table(
        "location",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("address", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("operating_hours", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("menu", sa.Column("location_id", sa.Uuid(), nullable=True))
    op.execute(
        """
        INSERT INTO location (id, org_id, name, address, created_at)
        SELECT organization.id, organization.id, 'Default Location', '', NOW()
        FROM organization
        """
    )
    op.execute(
        """
        UPDATE menu
        SET location_id = location.id
        FROM location
        WHERE menu.org_id = location.org_id
        """
    )
    op.alter_column("menu", "location_id", nullable=False)
    op.create_index(op.f("ix_menu_location_id"), "menu", ["location_id"], unique=False)
    op.create_foreign_key("menu_location_id_fkey", "menu", "location", ["location_id"], ["id"])
    op.drop_constraint("menu_org_id_fkey", "menu", type_="foreignkey")
    op.drop_index(op.f("ix_menu_org_id"), table_name="menu")
    op.drop_column("menu", "org_id")
