"""add users.host_request_status for host signup approval

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("host_request_status", sa.String(length=20), nullable=True),
    )
    op.create_check_constraint(
        "chk_users_host_request_status",
        "users",
        "host_request_status IS NULL OR host_request_status IN ('pending','approved','rejected')",
    )


def downgrade() -> None:
    op.drop_constraint("chk_users_host_request_status", "users", type_="check")
    op.drop_column("users", "host_request_status")
