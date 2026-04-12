"""schedule_rules / schedule_overrides — 호스트 소유권."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.error_codes import ErrorCode
from app.core.exceptions import AppError
from app.models.host_setting import HostSetting
from app.models.schedule import ScheduleOverride, ScheduleRule
from app.schemas.schedule import (
    ScheduleOverrideCreateRequest,
    ScheduleOverrideUpdateRequest,
    ScheduleRuleCreateRequest,
    ScheduleRuleUpdateRequest,
)
from app.services import host_setting_service


async def _ensure_setting_owner(
    session: AsyncSession, host_setting_id: UUID, user_id: UUID
) -> None:
    await host_setting_service.get_owned_or_404(session, host_setting_id, user_id)


async def list_rules(
    session: AsyncSession, host_setting_id: UUID, user_id: UUID
) -> list[ScheduleRule]:
    await _ensure_setting_owner(session, host_setting_id, user_id)
    stmt = (
        select(ScheduleRule)
        .where(ScheduleRule.host_setting_id == host_setting_id)
        .order_by(ScheduleRule.day_of_week, ScheduleRule.start_time)
    )
    r = await session.execute(stmt)
    return list(r.scalars().all())


async def create_rule(
    session: AsyncSession,
    host_setting_id: UUID,
    user_id: UUID,
    body: ScheduleRuleCreateRequest,
) -> ScheduleRule:
    await _ensure_setting_owner(session, host_setting_id, user_id)
    if body.end_time <= body.start_time:
        raise AppError(
            code=ErrorCode.INVALID_TIME_RANGE,
            message="종료 시각은 시작 시각보다 커야 합니다.",
            status_code=422,
        )
    rule = ScheduleRule(
        host_setting_id=host_setting_id,
        day_of_week=body.day_of_week,
        start_time=body.start_time,
        end_time=body.end_time,
        rule_type=body.rule_type,
        effective_start_date=body.effective_start_date,
        effective_end_date=body.effective_end_date,
    )
    session.add(rule)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise AppError(
            code=ErrorCode.OVERLAPPING_RULE,
            message="겹치는 운영 규칙이 있습니다.",
            status_code=409,
        ) from None
    await session.refresh(rule)
    return rule


async def get_rule_owned(
    session: AsyncSession, rule_id: UUID, user_id: UUID
) -> ScheduleRule:
    stmt = (
        select(ScheduleRule)
        .join(HostSetting, HostSetting.id == ScheduleRule.host_setting_id)
        .where(ScheduleRule.id == rule_id, HostSetting.host_id == user_id)
    )
    rule = await session.scalar(stmt)
    if rule is None:
        raise AppError(
            code=ErrorCode.RULE_NOT_FOUND,
            message="운영 규칙을 찾을 수 없습니다.",
            status_code=404,
        )
    return rule


async def update_rule(
    session: AsyncSession, rule_id: UUID, user_id: UUID, body: ScheduleRuleUpdateRequest
) -> ScheduleRule:
    rule = await get_rule_owned(session, rule_id, user_id)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(rule, k, v)
    if rule.end_time <= rule.start_time:
        raise AppError(
            code=ErrorCode.INVALID_TIME_RANGE,
            message="종료 시각은 시작 시각보다 커야 합니다.",
            status_code=422,
        )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise AppError(
            code=ErrorCode.OVERLAPPING_RULE,
            message="겹치는 운영 규칙이 있습니다.",
            status_code=409,
        ) from None
    await session.refresh(rule)
    return rule


async def delete_rule(session: AsyncSession, rule_id: UUID, user_id: UUID) -> None:
    rule = await get_rule_owned(session, rule_id, user_id)
    await session.delete(rule)
    await session.commit()


async def list_overrides(
    session: AsyncSession,
    host_setting_id: UUID,
    user_id: UUID,
    from_date,
    to_date,
) -> list[ScheduleOverride]:
    await _ensure_setting_owner(session, host_setting_id, user_id)
    stmt = (
        select(ScheduleOverride)
        .where(
            ScheduleOverride.host_setting_id == host_setting_id,
            ScheduleOverride.override_date >= from_date,
            ScheduleOverride.override_date <= to_date,
        )
        .order_by(ScheduleOverride.override_date)
    )
    r = await session.execute(stmt)
    return list(r.scalars().all())


async def create_override(
    session: AsyncSession,
    host_setting_id: UUID,
    user_id: UUID,
    body: ScheduleOverrideCreateRequest,
) -> ScheduleOverride:
    await _ensure_setting_owner(session, host_setting_id, user_id)
    if body.override_type in ("OPEN", "BLOCK"):
        if body.start_time is None or body.end_time is None:
            raise AppError(
                code=ErrorCode.INVALID_OVERRIDE_TYPE,
                message="OPEN/BLOCK 유형에는 시작·종료 시각이 필요합니다.",
                status_code=422,
            )
        if body.end_time <= body.start_time:
            raise AppError(
                code=ErrorCode.INVALID_TIME_RANGE,
                message="종료 시각은 시작 시각보다 커야 합니다.",
                status_code=422,
            )
    elif body.override_type == "DAY_OFF":
        if body.start_time is not None or body.end_time is not None:
            raise AppError(
                code=ErrorCode.INVALID_OVERRIDE_TYPE,
                message="DAY_OFF 유형에는 시각을 지정하지 않습니다.",
                status_code=422,
            )
    ov = ScheduleOverride(
        host_setting_id=host_setting_id,
        override_date=body.override_date,
        start_time=body.start_time,
        end_time=body.end_time,
        override_type=body.override_type,
        reason=body.reason,
    )
    session.add(ov)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise AppError(
            code=ErrorCode.OVERLAPPING_OVERRIDE,
            message="겹치는 예외 일정이 있습니다.",
            status_code=409,
        ) from None
    await session.refresh(ov)
    return ov


async def get_override_owned(
    session: AsyncSession, override_id: UUID, user_id: UUID
) -> ScheduleOverride:
    stmt = (
        select(ScheduleOverride)
        .join(HostSetting, HostSetting.id == ScheduleOverride.host_setting_id)
        .where(ScheduleOverride.id == override_id, HostSetting.host_id == user_id)
    )
    ov = await session.scalar(stmt)
    if ov is None:
        raise AppError(
            code=ErrorCode.OVERRIDE_NOT_FOUND,
            message="예외 일정을 찾을 수 없습니다.",
            status_code=404,
        )
    return ov


async def update_override(
    session: AsyncSession, override_id: UUID, user_id: UUID, body: ScheduleOverrideUpdateRequest
) -> ScheduleOverride:
    ov = await get_override_owned(session, override_id, user_id)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(ov, k, v)
    if ov.override_type in ("OPEN", "BLOCK") and ov.start_time and ov.end_time:
        if ov.end_time <= ov.start_time:
            raise AppError(
                code=ErrorCode.INVALID_TIME_RANGE,
                message="종료 시각은 시작 시각보다 커야 합니다.",
                status_code=422,
            )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise AppError(
            code=ErrorCode.OVERLAPPING_OVERRIDE,
            message="겹치는 예외 일정이 있습니다.",
            status_code=409,
        ) from None
    await session.refresh(ov)
    return ov


async def delete_override(session: AsyncSession, override_id: UUID, user_id: UUID) -> None:
    ov = await get_override_owned(session, override_id, user_id)
    await session.delete(ov)
    await session.commit()
