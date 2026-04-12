"""예약 생성·취소·호스트 승인/거절."""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.error_codes import ErrorCode
from app.core.exceptions import AppError
from app.models.booking import Booking
from app.models.host_setting import HostSetting
from app.models.schedule import ScheduleRule
from app.models.slot import Slot
from app.models.user import User
from app.services import hold_service
from app.schemas.booking import BookingRead, HostBookingListItem
from app.schemas.host_setting import HostBookingPageMetrics
from app.schemas.user import UserRead


async def _active_booking_count(session: AsyncSession, user_id: UUID) -> int:
    stmt = (
        select(func.count())
        .select_from(Booking)
        .where(
            Booking.booker_id == user_id,
            Booking.status.in_(("PENDING", "CONFIRMED")),
        )
    )
    n = await session.scalar(stmt)
    return int(n or 0)


async def create_booking(
    session: AsyncSession,
    redis: Redis,
    user_id: UUID,
    idempotency_key: str,
    slot_id: UUID,
    hold_token: str,
    request_message: str | None = None,
) -> tuple[Booking, str, str | None, bool]:
    """반환: (booking, slot_status, message, idempotent_replay)"""
    try:
        async with session.begin():
            existing = await session.scalar(
                select(Booking).where(
                    Booking.booker_id == user_id,
                    Booking.idempotency_key == idempotency_key,
                )
            )
            if existing is not None:
                if existing.slot_id != slot_id:
                    raise AppError(
                        code=ErrorCode.DUPLICATE_REQUEST,
                        message="같은 Idempotency-Key로 다른 슬롯을 예약할 수 없습니다.",
                        status_code=409,
                    )
                slot = await session.get(Slot, existing.slot_id)
                st = slot.status if slot else "OPEN"
                return existing, st, None, True

            await hold_service.verify_hold(redis, slot_id, user_id, hold_token)

            stmt = select(Slot).where(Slot.id == slot_id).with_for_update()
            slot = (await session.execute(stmt)).scalar_one_or_none()
            if slot is None:
                raise AppError(
                    code=ErrorCode.SLOT_NOT_FOUND,
                    message="슬롯을 찾을 수 없습니다.",
                    status_code=404,
                )
            if slot.status != "OPEN":
                raise AppError(
                    code=ErrorCode.SLOT_ALREADY_BOOKED,
                    message="이미 예약된 시간입니다.",
                    status_code=409,
                )

            hs = await session.get(HostSetting, slot.host_setting_id)
            if hs is None:
                raise AppError(
                    code=ErrorCode.BOOKING_PAGE_NOT_FOUND,
                    message="예약 페이지를 찾을 수 없습니다.",
                    status_code=404,
                )

            tz = ZoneInfo(hs.host_timezone)
            now_local = datetime.now(timezone.utc).astimezone(tz)
            slot_local = slot.start_time.astimezone(tz)
            close_deadline = slot_local - timedelta(minutes=hs.booking_close_minutes_before)
            if now_local > close_deadline:
                raise AppError(
                    code=ErrorCode.POLICY_VIOLATION,
                    message="예약 마감 시간이 지났습니다.",
                    status_code=422,
                )
            today_local = now_local.date()
            if slot_local.date() < today_local:
                raise AppError(
                    code=ErrorCode.POLICY_VIOLATION,
                    message="과거 슬롯은 예약할 수 없습니다.",
                    status_code=422,
                )
            if slot_local.date() > today_local + timedelta(days=hs.booking_open_days_ahead):
                raise AppError(
                    code=ErrorCode.POLICY_VIOLATION,
                    message="예약 가능 기간을 초과했습니다.",
                    status_code=422,
                )

            if await _active_booking_count(session, user_id) >= hs.max_active_bookings_per_user:
                raise AppError(
                    code=ErrorCode.POLICY_VIOLATION,
                    message="활성 예약 가능 건수를 초과했습니다.",
                    status_code=422,
                )

            if hs.approval_type == "AUTO":
                b_status = "CONFIRMED"
                msg = "예약이 확정되었습니다."
            else:
                b_status = "PENDING"
                msg = "예약 요청이 접수되었습니다. 호스트 승인을 기다려 주세요."

            now = datetime.now(timezone.utc)
            booking = Booking(
                slot_id=slot_id,
                booker_id=user_id,
                status=b_status,
                idempotency_key=idempotency_key,
                request_message=request_message,
                confirmed_at=now if b_status == "CONFIRMED" else None,
            )
            session.add(booking)
            slot.status = "BOOKED"
            await session.flush()
    except AppError:
        await hold_service.release_hold(redis, slot_id)
        raise
    except IntegrityError:
        await hold_service.release_hold(redis, slot_id)
        raise AppError(
            code=ErrorCode.SLOT_ALREADY_BOOKED,
            message="이미 예약된 시간입니다.",
            status_code=409,
        ) from None

    await hold_service.release_hold(redis, slot_id)
    await session.refresh(booking)
    return booking, "BOOKED", msg, False


