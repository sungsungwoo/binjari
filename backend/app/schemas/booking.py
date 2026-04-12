"""예약 생성·조회·취소·승인/거절 — docs/openapi.md."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserRead


class BookingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slot_id: UUID
    booker_id: UUID
    status: Literal[
        "PENDING",
        "CONFIRMED",
        "REJECTED",
        "CANCELLED",
        "NO_SHOW",
        "COMPLETED",
    ]
    idempotency_key: str
    request_message: str | None = None
    status_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    confirmed_at: datetime | None = None
    cancelled_at: datetime | None = None
    rejected_at: datetime | None = None
    completed_at: datetime | None = None


class BookingCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slot_id: UUID
    hold_token: str
    request_message: str | None = None


class BookingActionData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    booking: BookingRead
    slot_status: Literal["OPEN", "BOOKED", "BLOCKED"] | None = None
    message: str | None = None


class BookingActionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: BookingActionData


class BookingListData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[BookingRead]
    next_cursor: str | None = None


class BookingListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: BookingListData


class CancelBookingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = Field(default=None, max_length=255)


class RejectBookingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(min_length=1, max_length=255)


class MyBookingDetailData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    booking: BookingRead
    can_cancel: bool


class BookingDetailResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: MyBookingDetailData


class HostBookingDetailData(BaseModel):
    """호스트 예약 상세."""

    model_config = ConfigDict(extra="forbid")

    booking: BookingRead
    booker: UserRead | None = None


class HostBookingListItem(BookingRead):
    """호스트 예약 목록 — 예약자 표시용."""

    booker_name: str | None = None
    booker_email: str | None = None


class HostBookingDetailResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: HostBookingDetailData


class HostBookingListData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[HostBookingListItem]


class HostBookingListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: HostBookingListData
