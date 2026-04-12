"""호스트 예약 페이지·규칙·예외·슬롯."""

from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Query, Response, status

from app.api.v1.deps import CurrentUserIdDep, HostPayloadDep, RedisDep, SessionDep
from app.core.error_codes import ErrorCode
from app.core.exceptions import AppError
from app.schemas.host_setting import (
    HostSettingCompleteWizardRequest,
    HostSettingCreateRequest,
    HostSettingListedToggleRequest,
    HostSettingListData,
    HostSettingListItemRead,
    HostSettingListResponse,
    HostSettingRead,
    HostSettingSuccessResponse,
    HostSettingToggleRequest,
    HostSettingUpdateRequest,
)
from app.schemas.schedule import (
    ScheduleOverrideCreateRequest,
    ScheduleOverrideListData,
    ScheduleOverrideListResponse,
    ScheduleOverrideRead,
    ScheduleOverrideSingleResponse,
    ScheduleOverrideUpdateRequest,
    ScheduleRuleCreateRequest,
    ScheduleRuleListData,
    ScheduleRuleListResponse,
    ScheduleRuleRead,
    ScheduleRuleSingleResponse,
    ScheduleRuleUpdateRequest,
)
from app.schemas.slot import (
    BlockSlotRequest,
    ClearSlotsData,
    ClearSlotsRequest,
    ClearSlotsResponse,
    GenerateSlotsData,
    GenerateSlotsRequest,
    GenerateSlotsResponse,
    SlotBlockedData,
    SlotBlockedResponse,
    SlotListData,
    SlotListResponse,
    SlotRead,
)
from app.services import (
    booking_service,
    host_setting_service,
    notification_service,
    schedule_service,
    slot_service,
)

router = APIRouter(prefix="/host", tags=["host"])


def _parse_date(q: str, err_code: str = ErrorCode.INVALID_DATE) -> date:
    try:
        return date.fromisoformat(q)
    except ValueError as e:
        raise AppError(
            code=err_code,
            message="날짜 형식이 올바르지 않습니다.",
            status_code=400,
        ) from e


def _local_date_range_to_utc(host_timezone: str, from_d: date, to_d: date) -> tuple[datetime, datetime]:
    if to_d < from_d:
        raise AppError(
            code=ErrorCode.INVALID_DATE_RANGE,
            message="종료일이 시작일보다 빠릅니다.",
            status_code=422,
        )
    tz = ZoneInfo(host_timezone)
    start = datetime.combine(from_d, time.min, tzinfo=tz).astimezone(timezone.utc)
    end = datetime.combine(to_d + timedelta(days=1), time.min, tzinfo=tz).astimezone(
        timezone.utc
    )
    return start, end


# --- booking-pages ---


@router.get("/booking-pages", response_model=HostSettingListResponse)
async def list_booking_pages(session: SessionDep, user_id: CurrentUserIdDep, _: HostPayloadDep):
    items = await host_setting_service.list_for_host(session, user_id)
    metrics = await booking_service.host_page_metrics_batch(session, [x.id for x in items])
    list_items = [
        HostSettingListItemRead(
            **HostSettingRead.model_validate(hs).model_dump(),
            metrics=metrics[hs.id],
        )
        for hs in items
    ]
    return HostSettingListResponse(data=HostSettingListData(items=list_items))


