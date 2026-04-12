"""bookings — docs/DDL.md."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel


class Booking(SQLModel, table=True):
    __tablename__ = "bookings"
    __table_args__ = (
        UniqueConstraint("booker_id", "idempotency_key", name="uq_bookings_booker_idempotency"),
        CheckConstraint(
            "status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'NO_SHOW', 'COMPLETED')",
            name="chk_bookings_status",
        ),
        Index(
            "idx_bookings_booker_created_at",
            "booker_id",
            "created_at",
            postgresql_ops={"created_at": "DESC"},
        ),
        Index("idx_bookings_slot_id", "slot_id"),
    )

    id: UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            primary_key=True,
            server_default=text("gen_random_uuid()"),
        )
    )
    slot_id: UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("slots.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    booker_id: UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    status: str = Field(sa_column=Column(String(20), nullable=False))
    idempotency_key: str = Field(sa_column=Column(String(100), nullable=False))
    request_message: Optional[str] = Field(
        default=None, sa_column=Column(Text, nullable=True)
    )
    status_reason: Optional[str] = Field(
        default=None, sa_column=Column(String(255), nullable=True)
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
    confirmed_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    cancelled_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    rejected_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    completed_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
