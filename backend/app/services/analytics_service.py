"""호스트 통계 — 기간·타임존 기준 집계."""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking
from app.models.host_setting import HostSetting
from app.models.slot import Slot
from app.schemas.analytics import AnalyticsSummaryData, PopularSlotHour
from app.services import host_setting_service


def _utc_range_for_local_dates(
    from_d: date, to_d: date, tz_name: str
) -> tuple[datetime, datetime]:
    tz = ZoneInfo(tz_name)
    start = datetime.combine(from_d, time.min, tzinfo=tz).astimezone(timezone.utc)
    end = datetime.combine(to_d + timedelta(days=1), time.min, tzinfo=tz).astimezone(
        timezone.utc
    )
    return start, end


async def build_summary(
    session: AsyncSession,
    user_id: UUID,
    host_setting_id: UUID | None,
    from_d: date,
    to_d: date,
) -> AnalyticsSummaryData:
    if host_setting_id is not None:
        hs = await host_setting_service.get_owned_or_404(session, host_setting_id, user_id)
        tz_name = hs.host_timezone
    else:
        tz_name = "UTC"

    start_utc, end_utc = _utc_range_for_local_dates(from_d, to_d, tz_name)

    base = (
        select(Booking)
        .join(Slot, Slot.id == Booking.slot_id)
        .join(HostSetting, HostSetting.id == Slot.host_setting_id)
        .where(
            HostSetting.host_id == user_id,
            Booking.created_at >= start_utc,
            Booking.created_at < end_utc,
        )
    )
    if host_setting_id is not None:
        base = base.where(HostSetting.id == host_setting_id)

    r = await session.execute(base)
    bookings = list(r.scalars().all())

    total = len(bookings)
    n_days = max(1, (to_d - from_d).days + 1)
    n_weeks = max(1, (n_days + 6) // 7)
    daily_count = total // n_days
    weekly_count = total // n_weeks

    decided = [b for b in bookings if b.status in ("CONFIRMED", "REJECTED")]
    conf = sum(1 for b in decided if b.status == "CONFIRMED")
    rej = sum(1 for b in decided if b.status == "REJECTED")
    approval_rate = (conf / (conf + rej)) if (conf + rej) else 0.0

    # 슬롯 시작 시각(호스트 TZ) 기준 시간대 분포
    slot_ids = {b.slot_id for b in bookings}
    popular_slots: list[PopularSlotHour] = []
    if slot_ids:
        stmt_slots = select(Slot, HostSetting).join(
            HostSetting, HostSetting.id == Slot.host_setting_id
        ).where(Slot.id.in_(slot_ids), HostSetting.host_id == user_id)
        if host_setting_id is not None:
            stmt_slots = stmt_slots.where(HostSetting.id == host_setting_id)
        sr = await session.execute(stmt_slots)
        pair_rows = sr.all()
        slot_map: dict[UUID, Slot] = {s.id: s for s, _ in pair_rows}
        tz_by_slot: dict[UUID, str] = {s.id: h.host_timezone for s, h in pair_rows}
        counter: Counter[int] = Counter()
        for b in bookings:
            if b.status not in ("PENDING", "CONFIRMED", "COMPLETED"):
                continue
            slot = slot_map.get(b.slot_id)
            if slot is None:
                continue
            tz_n = tz_by_slot.get(b.slot_id, tz_name)
            h = slot.start_time.astimezone(ZoneInfo(tz_n)).hour
            counter[h] += 1
        popular_slots = [
            PopularSlotHour(hour=h, count=c)
            for h, c in sorted(counter.items(), key=lambda x: (-x[1], x[0]))
        ]

    return AnalyticsSummaryData(
        daily_count=daily_count,
        weekly_count=weekly_count,
        approval_rate=round(approval_rate, 4),
        popular_slots=popular_slots,
    )


async def popular_slots_only(
    session: AsyncSession,
    user_id: UUID,
    host_setting_id: UUID | None,
    from_d: date,
    to_d: date,
) -> list[PopularSlotHour]:
    summary = await build_summary(session, user_id, host_setting_id, from_d, to_d)
    return summary.popular_slots