async def list_my_bookings(
    session: AsyncSession,
    user_id: UUID,
    status: str | None,
    limit: int,
    cursor: str | None,
) -> tuple[list[Booking], str | None]:
    stmt = select(Booking).where(Booking.booker_id == user_id)
    if status:
        stmt = stmt.where(Booking.status == status)
    if cursor:
        try:
            cur_dt_str, cur_id_str = cursor.split("|", 1)
            cur_dt = datetime.fromisoformat(cur_dt_str)
            cur_id = UUID(cur_id_str)
            stmt = stmt.where(
                (Booking.created_at < cur_dt)
                | ((Booking.created_at == cur_dt) & (Booking.id < cur_id))
            )
        except (ValueError, TypeError):
            pass
    stmt = stmt.order_by(Booking.created_at.desc(), Booking.id.desc()).limit(limit + 1)
    r = await session.execute(stmt)
    rows = list(r.scalars().all())
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        last = rows[-1]
        next_cursor = f"{last.created_at.isoformat()}|{last.id}"
    return rows, next_cursor


async def can_booker_cancel(session: AsyncSession, booking: Booking, user_id: UUID) -> bool:
    if booking.booker_id != user_id:
        return False
    if booking.status not in ("PENDING", "CONFIRMED"):
        return False
    slot = await session.get(Slot, booking.slot_id)
    if slot is None:
        return False
    hs = await session.get(HostSetting, slot.host_setting_id)
    if hs is None:
        return False
    tz = ZoneInfo(hs.host_timezone)
    now_local = datetime.now(timezone.utc).astimezone(tz)
    slot_local = slot.start_time.astimezone(tz)
    cancel_deadline = slot_local - timedelta(minutes=hs.cancel_deadline_minutes_before)
    return now_local <= cancel_deadline


async def get_my_booking(session: AsyncSession, booking_id: UUID, user_id: UUID) -> Booking:
    b = await session.get(Booking, booking_id)
    if b is None or b.booker_id != user_id:
        raise AppError(
            code=ErrorCode.BOOKING_NOT_FOUND,
            message="예약을 찾을 수 없습니다.",
            status_code=404,
        )
    return b


async def cancel_my_booking(
    session: AsyncSession,
    booking_id: UUID,
    user_id: UUID,
    cancel_reason: str | None = None,
) -> Booking:
    b = await get_my_booking(session, booking_id, user_id)
    if b.status in ("CANCELLED", "REJECTED", "COMPLETED", "NO_SHOW"):
        raise AppError(
            code=ErrorCode.INVALID_BOOKING_STATUS,
            message="취소할 수 없는 상태입니다.",
            status_code=409,
        )
    slot = await session.get(Slot, b.slot_id)
    hs = await session.get(HostSetting, slot.host_setting_id) if slot else None
    if hs and slot:
        tz = ZoneInfo(hs.host_timezone)
        now_local = datetime.now(timezone.utc).astimezone(tz)
        slot_local = slot.start_time.astimezone(tz)
        cancel_deadline = slot_local - timedelta(minutes=hs.cancel_deadline_minutes_before)
        if now_local > cancel_deadline:
            raise AppError(
                code=ErrorCode.CANCELLATION_DEADLINE_PASSED,
                message="예약 취소 가능 시간이 지났습니다.",
                status_code=409,
            )
    b.status = "CANCELLED"
    b.cancelled_at = datetime.now(timezone.utc)
    if cancel_reason:
        b.status_reason = cancel_reason.strip()[:255]
    if slot:
        slot.status = "OPEN"
    await session.commit()
    await session.refresh(b)
    return b


