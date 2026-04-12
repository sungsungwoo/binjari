"""Redis 임시 선점."""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.error_codes import ErrorCode
from app.core.exceptions import AppError
from app.services import slot_service

HOLD_PREFIX = "binjari:hold:"


async def create_hold(
    session: AsyncSession, redis: Redis, slot_id: UUID, user_id: UUID
) -> tuple[str, datetime, int]:
    slot = await slot_service.get_slot_or_404(session, slot_id)
    if slot.status != "OPEN":
        raise AppError(
            code=ErrorCode.SLOT_NOT_OPEN,
            message="예약 가능한 슬롯이 아닙니다.",
            status_code=409,
        )
    key = f"{HOLD_PREFIX}{slot_id}"
    if await redis.exists(key):
        raise AppError(
            code=ErrorCode.SLOT_ALREADY_HELD,
            message="다른 사용자가 해당 시간대 예약을 진행 중입니다.",
            status_code=409,
        )
    settings = get_settings()
    ttl = settings.hold_ttl_seconds
    token = secrets.token_urlsafe(32)
    payload = json.dumps({"user_id": str(user_id), "token": token})
    await redis.setex(key, ttl, payload)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)
    return token, expires_at, ttl


async def verify_hold(redis: Redis, slot_id: UUID, user_id: UUID, hold_token: str) -> None:
    key = f"{HOLD_PREFIX}{slot_id}"
    raw = await redis.get(key)
    if not raw:
        raise AppError(
            code=ErrorCode.HOLD_EXPIRED,
            message="임시 선점이 만료되었습니다. 다시 선택해 주세요.",
            status_code=409,
        )
    data = json.loads(raw)
    if data.get("user_id") != str(user_id) or data.get("token") != hold_token:
        raise AppError(
            code=ErrorCode.HOLD_EXPIRED,
            message="유효하지 않은 임시 선점입니다.",
            status_code=409,
        )


async def release_hold(redis: Redis, slot_id: UUID) -> None:
    await redis.delete(f"{HOLD_PREFIX}{slot_id}")


async def release_my_hold(redis: Redis, slot_id: UUID, user_id: UUID, hold_token: str) -> None:
    """본인 임시 선점만 해제. Redis 키가 없으면 조용히 종료(이미 만료·해제됨)."""
    key = f"{HOLD_PREFIX}{slot_id}"
    raw = await redis.get(key)
    if not raw:
        return
    data = json.loads(raw)
    if data.get("user_id") != str(user_id) or data.get("token") != hold_token:
        raise AppError(
            code=ErrorCode.HOLD_EXPIRED,
            message="유효하지 않은 임시 선점입니다.",
            status_code=409,
        )
    await redis.delete(key)


async def hold_status(
    redis: Redis, slot_id: UUID, user_id: UUID | None
) -> tuple[bool, datetime | None, int | None, str | None]:
    key = f"{HOLD_PREFIX}{slot_id}"
    raw = await redis.get(key)
    if not raw:
        return False, None, None, None
    ttl = await redis.ttl(key)
    data = json.loads(raw)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=max(ttl, 0))
    token = data.get("token")
    held_by_me = user_id is not None and data.get("user_id") == str(user_id)
    return True, expires_at, max(ttl, 0), token if held_by_me else None
