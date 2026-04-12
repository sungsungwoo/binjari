"""예약 생성."""

from typing import Annotated

from fastapi import APIRouter, Header, status
from fastapi.responses import JSONResponse

from app.api.v1.deps import CurrentUserIdDep, RedisDep, SessionDep
from app.models.host_setting import HostSetting
from app.models.slot import Slot
from app.schemas.booking import (
    BookingActionData,
    BookingActionResponse,
    BookingCreateRequest,
    BookingRead,
)
from app.services import booking_service, notification_service

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("", response_model=BookingActionResponse)
async def create_booking_endpoint(
    body: BookingCreateRequest,
    session: SessionDep,
    redis: RedisDep,
    user_id: CurrentUserIdDep,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key")],
):
    booking, slot_status, msg, replay = await booking_service.create_booking(
        session,
        redis,
        user_id,
        idempotency_key.strip(),
        body.slot_id,
        body.hold_token,
        request_message=body.request_message,
    )
    if not replay:
        slot = await session.get(Slot, booking.slot_id)
        if slot:
            hs = await session.get(HostSetting, slot.host_setting_id)
            if hs:
                await notification_service.publish_user_event(
                    redis,
                    hs.host_id,
                    "booking.requested",
                    {
                        "booking_id": str(booking.id),
                        "slot_id": str(booking.slot_id),
                    },
                )
    payload = BookingActionResponse(
        data=BookingActionData(
            booking=BookingRead.model_validate(booking),
            slot_status=slot_status,  # type: ignore[arg-type]
            message=msg,
        )
    )
    code = status.HTTP_200_OK if replay else status.HTTP_201_CREATED
    return JSONResponse(status_code=code, content=payload.model_dump(mode="json"))