async def host_page_metrics_batch(
    session: AsyncSession,
    page_ids: list[UUID],
) -> dict[UUID, HostBookingPageMetrics]:
    """호스트 예약 페이지 목록 카드용 지표(슬롯 시작 시각 기준 UTC 주간·일간)."""
    if not page_ids:
        return {}
    out: dict[UUID, HostBookingPageMetrics] = {
        pid: HostBookingPageMetrics() for pid in page_ids
    }
    now = datetime.now(timezone.utc)
    today_d = now.date()
    today_start = datetime.combine(today_d, time.min, tzinfo=timezone.utc)
    today_end = today_start + timedelta(days=1)
    week_start = today_start - timedelta(days=today_d.weekday())
    week_end = week_start + timedelta(days=7)

    r = await session.execute(
        select(ScheduleRule.host_setting_id, func.count())
        .where(ScheduleRule.host_setting_id.in_(page_ids))
        .group_by(ScheduleRule.host_setting_id)
    )
    for hs_id, c in r.all():
        out[hs_id].rules_count = int(c)

    r2 = await session.execute(
        select(Slot.host_setting_id, func.count())
        .where(
            Slot.host_setting_id.in_(page_ids),
            Slot.status == "OPEN",
        )
        .group_by(Slot.host_setting_id)
    )
    for hs_id, c in r2.all():
        out[hs_id].open_slots_count = int(c)

    r3 = await session.execute(
        select(Slot.host_setting_id, func.count())
        .select_from(Booking)
        .join(Slot, Slot.id == Booking.slot_id)
        .where(
            Slot.host_setting_id.in_(page_ids),
            ~Booking.status.in_(("CANCELLED", "REJECTED")),
            Slot.start_time >= today_start,
            Slot.start_time < today_end,
        )
        .group_by(Slot.host_setting_id)
    )
    for hs_id, c in r3.all():
        out[hs_id].today_bookings = int(c)

    r4 = await session.execute(
        select(Slot.host_setting_id, func.count())
        .select_from(Booking)
        .join(Slot, Slot.id == Booking.slot_id)
        .where(
            Slot.host_setting_id.in_(page_ids),
            ~Booking.status.in_(("CANCELLED", "REJECTED")),
            Slot.start_time >= week_start,
            Slot.start_time < week_end,
        )
        .group_by(Slot.host_setting_id)
    )
    for hs_id, c in r4.all():
        out[hs_id].week_bookings = int(c)

    r5 = await session.execute(
        select(Slot.host_setting_id, func.count())
        .select_from(Booking)
        .join(Slot, Slot.id == Booking.slot_id)
        .where(
            Slot.host_setting_id.in_(page_ids),
            Booking.status == "PENDING",
        )
        .group_by(Slot.host_setting_id)
    )
    for hs_id, c in r5.all():
        out[hs_id].pending_bookings = int(c)

    return out


async def list_host_bookings(
    session: AsyncSession,
    user_id: UUID,
    host_setting_id: UUID | None,
    status: str | None,
) -> list[HostBookingListItem]:
    stmt = (
        select(Booking, User)
        .join(Slot, Slot.id == Booking.slot_id)
        .join(HostSetting, HostSetting.id == Slot.host_setting_id)
        .join(User, User.id == Booking.booker_id)
        .where(HostSetting.host_id == user_id)
    )
    if host_setting_id is not None:
        stmt = stmt.where(HostSetting.id == host_setting_id)
    if status:
        stmt = stmt.where(Booking.status == status)
    stmt = stmt.order_by(Booking.created_at.desc())
    r = await session.execute(stmt)
    out: list[HostBookingListItem] = []
    for booking, booker in r.all():
        base = BookingRead.model_validate(booking)
        out.append(
            HostBookingListItem(
                **base.model_dump(),
                booker_name=booker.name,
                booker_email=str(booker.email),
            )
        )
    return out


async def get_host_booking_detail(
    session: AsyncSession, booking_id: UUID, user_id: UUID
) -> tuple[Booking, UserRead | None]:
    stmt = (
        select(Booking)
        .join(Slot, Slot.id == Booking.slot_id)
        .join(HostSetting, HostSetting.id == Slot.host_setting_id)
        .where(Booking.id == booking_id, HostSetting.host_id == user_id)
    )
    b = await session.scalar(stmt)
    if b is None:
        raise AppError(
            code=ErrorCode.BOOKING_NOT_FOUND,
            message="예약을 찾을 수 없습니다.",
            status_code=404,
        )
    booker = await session.get(User, b.booker_id)
    br = UserRead.model_validate(booker) if booker else None
    return b, br


async def approve_booking(session: AsyncSession, booking_id: UUID, user_id: UUID) -> Booking:
    b, _ = await get_host_booking_detail(session, booking_id, user_id)
    if b.status != "PENDING":
        raise AppError(
            code=ErrorCode.INVALID_BOOKING_STATUS,
            message="승인할 수 없는 상태입니다.",
            status_code=409,
        )
    b.status = "CONFIRMED"
    b.confirmed_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(b)
    return b


async def reject_booking(
    session: AsyncSession, booking_id: UUID, user_id: UUID, reason: str
) -> Booking:
    b, _ = await get_host_booking_detail(session, booking_id, user_id)
    if b.status != "PENDING":
        raise AppError(
            code=ErrorCode.INVALID_BOOKING_STATUS,
            message="거절할 수 없는 상태입니다.",
            status_code=409,
        )
    b.status = "REJECTED"
    b.status_reason = reason
    b.rejected_at = datetime.now(timezone.utc)
    slot = await session.get(Slot, b.slot_id)
    if slot:
        slot.status = "OPEN"
    await session.commit()
    await session.refresh(b)
    return b
