"""호스트 통계 집계."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Query

from app.api.v1.deps import CurrentUserIdDep, HostPayloadDep, SessionDep
from app.core.error_codes import ErrorCode
from app.core.exceptions import AppError
from app.schemas.analytics import AnalyticsSummaryResponse, PopularSlotsResponse, PopularSlotsData
from app.services import analytics_service, host_setting_service

router = APIRouter(prefix="/host/analytics", tags=["analytics"])


def _parse_date(q: str) -> date:
    try:
        return date.fromisoformat(q)
    except ValueError as e:
        raise AppError(
            code=ErrorCode.INVALID_DATE,
            message="날짜 형식이 올바르지 않습니다.",
            status_code=400,
        ) from e


@router.get("/summary", response_model=AnalyticsSummaryResponse)
async def analytics_summary(
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
    from_q: str = Query(..., alias="from"),
    to_q: str = Query(..., alias="to"),
    host_setting_id: UUID | None = Query(None, alias="hostSettingId"),
):
    from_d = _parse_date(from_q)
    to_d = _parse_date(to_q)
    if to_d < from_d:
        raise AppError(
            code=ErrorCode.INVALID_DATE_RANGE,
            message="종료일이 시작일보다 빠릅니다.",
            status_code=422,
        )
    if host_setting_id is not None:
        await host_setting_service.get_owned_or_404(session, host_setting_id, user_id)
    data = await analytics_service.build_summary(
        session, user_id, host_setting_id, from_d, to_d
    )
    return AnalyticsSummaryResponse(data=data)


@router.get("/popular-slots", response_model=PopularSlotsResponse)
async def analytics_popular_slots(
    session: SessionDep,
    user_id: CurrentUserIdDep,
    _: HostPayloadDep,
    from_q: str = Query(..., alias="from"),
    to_q: str = Query(..., alias="to"),
    host_setting_id: UUID | None = Query(None, alias="hostSettingId"),
):
    from_d = _parse_date(from_q)
    to_d = _parse_date(to_q)
    if to_d < from_d:
        raise AppError(
            code=ErrorCode.INVALID_DATE_RANGE,
            message="종료일이 시작일보다 빠릅니다.",
            status_code=422,
        )
    if host_setting_id is not None:
        await host_setting_service.get_owned_or_404(session, host_setting_id, user_id)
    items = await analytics_service.popular_slots_only(
        session, user_id, host_setting_id, from_d, to_d
    )
    return PopularSlotsResponse(data=PopularSlotsData(items=items))
