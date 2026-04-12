"""공개 예약 페이지·슬롯 조회."""

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Query, status
from zoneinfo import ZoneInfo

from app.api.v1.deps import SessionDep
from app.core.error_codes import ErrorCode
from app.core.exceptions import AppError
from app.schemas.host_setting import (
    HostSettingRead,
    MarketplaceBookingPageItem,
    MarketplaceBookingPagesData,
    MarketplaceBookingPagesResponse,
)
from app.schemas.slot import (
    PublicBookingPageResponse,
    PublicSlotsCalendarData,
    PublicSlotsCalendarResponse,
    PublicSlotsDayGroup,
    SlotListData,
    SlotListResponse,
    SlotRead,
)
from app.services import host_setting_service, slot_service

router = APIRouter(prefix="/public", tags=["public"])


def _parse_date(q: str) -> date:
    try:
        return date.fromisoformat(q)
    except ValueError as e:
        raise AppError(
            code=ErrorCode.INVALID_DATE,
            message="날짜 형식이 올바르지 않습니다.",
            status_code=400,
        ) from e


@router.get(
    "/marketplace/booking-pages",
    response_model=MarketplaceBookingPagesResponse,
    status_code=status.HTTP_200_OK,
)
async def list_marketplace_booking_pages(
    session: SessionDep,
    q: str | None = Query(None, description="제목·설명 부분 일치 검색"),
    category: str | None = Query(
        None,
        description=(
            "listing_category 일치. "
            f"`{host_setting_service.MARKETPLACE_UNCATEGORIZED_CATEGORY}` 이면 미분류"
        ),
    ),
    limit: int = Query(24, ge=1, le=100),
    cursor: str | None = Query(None),
):
    cat_for_svc = category.strip() if category else None
    rows, next_c = await host_setting_service.list_marketplace_booking_pages(
        session,
        q=q,
        category=cat_for_svc,
        limit=limit,
        cursor=cursor,
    )
    items = [
        MarketplaceBookingPageItem(
            slug=x.slug,
            title=x.title,
            description=x.description,
            listing_category=x.listing_category,
        )
        for x in rows
    ]
    return MarketplaceBookingPagesResponse(
        data=MarketplaceBookingPagesData(items=items, next_cursor=next_c)
    )


@router.get("/booking-pages/{slug}", response_model=PublicBookingPageResponse)
async def get_public_booking_page(slug: str, session: SessionDep):
    hs = await host_setting_service.get_public_by_slug(session, slug)
    return PublicBookingPageResponse(data=HostSettingRead.model_validate(hs))


@router.get("/booking-pages/{slug}/slots", response_model=PublicSlotsCalendarResponse)
async def list_public_slots_range(
    slug: str,
    session: SessionDep,
    from_q: str = Query(..., alias="from"),
    to_q: str = Query(..., alias="to"),
):
    hs = await host_setting_service.get_public_by_slug(session, slug)
    from_d = _parse_date(from_q)
    to_d = _parse_date(to_q)
    if to_d < from_d:
        raise AppError(
            code=ErrorCode.INVALID_DATE_RANGE,
            message="종료일이 시작일보다 빠릅니다.",
            status_code=422,
        )
    tz = ZoneInfo(hs.host_timezone)
    start = datetime.combine(from_d, time.min, tzinfo=tz).astimezone(timezone.utc)
    end = datetime.combine(to_d + timedelta(days=1), time.min, tzinfo=tz).astimezone(timezone.utc)
    slots = await slot_service.list_slots_public(session, hs, start, end)
    by_date: dict[str, list[SlotRead]] = defaultdict(list)
    for s in slots:
        key = s.start_time.astimezone(tz).date().isoformat()
        by_date[key].append(SlotRead.model_validate(s))
    day_keys = sorted(by_date.keys())
    days = [
        PublicSlotsDayGroup(
            date=d,
            slots=sorted(by_date[d], key=lambda x: x.start_time),
        )
        for d in day_keys
    ]
    return PublicSlotsCalendarResponse(data=PublicSlotsCalendarData(days=days))


@router.get("/booking-pages/{slug}/slots/daily", response_model=SlotListResponse)
async def list_public_slots_daily(
    slug: str,
    session: SessionDep,
    date_q: str = Query(..., alias="date"),
):
    hs = await host_setting_service.get_public_by_slug(session, slug)
    d = _parse_date(date_q)
    tz = ZoneInfo(hs.host_timezone)
    start = datetime.combine(d, time.min, tzinfo=tz).astimezone(timezone.utc)
    end = datetime.combine(d + timedelta(days=1), time.min, tzinfo=tz).astimezone(timezone.utc)
    slots = await slot_service.list_slots_public(session, hs, start, end)
    return SlotListResponse(
        data=SlotListData(items=[SlotRead.model_validate(s) for s in slots])
    )
