"""예약자 내 예약."""

from uuid import UUID

from fastapi import APIRouter, Body, Query

from app.api.v1.deps import CurrentUserIdDep, RedisDep, SessionDep
from app.models.host_setting import HostSetting
from app.models.slot import Slot
from app.schemas.booking import (
    BookingActionData,
    BookingActionResponse,
    BookingDetailResponse,
    BookingListData,
    BookingListResponse,
    BookingRead,
    CancelBookingRequest,
    MyBookingDetailData,
)
from app.services import booking_service, notification_service

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/bookings", response_model=BookingListResponse)
async def list_my_bookings(
    session: SessionDep,
    user_id: CurrentUserIdDep,
    status_filter: str | None = Query(None, alias="status"),
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=100),
):
    items, next_c = await booking_service.list_my_bookings(
        session, user_id, status_filter, limit, cursor
    )
    return BookingListResponse(
        data=BookingListData(
            items=[BookingRead.model_validate(b) for b in items],
            next_cursor=next_c,
        )
    )


@router.get("/bookings/{booking_id}", response_model=BookingDetailResponse)
async def get_my_booking_detail(
    booking_id: UUID,
    session: SessionDep,
    user_id: CurrentUserIdDep,
):
    b = await booking_service.get_my_booking(session, booking_id, user_id)
    can_cancel = await booking_service.can_booker_cancel(session, b, user_id)
    return BookingDetailResponse(
        data=MyBookingDetailData(
            booking=BookingRead.model_validate(b),
            can_cancel=can_cancel,
        )
    )


@router.post("/bookings/{booking_id}/cancel", response_model=BookingActionResponse)
async def cancel_my_booking(
    booking_id: UUID,
    session: SessionDep,
    redis: RedisDep,
    user_id: CurrentUserIdDep,
    body: CancelBookingRequest = Body(default_factory=CancelBookingRequest),
):
    b = await booking_service.cancel_my_booking(
        session, booking_id, user_id, cancel_reason=body.reason
    )
    slot = await session.get(Slot, b.slot_id)
    if slot:
        hs = await session.get(HostSetting, slot.host_setting_id)
        if hs:
            await notification_service.publish_user_event(
                redis,
                hs.host_id,
                "booking.cancelled",
                {"booking_id": str(b.id), "slot_id": str(b.slot_id)},
            )
    slot_st = slot.status if slot else None
    return BookingActionResponse(
        data=BookingActionData(
            booking=BookingRead.model_validate(b),
            slot_status=slot_st,  # type: ignore[arg-type]
            message=None,
        )
    )
