"""슬롯 생성·조회·차단 — 규칙/예외 반영(MVP)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.error_codes import ErrorCode
from app.core.exceptions import AppError
from app.models.booking import Booking
from app.models.host_setting import HostSetting
from app.models.schedule import ScheduleOverride, ScheduleRule
from app.models.slot import Slot
from app.services import host_setting_service


def _rule_effective(rule: ScheduleRule, d: date) -> bool:
    if rule.effective_start_date and d < rule.effective_start_date:
        return False
    if rule.effective_end_date and d > rule.effective_end_date:
        return False
    return True


def _merge_intervals(raw: list[tuple[time, time]]) -> list[tuple[time, time]]:
    if not raw:
        return []
    s = sorted(raw, key=lambda x: (x[0], x[1]))
    out: list[tuple[time, time]] = [s[0]]
    for a, b in s[1:]:
        la, lb = out[-1]
        if a <= lb:
            out[-1] = (la, max(lb, b))
        else:
            out.append((a, b))
    return out


def _subtract_intervals(
    intervals: list[tuple[time, time]], cuts: list[tuple[time, time]]
) -> list[tuple[time, time]]:
    if not cuts:
        return intervals
    result: list[tuple[time, time]] = []
    for a, b in intervals:
        cur: list[tuple[time, time]] = [(a, b)]
        for ca, cb in sorted(cuts, key=lambda x: (x[0], x[1])):
            nxt: list[tuple[time, time]] = []
            for x0, x1 in cur:
                if cb <= x0 or ca >= x1:
                    nxt.append((x0, x1))
                else:
                    if ca > x0:
                        nxt.append((x0, min(ca, x1)))
                    if cb < x1:
                        nxt.append((max(cb, x0), x1))
            cur = [(p, q) for p, q in nxt if p < q]
        result.extend(cur)
    return _merge_intervals(result)


def _local_to_utc(d: date, t: time, tz: ZoneInfo) -> datetime:
    return datetime.combine(d, t, tzinfo=tz).astimezone(timezone.utc)


def _emit_slot_windows(
    utc_start: datetime, utc_end: datetime, duration_mins: int, buffer_mins: int
) -> list[tuple[datetime, datetime]]:
    out: list[tuple[datetime, datetime]] = []
    dur = timedelta(minutes=duration_mins)
    buf = timedelta(minutes=buffer_mins)
    t = utc_start
    while t + dur <= utc_end:
        out.append((t, t + dur))
        t = t + dur + buf
    return out


async def generate_slots(
    session: AsyncSession,
    host_setting_id: UUID,
    user_id: UUID,
    from_date: date,
    to_date: date,
) -> tuple[int, int]:
    if to_date < from_date:
        raise AppError(
            code=ErrorCode.INVALID_DATE_RANGE,
            message="종료일이 시작일보다 빠릅니다.",
            status_code=422,
        )
    hs = await host_setting_service.get_owned_or_404(session, host_setting_id, user_id)
    rules_r = await session.execute(
        select(ScheduleRule).where(ScheduleRule.host_setting_id == host_setting_id)
    )
    rules = list(rules_r.scalars().all())
    ov_r = await session.execute(
        select(ScheduleOverride).where(
            ScheduleOverride.host_setting_id == host_setting_id,
            ScheduleOverride.override_date >= from_date,
            ScheduleOverride.override_date <= to_date,
        )
    )
    overrides = list(ov_r.scalars().all())

    tz = ZoneInfo(hs.host_timezone)
    generated = 0
    skipped = 0
    d = from_date
    while d <= to_date:
        if any(o.override_date == d and o.override_type == "DAY_OFF" for o in overrides):
            d += timedelta(days=1)
            continue

        wd = d.weekday()
        open_rules = [
            r
            for r in rules
            if r.rule_type == "OPEN" and r.day_of_week == wd and _rule_effective(r, d)
        ]
        break_rules = [
            r
            for r in rules
            if r.rule_type == "BREAK" and r.day_of_week == wd and _rule_effective(r, d)
        ]
        if not open_rules:
            d += timedelta(days=1)
            continue

        open_intervals = [(r.start_time, r.end_time) for r in open_rules]
        open_intervals = _merge_intervals(open_intervals)
        break_intervals = [(r.start_time, r.end_time) for r in break_rules]
        open_intervals = _subtract_intervals(open_intervals, break_intervals)

        block_cuts = [
            (o.start_time, o.end_time)
            for o in overrides
            if o.override_date == d
            and o.override_type == "BLOCK"
            and o.start_time
            and o.end_time
        ]
        open_intervals = _subtract_intervals(open_intervals, block_cuts)

        for o in overrides:
            if (
                o.override_date == d
                and o.override_type == "OPEN"
                and o.start_time
                and o.end_time
            ):
                open_intervals.append((o.start_time, o.end_time))
        open_intervals = _merge_intervals(open_intervals)

        for st_local, et_local in open_intervals:
            utc_s = _local_to_utc(d, st_local, tz)
            utc_e = _local_to_utc(d, et_local, tz)
            for slot_start, slot_end in _emit_slot_windows(
                utc_s, utc_e, hs.slot_duration_mins, hs.buffer_duration_mins
            ):
                exists = await session.scalar(
                    select(Slot.id).where(
                        Slot.host_setting_id == hs.id,
                        Slot.start_time == slot_start,
                    )
                )
                if exists:
                    skipped += 1
                    continue
                session.add(
                    Slot(
                        host_setting_id=hs.id,
                        start_time=slot_start,
                        end_time=slot_end,
                        status="OPEN",
                    )
                )
                generated += 1
        d += timedelta(days=1)

    await session.commit()
    return generated, skipped


async def clear_slots_in_range(
    session: AsyncSession,
    host_setting_id: UUID,
    user_id: UUID,
    from_date: date,
    to_date: date,
) -> tuple[int, int]:
    """기간 내 예약 이력이 없는 OPEN·BLOCKED 슬롯만 삭제.

    취소·거절 후 슬롯이 다시 OPEN이어도 `bookings` 행이 남으므로 삭제하지 않습니다.
    반환: (삭제 건수, 예약이 연결되어 유지된 슬롯 수(구간 내 distinct)).
    """
    if to_date < from_date:
        raise AppError(
            code=ErrorCode.INVALID_DATE_RANGE,
            message="종료일이 시작일보다 빠릅니다.",
            status_code=422,
        )
    hs = await host_setting_service.get_owned_or_404(session, host_setting_id, user_id)
    tz = ZoneInfo(hs.host_timezone)
    start_utc = datetime.combine(from_date, time.min, tzinfo=tz).astimezone(timezone.utc)
    end_utc = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=tz).astimezone(
        timezone.utc
    )

    slot_in_range = (
        Slot.host_setting_id == host_setting_id,
        Slot.start_time >= start_utc,
        Slot.start_time < end_utc,
    )
    has_booking = select(Booking.id).where(Booking.slot_id == Slot.id).exists()

    booked_kept = int(
        await session.scalar(
            select(func.count(func.distinct(Slot.id)))
            .select_from(Slot)
            .join(Booking, Booking.slot_id == Slot.id)
            .where(*slot_in_range)
        )
        or 0
    )

    result = await session.execute(
        delete(Slot).where(
            *slot_in_range,
            Slot.status.in_(("OPEN", "BLOCKED")),
            ~has_booking,
        )
    )
    deleted = int(result.rowcount or 0)
    await session.commit()
    return deleted, booked_kept


async def list_slots_for_host(
    session: AsyncSession,
    host_setting_id: UUID,
    user_id: UUID,
    from_utc: datetime,
    to_utc: datetime,
    status: str | None = None,
) -> list[Slot]:
    await host_setting_service.get_owned_or_404(session, host_setting_id, user_id)
    stmt = select(Slot).where(
        Slot.host_setting_id == host_setting_id,
        Slot.start_time >= from_utc,
        Slot.start_time < to_utc,
    )
    if status:
        stmt = stmt.where(Slot.status == status)
    stmt = stmt.order_by(Slot.start_time)
    r = await session.execute(stmt)
    return list(r.scalars().all())


async def list_slots_public(
    session: AsyncSession, host_setting: HostSetting, from_utc: datetime, to_utc: datetime
) -> list[Slot]:
    stmt = (
        select(Slot)
        .where(
            Slot.host_setting_id == host_setting.id,
            Slot.start_time >= from_utc,
            Slot.start_time < to_utc,
        )
        .order_by(Slot.start_time)
    )
    r = await session.execute(stmt)
    return list(r.scalars().all())


async def get_slot_owned(session: AsyncSession, slot_id: UUID, user_id: UUID) -> Slot:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise AppError(
            code=ErrorCode.SLOT_NOT_FOUND,
            message="슬롯을 찾을 수 없습니다.",
            status_code=404,
        )
    hs = await session.get(HostSetting, slot.host_setting_id)
    if hs is None or hs.host_id != user_id:
        raise AppError(
            code=ErrorCode.FORBIDDEN,
            message="이 슬롯을 수정할 권한이 없습니다.",
            status_code=403,
        )
    return slot


async def block_slot(
    session: AsyncSession, slot_id: UUID, user_id: UUID, reason: str | None
) -> Slot:
    slot = await get_slot_owned(session, slot_id, user_id)
    if slot.status == "BOOKED":
        raise AppError(
            code=ErrorCode.SLOT_ALREADY_BOOKED,
            message="이미 예약된 슬롯은 차단할 수 없습니다.",
            status_code=409,
        )
    slot.status = "BLOCKED"
    await session.commit()
    await session.refresh(slot)
    return slot


async def unblock_slot(session: AsyncSession, slot_id: UUID, user_id: UUID) -> Slot:
    slot = await get_slot_owned(session, slot_id, user_id)
    if slot.status != "BLOCKED":
        raise AppError(
            code=ErrorCode.SLOT_NOT_BLOCKED,
            message="차단된 슬롯이 아닙니다.",
            status_code=409,
        )
    slot.status = "OPEN"
    await session.commit()
    await session.refresh(slot)
    return slot


async def get_slot_or_404(session: AsyncSession, slot_id: UUID) -> Slot:
    slot = await session.get(Slot, slot_id)
    if slot is None:
        raise AppError(
            code=ErrorCode.SLOT_NOT_FOUND,
            message="슬롯을 찾을 수 없습니다.",
            status_code=404,
        )
    return slot
