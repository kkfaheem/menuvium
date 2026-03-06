"""add item options, visibility rules, and menu timezone

Revision ID: n2q4r6s8t0u2
Revises: m1n3p5r7s9t1
Create Date: 2026-03-06 16:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "n2q4r6s8t0u2"
down_revision = "m1n3p5r7s9t1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("menu", sa.Column("timezone", sa.String(), nullable=False, server_default="UTC"))
    op.alter_column("menu", "timezone", server_default=None)

    op.create_table(
        "itemoptiongroup",
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("selection_mode", sa.String(), nullable=False, server_default=sa.text("'single'")),
        sa.Column("min_select", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("max_select", sa.Integer(), nullable=True),
        sa.Column("display_style", sa.String(), nullable=False, server_default=sa.text("'chips'")),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["item.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_itemoptiongroup_item_id"), "itemoptiongroup", ["item_id"], unique=False)

    op.create_table(
        "itemoption",
        sa.Column("group_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.Column("badge", sa.String(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["itemoptiongroup.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_itemoption_group_id"), "itemoption", ["group_id"], unique=False)

    op.create_table(
        "visibilityrule",
        sa.Column("kind", sa.String(), nullable=False, server_default=sa.text("'include'")),
        sa.Column("days_of_week", sa.JSON(), nullable=False),
        sa.Column("start_time_local", sa.Time(), nullable=False),
        sa.Column("end_time_local", sa.Time(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("priority", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=True),
        sa.Column("option_id", sa.Uuid(), nullable=True),
        sa.CheckConstraint(
            "(item_id IS NOT NULL AND option_id IS NULL) OR (item_id IS NULL AND option_id IS NOT NULL)",
            name="ck_visibilityrule_single_target",
        ),
        sa.CheckConstraint("kind IN ('include', 'exclude')", name="ck_visibilityrule_kind"),
        sa.ForeignKeyConstraint(["item_id"], ["item.id"]),
        sa.ForeignKeyConstraint(["option_id"], ["itemoption.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_visibilityrule_item_id"), "visibilityrule", ["item_id"], unique=False)
    op.create_index(op.f("ix_visibilityrule_option_id"), "visibilityrule", ["option_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_visibilityrule_option_id"), table_name="visibilityrule")
    op.drop_index(op.f("ix_visibilityrule_item_id"), table_name="visibilityrule")
    op.drop_table("visibilityrule")

    op.drop_index(op.f("ix_itemoption_group_id"), table_name="itemoption")
    op.drop_table("itemoption")

    op.drop_index(op.f("ix_itemoptiongroup_item_id"), table_name="itemoptiongroup")
    op.drop_table("itemoptiongroup")

    op.drop_column("menu", "timezone")
