"""호스트 통계 — docs/openapi.md."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PopularSlotHour(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hour: int
    count: int


class AnalyticsSummaryData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    daily_count: int
    weekly_count: int
    approval_rate: float = Field(description="0~1 또는 퍼센트 — 서비스에서 통일")
    popular_slots: list[PopularSlotHour]


class AnalyticsSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: AnalyticsSummaryData


class PopularSlotsData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[PopularSlotHour]


class PopularSlotsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: PopularSlotsData
