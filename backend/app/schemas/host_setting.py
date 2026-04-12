"""호스트 예약 페이지(host_settings) — docs/openapi.md."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class HostSettingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    host_id: UUID
    slug: str
    title: str
    description: str | None = None
    host_timezone: str
    slot_duration_mins: int
    buffer_duration_mins: int
    approval_type: Literal["AUTO", "MANUAL"]
    booking_open_days_ahead: int
    booking_close_minutes_before: int
    cancel_deadline_minutes_before: int
    max_active_bookings_per_user: int
    is_active: bool
    is_listed: bool
    listing_category: str | None = None
    setup_completed: bool
    created_at: datetime
    updated_at: datetime


_SLUG_PATTERN = r"^[a-z0-9-]+$"


class HostSettingCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str = Field(pattern=_SLUG_PATTERN)
    title: str = Field(min_length=1, max_length=150)
    description: str | None = None
    host_timezone: str
    slot_duration_mins: int = Field(ge=1)
    buffer_duration_mins: int = Field(default=0, ge=0)
    approval_type: Literal["AUTO", "MANUAL"]
    booking_open_days_ahead: int = Field(default=30, ge=0)
    booking_close_minutes_before: int = Field(default=120, ge=0)
    cancel_deadline_minutes_before: int = Field(default=1440, ge=0)
    max_active_bookings_per_user: int = Field(default=3, ge=1)
    is_listed: bool = True
    listing_category: str | None = Field(default=None, max_length=50)
    start_as_draft: bool = Field(
        default=False,
        description="True면 초안(비활성·설정 미완료)으로 생성 후 마법사에서 완료",
    )


class HostSettingUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str | None = Field(default=None, pattern=_SLUG_PATTERN)
    title: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    host_timezone: str | None = None
    slot_duration_mins: int | None = Field(default=None, ge=1)
    buffer_duration_mins: int | None = Field(default=None, ge=0)
    approval_type: Literal["AUTO", "MANUAL"] | None = None
    booking_open_days_ahead: int | None = Field(default=None, ge=0)
    booking_close_minutes_before: int | None = Field(default=None, ge=0)
    cancel_deadline_minutes_before: int | None = Field(default=None, ge=0)
    max_active_bookings_per_user: int | None = Field(default=None, ge=1)
    is_active: bool | None = None
    is_listed: bool | None = None
    listing_category: str | None = Field(default=None, max_length=50)
    setup_completed: bool | None = None


class HostSettingCompleteWizardRequest(BaseModel):
    """POST .../complete-setup — 마법사 마지막 단계에서 설정 완료·활성화."""

    model_config = ConfigDict(extra="forbid")

    activate: bool = True


class HostSettingToggleRequest(BaseModel):
    """POST .../toggle-active — docs/api_usecase.md."""

    model_config = ConfigDict(extra="forbid")

    is_active: bool


class HostSettingListedToggleRequest(BaseModel):
    """POST .../toggle-listed — 마켓플레이스·랜딩 검색 노출."""

    model_config = ConfigDict(extra="forbid")

    is_listed: bool


class MarketplaceBookingPageItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str
    title: str
    description: str | None = None
    listing_category: str | None = None


class MarketplaceBookingPagesData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[MarketplaceBookingPageItem]
    next_cursor: str | None = None


class MarketplaceBookingPagesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: MarketplaceBookingPagesData


class HostSettingSuccessResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: HostSettingRead


class HostBookingPageMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rules_count: int = 0
    open_slots_count: int = 0
    today_bookings: int = 0
    week_bookings: int = 0
    pending_bookings: int = 0


class HostSettingListItemRead(HostSettingRead):
    """목록용: 예약 페이지 + 운영 지표(슬롯 시작일 기준 UTC 집계)."""

    metrics: HostBookingPageMetrics


class HostSettingListData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[HostSettingListItemRead]


class HostSettingListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: HostSettingListData
