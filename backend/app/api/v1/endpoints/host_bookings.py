"""호스트 예약 목록·승인·거절."""

from uuid import UUID

from fastapi import APIRouter, Query

from app.api.v1.deps import CurrentUserIdDep, HostPayloadDep, RedisDep, SessionDep
from app.schemas.booking import (
    BookingRead,
    HostBookingDetailData,
    HostBookingDetailResponse,
    HostBookingListData,
    HostBookingListResponse,
    RejectBookingRequest,
)
from app.services import booking_service, notification_service

router = APIRouter(prefix="/host/bookings", tags=["host-bookings"])


@router.get("", response_model=HostBookingListResponse)
async def list_host_bookings(
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
    status_filter: str | None = Query(None, alias="status"),
    host_setting_id: UUID | None = Query(None, alias="hostSettingId"),
):
    items = await booking_service.list_host_bookings(
        session, user_id, host_setting_id, status_filter
    )
    return HostBookingListResponse(data=HostBookingListData(items=items))


@router.get("/{booking_id}", response_model=HostBookingDetailResponse)
async def get_host_booking(
    booking_id: UUID,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    b, booker = await booking_service.get_host_booking_detail(session, booking_id, user_id)
    return HostBookingDetailResponse(
        data=HostBookingDetailData(
            booking=BookingRead.model_validate(b),
            booker=booker,
        )
    )


@router.post("/{booking_id}/approve", response_model=HostBookingDetailResponse)
async def approve_host_booking(
    booking_id: UUID,
    session: SessionDep,
    redis: RedisDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    await booking_service.approve_booking(session, booking_id, user_id)
    b, booker = await booking_service.get_host_booking_detail(session, booking_id, user_id)
    await notification_service.publish_user_event(
        redis,
        b.booker_id,
        "booking.confirmed",
        {"booking_id": str(b.id), "slot_id": str(b.slot_id)},
    )
    return HostBookingDetailResponse(
        data=HostBookingDetailData(booking=BookingRead.model_validate(b), booker=booker)
    )


@router.post("/{booking_id}/reject", response_model=HostBookingDetailResponse)
async def reject_host_booking(
    booking_id: UUID,
    body: RejectBookingRequest,
    session: SessionDep,
    redis: RedisDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    await booking_service.reject_booking(session, booking_id, user_id, body.reason)
    b, booker = await booking_service.get_host_booking_detail(session, booking_id, user_id)
    await notification_service.publish_user_event(
        redis,
        b.booker_id,
        "booking.rejected",
        {"booking_id": str(b.id), "slot_id": str(b.slot_id)},
    )
    return HostBookingDetailResponse(
        data=HostBookingDetailData(booking=BookingRead.model_validate(b), booker=booker)
    )
