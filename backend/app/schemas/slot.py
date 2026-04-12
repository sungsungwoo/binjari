"""슬롯·일괄 생성·임시 선점 — docs/openapi.md."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.host_setting import HostSettingRead


class SlotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    host_setting_id: UUID
    start_time: datetime
    end_time: datetime
    status: Literal["OPEN", "BOOKED", "BLOCKED"]


class SlotListData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[SlotRead]


class SlotListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: SlotListData


class GenerateSlotsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_date: date
    to_date: date


class GenerateSlotsData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    generated_count: int
    skipped_count: int
    from_date: date
    to_date: date


class GenerateSlotsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: GenerateSlotsData


class ClearSlotsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_date: date
    to_date: date


class ClearSlotsData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    deleted_count: int
    booked_kept_count: int
    from_date: date
    to_date: date


class ClearSlotsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: ClearSlotsData


class BlockSlotRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = None


class HoldResponseData(BaseModel):
    """POST: 전체 필드 / GET: `held`만 채우고 나머지는 None 가능."""

    model_config = ConfigDict(extra="forbid")

    slot_id: UUID
    hold_token: str | None = None
    expires_at: datetime | None = None
    remaining_seconds: int | None = None
    held: bool | None = None


class HoldResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: HoldResponseData


class PublicBookingPageResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: HostSettingRead


class PublicSlotsDayGroup(BaseModel):
    """날짜별 슬롯 — docs/api_usecase.md 공개 월간 조회."""

    model_config = ConfigDict(extra="forbid")

    date: str
    slots: list[SlotRead]


class PublicSlotsCalendarData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    days: list[PublicSlotsDayGroup]


class PublicSlotsCalendarResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: PublicSlotsCalendarData


class SlotBlockedData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slot: SlotRead


class SlotBlockedResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: SlotBlockedData
