"""공통 의존성 — 세션, Redis, 인증·인가."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.error_codes import ErrorCode
from app.core.exceptions import AppError
from app.core.security import decode_access_token
from app.database import get_session

SessionDep = Annotated[AsyncSession, Depends(get_session)]

security_bearer = HTTPBearer(auto_error=False)


def get_redis(request: Request) -> Redis:
    return request.app.state.redis


RedisDep = Annotated[Redis, Depends(get_redis)]


async def get_token_payload(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(security_bearer),
    ],
) -> dict | None:
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    return decode_access_token(credentials.credentials)


async def require_auth_payload(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(security_bearer),
    ],
) -> dict:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AppError(
            code=ErrorCode.UNAUTHORIZED,
            message="인증이 필요합니다.",
            status_code=401,
        )
    return decode_access_token(credentials.credentials)


AuthPayloadDep = Annotated[dict, Depends(require_auth_payload)]


async def get_current_user_id(payload: AuthPayloadDep) -> UUID:
    sub = payload.get("sub")
    if not sub:
        raise AppError(
            code=ErrorCode.UNAUTHORIZED,
            message="유효하지 않은 토큰입니다.",
            status_code=401,
        )
    return UUID(sub)


CurrentUserIdDep = Annotated[UUID, Depends(get_current_user_id)]


async def require_host_payload(payload: AuthPayloadDep) -> dict:
    roles = payload.get("roles") or []
    if "HOST" not in roles:
        raise AppError(
            code=ErrorCode.HOST_ROLE_REQUIRED,
            message="호스트 권한이 필요합니다.",
            status_code=403,
        )
    return payload


HostPayloadDep = Annotated[dict, Depends(require_host_payload)]


async def require_admin_payload(payload: AuthPayloadDep) -> dict:
    roles = payload.get("roles") or []
    if "ADMIN" not in roles:
        raise AppError(
            code=ErrorCode.ADMIN_ROLE_REQUIRED,
            message="관리자 권한이 필요합니다.",
            status_code=403,
        )
    return payload


AdminPayloadDep = Annotated[dict, Depends(require_admin_payload)]


async def get_optional_current_user_id(
    payload: Annotated[dict | None, Depends(get_token_payload)],
) -> UUID | None:
    if not payload:
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    try:
        return UUID(sub)
    except (ValueError, TypeError):
        return None


OptionalCurrentUserIdDep = Annotated[UUID | None, Depends(get_optional_current_user_id)]
