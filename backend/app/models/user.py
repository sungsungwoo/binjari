"""users, roles, user_roles — docs/DDL.md."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("provider IN ('LOCAL', 'GOOGLE')", name="chk_users_provider"),
        CheckConstraint(
            "host_request_status IS NULL OR host_request_status IN ('pending','approved','rejected')",
            name="chk_users_host_request_status",
        ),
    )

    id: UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            primary_key=True,
            server_default=text("gen_random_uuid()"),
        )
    )
    email: str = Field(sa_column=Column(String(255), nullable=False, unique=True))
    password_hash: Optional[str] = Field(
        default=None, sa_column=Column(String(255), nullable=True)
    )
    provider: str = Field(sa_column=Column(String(20), nullable=False))
    name: str = Field(sa_column=Column(String(100), nullable=False))
    host_request_status: Optional[str] = Field(
        default=None,
        sa_column=Column(String(20), nullable=True),
    )
    is_active: bool = Field(
        sa_column=Column(Boolean, nullable=False, server_default=text("TRUE"))
    )
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        )
    )
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        )
    )


class Role(SQLModel, table=True):
    __tablename__ = "roles"

    id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, Identity(always=True), primary_key=True),
    )
    name: str = Field(sa_column=Column(String(50), nullable=False, unique=True))
    description: Optional[str] = Field(
        default=None, sa_column=Column(String(255), nullable=True)
    )


class UserRole(SQLModel, table=True):
    __tablename__ = "user_roles"
    __table_args__ = (Index("idx_user_roles_role_id", "role_id"),)

    user_id: UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    role_id: int = Field(
        sa_column=Column(
            Integer,
            ForeignKey("roles.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    assigned_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=text("CURRENT_TIMESTAMP"),
        )
    )
