"""add host_settings.setup_completed

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "host_settings",
        sa.Column(
            "setup_completed",
            sa.Boolean(),
            server_default=sa.text("TRUE"),
            nullable=False,
        ),
    )
    op.alter_column("host_settings", "setup_completed", server_default=None)


def downgrade() -> None:
    op.drop_column("host_settings", "setup_completed")
