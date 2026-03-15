"""add_org_id_to_import_job

Revision ID: q4s6t8u0v2w4
Revises: p3q5r7s9t1u3
Create Date: 2026-03-15 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "q4s6t8u0v2w4"
down_revision: Union[str, Sequence[str], None] = "p3q5r7s9t1u3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("importjob", sa.Column("org_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_importjob_org_id_organization",
        "importjob",
        "organization",
        ["org_id"],
        ["id"],
    )
    op.create_index(op.f("ix_importjob_org_id"), "importjob", ["org_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_importjob_org_id"), table_name="importjob")
    op.drop_constraint("fk_importjob_org_id_organization", "importjob", type_="foreignkey")
    op.drop_column("importjob", "org_id")
