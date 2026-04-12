"""add host_settings is_listed and listing_category

Revision ID: a1b2c3d4e5f6
Revises: 7f16e62b8bca
Create Date: 2026-03-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "7f16e62b8bca"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "host_settings",
        sa.Column(
            "is_listed",
            sa.Boolean(),
            server_default=sa.text("TRUE"),
            nullable=False,
        ),
    )
    op.add_column(
        "host_settings",
        sa.Column("listing_category", sa.String(length=50), nullable=True),
    )
    op.create_index(
        "idx_host_settings_marketplace_list",
        "host_settings",
        ["created_at", "id"],
        unique=False,
        postgresql_where=sa.text("is_active IS TRUE AND is_listed IS TRUE"),
    )
    op.alter_column("host_settings", "is_listed", server_default=None)


def downgrade() -> None:
    op.drop_index("idx_host_settings_marketplace_list", table_name="host_settings")
    op.drop_column("host_settings", "listing_category")
    op.drop_column("host_settings", "is_listed")
