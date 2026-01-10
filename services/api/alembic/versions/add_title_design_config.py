"""add title_design_config to menus

Revision ID: add_title_design_config
Revises: 
Create Date: 2026-01-07 22:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = 'add_title_design_config'
down_revision = None  # TODO: Update this to the latest migration ID
depends_on = None


def upgrade():
    """Add title_design_config JSONB column to menu table"""
    op.add_column('menu', sa.Column('title_design_config', JSONB, nullable=True))


def downgrade():
    """Remove title_design_config column from menu table"""
    op.drop_column('menu', 'title_design_config')
