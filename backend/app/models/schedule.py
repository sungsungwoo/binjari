"""schedule_rules, schedule_overrides — docs/DDL.md."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Time,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel


class ScheduleRule(SQLModel, table=True):
    __tablename__ = "schedule_rules"
    __table_args__ = (
        CheckConstraint(
            "day_of_week BETWEEN 0 AND 6", name="chk_schedule_rules_day_of_week"
        ),
        CheckConstraint("end_time > start_time", name="chk_schedule_rules_time_range"),
        CheckConstraint(
            "rule_type IN ('OPEN', 'BREAK')", name="chk_schedule_rules_rule_type"
        ),
        CheckConstraint(
            "(effective_end_date IS NULL OR effective_start_date IS NULL OR "
            "effective_end_date >= effective_start_date)",
            name="chk_schedule_rules_effective_date_range",
        ),
        Index("idx_schedule_rules_host_setting_id", "host_setting_id"),
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
    day_of_week: int = Field(sa_column=Column(SmallInteger, nullable=False))
    start_time: time = Field(sa_column=Column(Time, nullable=False))
    end_time: time = Field(sa_column=Column(Time, nullable=False))
    rule_type: str = Field(sa_column=Column(String(20), nullable=False))
    effective_start_date: Optional[date] = Field(
        default=None, sa_column=Column(Date, nullable=True)
    )
    effective_end_date: Optional[date] = Field(
        default=None, sa_column=Column(Date, nullable=True)
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


class ScheduleOverride(SQLModel, table=True):
    __tablename__ = "schedule_overrides"
    __table_args__ = (
        CheckConstraint(
            "override_type IN ('DAY_OFF', 'OPEN', 'BLOCK')",
            name="chk_schedule_overrides_type",
        ),
        CheckConstraint(
            "(override_type = 'DAY_OFF' AND start_time IS NULL AND end_time IS NULL) OR "
            "(override_type IN ('OPEN', 'BLOCK') AND start_time IS NOT NULL AND "
            "end_time IS NOT NULL AND end_time > start_time)",
            name="chk_schedule_overrides_time_logic",
        ),
        Index("idx_schedule_overrides_host_setting_date", "host_setting_id", "override_date"),
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
    override_date: date = Field(sa_column=Column(Date, nullable=False))
    start_time: Optional[time] = Field(default=None, sa_column=Column(Time, nullable=True))
    end_time: Optional[time] = Field(default=None, sa_column=Column(Time, nullable=True))
    override_type: str = Field(sa_column=Column(String(20), nullable=False))
    reason: Optional[str] = Field(
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
