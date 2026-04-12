"""관리자 — 호스트 가입 신청 승인/거절."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.error_codes import ErrorCode
from app.core.exceptions import AppError
from app.models.user import User
from app.services.auth_service import _grant_host_role


async def list_pending_host_requests(session: AsyncSession) -> list[User]:
    stmt = (
        select(User)
        .where(User.host_request_status == "pending")
        .order_by(User.created_at.asc())
    )
    r = await session.execute(stmt)
    return list(r.scalars().all())


async def approve_host_request(session: AsyncSession, user_id: UUID) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise AppError(
            code=ErrorCode.PENDING_HOST_REQUEST_NOT_FOUND,
            message="사용자를 찾을 수 없습니다.",
            status_code=404,
        )
    if user.host_request_status != "pending":
        raise AppError(
            code=ErrorCode.PENDING_HOST_REQUEST_NOT_FOUND,
            message="대기 중인 호스트 신청이 아닙니다.",
            status_code=404,
        )
    user.host_request_status = "approved"
    await _grant_host_role(session, user.id)
    await session.commit()
    await session.refresh(user)
    return user


async def reject_host_request(session: AsyncSession, user_id: UUID) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise AppError(
            code=ErrorCode.PENDING_HOST_REQUEST_NOT_FOUND,
            message="사용자를 찾을 수 없습니다.",
            status_code=404,
        )
    if user.host_request_status != "pending":
        raise AppError(
            code=ErrorCode.PENDING_HOST_REQUEST_NOT_FOUND,
            message="대기 중인 호스트 신청이 아닙니다.",
            status_code=404,
        )
    user.host_request_status = "rejected"
    await session.commit()
    await session.refresh(user)
    return user
