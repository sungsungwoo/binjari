"""slots — docs/DDL.md."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel


class Slot(SQLModel, table=True):
    __tablename__ = "slots"
    __table_args__ = (
        UniqueConstraint("host_setting_id", "start_time", name="uq_slots_host_setting_start_time"),
        CheckConstraint("end_time > start_time", name="chk_slots_time_range"),
        CheckConstraint(
            "status IN ('OPEN', 'BOOKED', 'BLOCKED')", name="chk_slots_status"
        ),
        Index("idx_slots_host_setting_start_time_status", "host_setting_id", "start_time", "status"),
    )

    id: UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            primary_key=True,
            server_default=text("gen_random_uuid()"),
        )
    )
    host_setting_id: UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("host_settings.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    start_time: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    end_time: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    status: str = Field(sa_column=Column(String(20), nullable=False))
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