@router.post("/booking-pages", response_model=HostSettingSuccessResponse, status_code=201)
async def create_booking_page(
    body: HostSettingCreateRequest,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    hs = await host_setting_service.create_host_setting(session, user_id, body)
    return HostSettingSuccessResponse(data=HostSettingRead.model_validate(hs))


@router.get("/booking-pages/{host_setting_id}", response_model=HostSettingSuccessResponse)
async def get_booking_page(
    host_setting_id: UUID,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    hs = await host_setting_service.get_owned_or_404(session, host_setting_id, user_id)
    return HostSettingSuccessResponse(data=HostSettingRead.model_validate(hs))


@router.patch("/booking-pages/{host_setting_id}", response_model=HostSettingSuccessResponse)
async def patch_booking_page(
    host_setting_id: UUID,
    body: HostSettingUpdateRequest,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    hs = await host_setting_service.update_host_setting(session, host_setting_id, user_id, body)
    return HostSettingSuccessResponse(data=HostSettingRead.model_validate(hs))


@router.post("/booking-pages/{host_setting_id}/toggle-active", response_model=HostSettingSuccessResponse)
async def toggle_booking_page_active(
    host_setting_id: UUID,
    body: HostSettingToggleRequest,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    hs = await host_setting_service.toggle_active(session, host_setting_id, user_id, body.is_active)
    return HostSettingSuccessResponse(data=HostSettingRead.model_validate(hs))


@router.post("/booking-pages/{host_setting_id}/toggle-listed", response_model=HostSettingSuccessResponse)
async def toggle_booking_page_listed(
    host_setting_id: UUID,
    body: HostSettingListedToggleRequest,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    hs = await host_setting_service.toggle_listed(session, host_setting_id, user_id, body.is_listed)
    return HostSettingSuccessResponse(data=HostSettingRead.model_validate(hs))


@router.post(
    "/booking-pages/{host_setting_id}/complete-setup",
    response_model=HostSettingSuccessResponse,
)
async def complete_booking_page_setup(
    host_setting_id: UUID,
    body: HostSettingCompleteWizardRequest,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    hs = await host_setting_service.complete_setup_wizard(
        session, host_setting_id, user_id, activate=body.activate
    )
    return HostSettingSuccessResponse(data=HostSettingRead.model_validate(hs))


@router.delete("/booking-pages/{host_setting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_booking_page(
    host_setting_id: UUID,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    await host_setting_service.delete_host_setting(session, host_setting_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- rules ---


@router.get("/booking-pages/{host_setting_id}/rules", response_model=ScheduleRuleListResponse)
async def list_rules(
    host_setting_id: UUID,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    rules = await schedule_service.list_rules(session, host_setting_id, user_id)
    return ScheduleRuleListResponse(
        data=ScheduleRuleListData(items=[ScheduleRuleRead.model_validate(r) for r in rules])
    )


@router.post("/booking-pages/{host_setting_id}/rules", response_model=ScheduleRuleSingleResponse, status_code=201)
async def create_rule(
    host_setting_id: UUID,
    body: ScheduleRuleCreateRequest,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    rule = await schedule_service.create_rule(session, host_setting_id, user_id, body)
    return ScheduleRuleSingleResponse(data=ScheduleRuleRead.model_validate(rule))


@router.patch("/rules/{rule_id}", response_model=ScheduleRuleSingleResponse)
async def patch_rule(
    rule_id: UUID,
    body: ScheduleRuleUpdateRequest,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    rule = await schedule_service.update_rule(session, rule_id, user_id, body)
    return ScheduleRuleSingleResponse(data=ScheduleRuleRead.model_validate(rule))


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: UUID,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    await schedule_service.delete_rule(session, rule_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- overrides ---


@router.get("/booking-pages/{host_setting_id}/overrides", response_model=ScheduleOverrideListResponse)
async def list_overrides(
    host_setting_id: UUID,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
    from_q: str = Query(..., alias="from"),
    to_q: str = Query(..., alias="to"),
):
    from_d = _parse_date(from_q)
    to_d = _parse_date(to_q)
    if to_d < from_d:
        raise AppError(
            code=ErrorCode.INVALID_DATE_RANGE,
            message="종료일이 시작일보다 빠릅니다.",
            status_code=422,
        )
    ovs = await schedule_service.list_overrides(session, host_setting_id, user_id, from_d, to_d)
    return ScheduleOverrideListResponse(
        data=ScheduleOverrideListData(
            items=[ScheduleOverrideRead.model_validate(o) for o in ovs]
        )
    )


@router.post(
    "/booking-pages/{host_setting_id}/overrides",
    response_model=ScheduleOverrideSingleResponse,
    status_code=201,
)
async def create_override(
    host_setting_id: UUID,
    body: ScheduleOverrideCreateRequest,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    ov = await schedule_service.create_override(session, host_setting_id, user_id, body)
    return ScheduleOverrideSingleResponse(data=ScheduleOverrideRead.model_validate(ov))


@router.patch("/overrides/{override_id}", response_model=ScheduleOverrideSingleResponse)
async def patch_override(
    override_id: UUID,
    body: ScheduleOverrideUpdateRequest,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    ov = await schedule_service.update_override(session, override_id, user_id, body)
    return ScheduleOverrideSingleResponse(data=ScheduleOverrideRead.model_validate(ov))


@router.delete("/overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_override(
    override_id: UUID,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    await schedule_service.delete_override(session, override_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- slots ---


@router.post(
    "/booking-pages/{host_setting_id}/slots/generate",
    response_model=GenerateSlotsResponse,
)
async def generate_slots(
    host_setting_id: UUID,
    body: GenerateSlotsRequest,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    gen, skip = await slot_service.generate_slots(
        session, host_setting_id, user_id, body.from_date, body.to_date
    )
    return GenerateSlotsResponse(
        data=GenerateSlotsData(
            generated_count=gen,
            skipped_count=skip,
            from_date=body.from_date,
            to_date=body.to_date,
        )
    )


@router.post(
    "/booking-pages/{host_setting_id}/slots/clear",
    response_model=ClearSlotsResponse,
)
async def clear_slots_range(
    host_setting_id: UUID,
    body: ClearSlotsRequest,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    deleted, booked_kept = await slot_service.clear_slots_in_range(
        session, host_setting_id, user_id, body.from_date, body.to_date
    )
    return ClearSlotsResponse(
        data=ClearSlotsData(
            deleted_count=deleted,
            booked_kept_count=booked_kept,
            from_date=body.from_date,
            to_date=body.to_date,
        )
    )


@router.get("/booking-pages/{host_setting_id}/slots", response_model=SlotListResponse)
async def list_host_slots(
    host_setting_id: UUID,
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
    from_q: str = Query(..., alias="from"),
    to_q: str = Query(..., alias="to"),
    status_filter: str | None = Query(None, alias="status"),
):
    hs = await host_setting_service.get_owned_or_404(session, host_setting_id, user_id)
    from_d = _parse_date(from_q)
    to_d = _parse_date(to_q)
    start_utc, end_utc = _local_date_range_to_utc(hs.host_timezone, from_d, to_d)
    slots = await slot_service.list_slots_for_host(
        session, host_setting_id, user_id, start_utc, end_utc, status_filter
    )
    return SlotListResponse(
        data=SlotListData(items=[SlotRead.model_validate(s) for s in slots])
    )


@router.post("/slots/{slot_id}/block", response_model=SlotBlockedResponse)
async def block_slot(
    slot_id: UUID,
    session: SessionDep,
    redis: RedisDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
    body: BlockSlotRequest | None = Body(default=None),
):
    reason = body.reason if body else None
    slot = await slot_service.block_slot(session, slot_id, user_id, reason)
    await notification_service.publish_user_event(
        redis,
        user_id,
        "slot.updated",
        {"slot_id": str(slot.id), "status": slot.status},
    )
    return SlotBlockedResponse(
        data=SlotBlockedData(slot=SlotRead.model_validate(slot))
    )


@router.post("/slots/{slot_id}/unblock", response_model=SlotBlockedResponse)
async def unblock_slot(
    slot_id: UUID,
    session: SessionDep,
    redis: RedisDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
):
    slot = await slot_service.unblock_slot(session, slot_id, user_id)
    await notification_service.publish_user_event(
        redis,
        user_id,
        "slot.updated",
        {"slot_id": str(slot.id), "status": slot.status},
    )
    return SlotBlockedResponse(
        data=SlotBlockedData(slot=SlotRead.model_validate(slot))
    )
