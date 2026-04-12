"""운영 규칙·예외 일정 — docs/openapi.md."""

from datetime import date, datetime, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ScheduleRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    host_setting_id: UUID
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    rule_type: Literal["OPEN", "BREAK"]
    effective_start_date: date | None = None
    effective_end_date: date | None = None
    created_at: datetime
    updated_at: datetime


class ScheduleRuleCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    rule_type: Literal["OPEN", "BREAK"]
    effective_start_date: date | None = None
    effective_end_date: date | None = None


class ScheduleRuleUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    day_of_week: int | None = Field(default=None, ge=0, le=6)
    start_time: time | None = None
    end_time: time | None = None
    rule_type: Literal["OPEN", "BREAK"] | None = None
    effective_start_date: date | None = None
    effective_end_date: date | None = None


class ScheduleOverrideRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    host_setting_id: UUID
    override_date: date
    start_time: time | None = None
    end_time: time | None = None
    override_type: Literal["DAY_OFF", "OPEN", "BLOCK"]
    reason: str | None = None
    created_at: datetime
    updated_at: datetime


class ScheduleOverrideCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    override_date: date
    start_time: time | None = None
    end_time: time | None = None
    override_type: Literal["DAY_OFF", "OPEN", "BLOCK"]
    reason: str | None = None


class ScheduleOverrideUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    override_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    override_type: Literal["DAY_OFF", "OPEN", "BLOCK"] | None = None
    reason: str | None = None


class ScheduleRuleListData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ScheduleRuleRead]


class ScheduleRuleListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: ScheduleRuleListData


class ScheduleOverrideListData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ScheduleOverrideRead]


class ScheduleOverrideListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: ScheduleOverrideListData


class ScheduleRuleSingleResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: ScheduleRuleRead


class ScheduleOverrideSingleResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: ScheduleOverrideRead
