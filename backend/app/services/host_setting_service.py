"""host_settings CRUD — 호스트 소유권 검증."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.error_codes import ErrorCode
from app.core.exceptions import AppError
from app.models.booking import Booking
from app.models.host_setting import HostSetting
from app.models.slot import Slot
from app.schemas.host_setting import HostSettingCreateRequest, HostSettingUpdateRequest


def _normalize_listing_category(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = raw.strip()
    return s or None


MARKETPLACE_UNCATEGORIZED_CATEGORY = "__uncategorized__"


def _escape_ilike(pattern: str) -> str:
    return (
        pattern.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


async def get_owned_or_404(
    session: AsyncSession, host_setting_id: UUID, user_id: UUID
) -> HostSetting:
    hs = await session.get(HostSetting, host_setting_id)
    if hs is None or hs.host_id != user_id:
        raise AppError(
            code=ErrorCode.HOST_SETTING_NOT_FOUND,
            message="예약 페이지를 찾을 수 없습니다.",
            status_code=404,
        )
    return hs


async def list_for_host(session: AsyncSession, user_id: UUID) -> list[HostSetting]:
    stmt = (
        select(HostSetting)
        .where(HostSetting.host_id == user_id)
        .order_by(HostSetting.updated_at.desc(), HostSetting.created_at.desc())
    )
    r = await session.execute(stmt)
    return list(r.scalars().all())


async def create_host_setting(
    session: AsyncSession, user_id: UUID, body: HostSettingCreateRequest
) -> HostSetting:
    if body.start_as_draft:
        is_active = False
        setup_completed = False
    else:
        is_active = True
        setup_completed = True
    hs = HostSetting(
        host_id=user_id,
        slug=body.slug.strip().lower(),
        title=body.title.strip(),
        description=body.description,
        host_timezone=body.host_timezone.strip(),
        slot_duration_mins=body.slot_duration_mins,
        buffer_duration_mins=body.buffer_duration_mins,
        approval_type=body.approval_type,
        booking_open_days_ahead=body.booking_open_days_ahead,
        booking_close_minutes_before=body.booking_close_minutes_before,
        cancel_deadline_minutes_before=body.cancel_deadline_minutes_before,
        max_active_bookings_per_user=body.max_active_bookings_per_user,
        is_active=is_active,
        is_listed=body.is_listed,
        listing_category=_normalize_listing_category(body.listing_category),
        setup_completed=setup_completed,
    )
    session.add(hs)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise AppError(
            code=ErrorCode.SLUG_ALREADY_EXISTS,
            message="이미 사용 중인 URL 식별자(slug)입니다.",
            status_code=409,
        ) from None
    await session.refresh(hs)
    return hs


async def update_host_setting(
    session: AsyncSession,
    host_setting_id: UUID,
    user_id: UUID,
    body: HostSettingUpdateRequest,
) -> HostSetting:
    hs = await get_owned_or_404(session, host_setting_id, user_id)
    data = body.model_dump(exclude_unset=True)
    if "listing_category" in data:
        data["listing_category"] = _normalize_listing_category(data["listing_category"])
    if "slug" in data and data["slug"] is not None:
        data["slug"] = data["slug"].strip().lower()
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    if "host_timezone" in data and data["host_timezone"] is not None:
        data["host_timezone"] = data["host_timezone"].strip()
    for k, v in data.items():
        setattr(hs, k, v)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise AppError(
            code=ErrorCode.SLUG_ALREADY_EXISTS,
            message="이미 사용 중인 URL 식별자(slug)입니다.",
            status_code=409,
        ) from None
    await session.refresh(hs)
    return hs


async def toggle_active(
    session: AsyncSession, host_setting_id: UUID, user_id: UUID, is_active: bool
) -> HostSetting:
    hs = await get_owned_or_404(session, host_setting_id, user_id)
    hs.is_active = is_active
    await session.commit()
    await session.refresh(hs)
    return hs


async def toggle_listed(
    session: AsyncSession, host_setting_id: UUID, user_id: UUID, is_listed: bool
) -> HostSetting:
    hs = await get_owned_or_404(session, host_setting_id, user_id)
    hs.is_listed = is_listed
    await session.commit()
    await session.refresh(hs)
    return hs


async def list_marketplace_booking_pages(
    session: AsyncSession,
    *,
    q: str | None,
    category: str | None,
    limit: int,
    cursor: str | None,
) -> tuple[list[HostSetting], str | None]:
    stmt = select(HostSetting).where(
        HostSetting.is_active.is_(True),
        HostSetting.is_listed.is_(True),
    )
    if category == MARKETPLACE_UNCATEGORIZED_CATEGORY:
        stmt = stmt.where(HostSetting.listing_category.is_(None))
    else:
        cat = category.strip() if category else None
        if cat:
            stmt = stmt.where(HostSetting.listing_category == cat)
    qn = q.strip() if q else None
    if qn:
        esc = _escape_ilike(qn)
        pat = f"%{esc}%"
        stmt = stmt.where(
            or_(
                HostSetting.title.ilike(pat, escape="\\"),
                HostSetting.description.ilike(pat, escape="\\"),
            )
        )
    if cursor:
        try:
            dt_part, id_part = cursor.rsplit("|", 1)
            cur_created = datetime.fromisoformat(dt_part.replace("Z", "+00:00"))
            cur_id = UUID(id_part)
        except (ValueError, IndexError) as e:
            raise AppError(
                code=ErrorCode.INVALID_INPUT,
                message="cursor 형식이 올바르지 않습니다.",
                status_code=400,
            ) from e
        stmt = stmt.where(
            or_(
                HostSetting.created_at < cur_created,
                and_(
                    HostSetting.created_at == cur_created,
                    HostSetting.id < cur_id,
                ),
            )
        )
    stmt = (
        stmt.order_by(HostSetting.created_at.desc(), HostSetting.id.desc())
        .limit(limit + 1)
    )
    r = await session.execute(stmt)
    rows = list(r.scalars().all())
    next_c: str | None = None
    if len(rows) > limit:
        rows = rows[:limit]
        last = rows[-1]
        next_c = f"{last.created_at.isoformat()}|{last.id}"
    return rows, next_c


async def get_public_by_slug(session: AsyncSession, slug: str) -> HostSetting:
    stmt = select(HostSetting).where(HostSetting.slug == slug.strip().lower())
    hs = await session.scalar(stmt)
    if hs is None:
        raise AppError(
            code=ErrorCode.BOOKING_PAGE_NOT_FOUND,
            message="예약 페이지를 찾을 수 없습니다.",
            status_code=404,
        )
    if not hs.is_active:
        raise AppError(
            code=ErrorCode.BOOKING_PAGE_INACTIVE,
            message="비공개 처리된 예약 페이지입니다.",
            status_code=403,
        )
    return hs


async def complete_setup_wizard(
    session: AsyncSession,
    host_setting_id: UUID,
    user_id: UUID,
    *,
    activate: bool,
) -> HostSetting:
    hs = await get_owned_or_404(session, host_setting_id, user_id)
    hs.setup_completed = True
    if activate:
        hs.is_active = True
    await session.commit()
    await session.refresh(hs)
    return hs


async def delete_host_setting(
    session: AsyncSession, host_setting_id: UUID, user_id: UUID
) -> None:
    hs = await get_owned_or_404(session, host_setting_id, user_id)
    slot_ids = select(Slot.id).where(Slot.host_setting_id == host_setting_id)
    await session.execute(delete(Booking).where(Booking.slot_id.in_(slot_ids)))
    await session.delete(hs)
    await session.commit()
