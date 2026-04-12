"""슬롯 임시 선점(Redis)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.v1.deps import CurrentUserIdDep, RedisDep, SessionDep
from app.schemas.slot import HoldResponse, HoldResponseData
from app.services import hold_service, slot_service

router = APIRouter(prefix="/slots", tags=["slots"])


@router.post("/{slot_id}/hold", response_model=HoldResponse)
async def create_hold(
    slot_id: UUID,
    session: SessionDep,
    redis: RedisDep,
    user_id: CurrentUserIdDep,
):
    token, expires_at, ttl = await hold_service.create_hold(session, redis, slot_id, user_id)
    return HoldResponse(
        data=HoldResponseData(
            slot_id=slot_id,
            hold_token=token,
            expires_at=expires_at,
            remaining_seconds=ttl,
            held=True,
        )
    )


@router.get("/{slot_id}/hold", response_model=HoldResponse)
async def get_hold_status(
    slot_id: UUID,
    session: SessionDep,
    redis: RedisDep,
    user_id: CurrentUserIdDep,
):
    await slot_service.get_slot_or_404(session, slot_id)
    held, expires_at, ttl, token = await hold_service.hold_status(redis, slot_id, user_id)
    if not held:
        return HoldResponse(
            data=HoldResponseData(slot_id=slot_id, held=False),
        )
    return HoldResponse(
        data=HoldResponseData(
            slot_id=slot_id,
            held=True,
            expires_at=expires_at,
            remaining_seconds=ttl,
            hold_token=token,
        )
    )


@router.delete("/{slot_id}/hold", status_code=status.HTTP_204_NO_CONTENT)
async def release_my_hold(
    slot_id: UUID,
    hold_token: Annotated[str, Query(min_length=1)],
    redis: RedisDep,
    user_id: CurrentUserIdDep,
):
    await hold_service.release_my_hold(redis, slot_id, user_id, hold_token)
