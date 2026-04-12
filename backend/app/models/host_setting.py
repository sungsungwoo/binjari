"""host_settings — docs/DDL.md."""

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
    Integer,
    String,
    Text,
    UniqueConstraint,
    Index,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel


class HostSetting(SQLModel, table=True):
    __tablename__ = "host_settings"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_host_settings_slug"),
        CheckConstraint("slug ~ '^[a-z0-9-]+$'", name="chk_host_settings_slug_format"),
        CheckConstraint("btrim(title) <> ''", name="chk_host_settings_title_not_blank"),
        CheckConstraint(
            "btrim(host_timezone) <> ''",
            name="chk_host_settings_host_timezone_not_blank",
        ),
        CheckConstraint(
            "approval_type IN ('AUTO', 'MANUAL')",
            name="chk_host_settings_approval_type",
        ),
        CheckConstraint("slot_duration_mins > 0", name="chk_host_settings_slot_duration"),
        CheckConstraint(
            "buffer_duration_mins >= 0", name="chk_host_settings_buffer_duration"
        ),
        CheckConstraint(
            "booking_open_days_ahead >= 0",
            name="chk_host_settings_open_days_ahead",
        ),
        CheckConstraint(
            "booking_close_minutes_before >= 0",
            name="chk_host_settings_close_minutes_before",
        ),
        CheckConstraint(
            "cancel_deadline_minutes_before >= 0",
            name="chk_host_settings_cancel_deadline",
        ),
        CheckConstraint(
            "max_active_bookings_per_user >= 1",
            name="chk_host_settings_max_active_bookings",
        ),
        Index("idx_host_settings_host_id", "host_id"),
    )

    id: UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            primary_key=True,
            server_default=text("gen_random_uuid()"),
        )
    )
    host_id: UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    slug: str = Field(sa_column=Column(String(100), nullable=False))
    title: str = Field(sa_column=Column(String(150), nullable=False))
    description: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    host_timezone: str = Field(sa_column=Column(String(50), nullable=False))
    slot_duration_mins: int = Field(sa_column=Column(Integer, nullable=False))
    buffer_duration_mins: int = Field(
        sa_column=Column(Integer, nullable=False, server_default=text("0"))
    )
    approval_type: str = Field(sa_column=Column(String(20), nullable=False))
    booking_open_days_ahead: int = Field(
        sa_column=Column(Integer, nullable=False, server_default=text("30"))
    )
    booking_close_minutes_before: int = Field(
        sa_column=Column(Integer, nullable=False, server_default=text("120"))
    )
    cancel_deadline_minutes_before: int = Field(
        sa_column=Column(Integer, nullable=False, server_default=text("1440"))
    )
    max_active_bookings_per_user: int = Field(
        sa_column=Column(Integer, nullable=False, server_default=text("3"))
    )
    is_active: bool = Field(
        sa_column=Column(Boolean, nullable=False, server_default=text("TRUE"))
    )
    is_listed: bool = Field(
        sa_column=Column(Boolean, nullable=False, server_default=text("TRUE"))
    )
    listing_category: Optional[str] = Field(
        default=None, sa_column=Column(String(50), nullable=True)
    )
    setup_completed: bool = Field(
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
