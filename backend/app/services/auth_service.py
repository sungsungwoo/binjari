"""회원가입·로그인·Refresh(Redis)·역할 조회."""

from __future__ import annotations

import hashlib
import secrets
import urllib.parse
from uuid import UUID

import httpx
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.error_codes import ErrorCode
from app.core.exceptions import AppError
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import Role, User, UserRole
from app.schemas.auth import (
    AccessTokenData,
    AccessTokenResponse,
    AuthData,
    AuthResponse,
    LoginRequest,
    SignupRequest,
    Tokens,
)
from app.schemas.user import UserRead

REFRESH_KEY_PREFIX = "binjari:rt:"
OAUTH_STATE_PREFIX = "binjari:oauth:state:"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


def _hash_refresh(plain: str) -> str:
    return hashlib.sha256(plain.encode()).hexdigest()


async def store_refresh(redis: Redis, user_id: UUID, plain_token: str) -> None:
    settings = get_settings()
    h = _hash_refresh(plain_token)
    ttl = settings.refresh_token_expire_days * 86400
    await redis.setex(f"{REFRESH_KEY_PREFIX}{h}", ttl, str(user_id))


async def consume_refresh(redis: Redis, plain_token: str) -> UUID | None:
    h = _hash_refresh(plain_token)
    key = f"{REFRESH_KEY_PREFIX}{h}"
    raw = await redis.get(key)
    if not raw:
        return None
    await redis.delete(key)
    return UUID(raw)


async def delete_refresh(redis: Redis, plain_token: str) -> None:
    h = _hash_refresh(plain_token)
    await redis.delete(f"{REFRESH_KEY_PREFIX}{h}")


async def get_role_names(session: AsyncSession, user_id: UUID) -> list[str]:
    stmt = (
        select(Role.name)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    )
    r = await session.execute(stmt)
    return [row[0] for row in r.all()]


async def _grant_host_role(session: AsyncSession, user_id: UUID) -> None:
    role = await session.scalar(select(Role).where(Role.name == "HOST"))
    if role is None:
        return
    exists = await session.scalar(
        select(UserRole).where(
            UserRole.user_id == user_id,
            UserRole.role_id == role.id,
        )
    )
    if exists is not None:
        return
    session.add(UserRole(user_id=user_id, role_id=role.id))


def user_to_read(user: User) -> UserRead:
    return UserRead.model_validate(user)


def attach_refresh_cookie(response, plain: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.refresh_token_cookie_name,
        value=plain,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
        path=settings.refresh_token_cookie_path,
    )


def clear_refresh_cookie(response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.refresh_token_cookie_name,
        path=settings.refresh_token_cookie_path,
    )


async def build_auth_response(
    session: AsyncSession, user: User, redis: Redis
) -> tuple[AuthResponse, str]:
    roles = await get_role_names(session, user.id)
    access = create_access_token(
        subject=str(user.id),
        email=user.email,
        roles=roles,
    )
    refresh_plain = secrets.token_urlsafe(48)
    await store_refresh(redis, user.id, refresh_plain)
    tokens = Tokens(access_token=access)
    return (
        AuthResponse(
            data=AuthData(user=user_to_read(user), tokens=tokens),
        ),
        refresh_plain,
    )


async def signup(
    session: AsyncSession, redis: Redis, body: SignupRequest
) -> tuple[AuthResponse, str]:
    host_request_status = (
        "pending" if body.signup_type == "host" else None
    )
    user = User(
        email=body.email.lower().strip(),
        password_hash=hash_password(body.password),
        provider="LOCAL",
        name=body.name.strip(),
        is_active=True,
        host_request_status=host_request_status,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise AppError(
            code=ErrorCode.EMAIL_ALREADY_EXISTS,
            message="이미 사용 중인 이메일입니다.",
            status_code=409,
        ) from None

    # HOST 역할은 호스트 가입 시 관리자 승인(admin API) 후에만 부여.

    await session.commit()
    await session.refresh(user)
    return await build_auth_response(session, user, redis)


async def login(
    session: AsyncSession, redis: Redis, body: LoginRequest
) -> tuple[AuthResponse, str]:
    stmt = select(User).where(User.email == body.email.lower().strip())
    user = await session.scalar(stmt)
    if user is None or user.password_hash is None:
        raise AppError(
            code=ErrorCode.INVALID_CREDENTIALS,
            message="이메일 또는 비밀번호가 올바르지 않습니다.",
            status_code=401,
        )
    if not verify_password(body.password, user.password_hash):
        raise AppError(
            code=ErrorCode.INVALID_CREDENTIALS,
            message="이메일 또는 비밀번호가 올바르지 않습니다.",
            status_code=401,
        )
    if not user.is_active:
        raise AppError(
            code=ErrorCode.USER_INACTIVE,
            message="비활성화된 계정입니다.",
            status_code=403,
        )
    return await build_auth_response(session, user, redis)


async def refresh_access(
    session: AsyncSession, redis: Redis, cookie_value: str | None
) -> tuple[AccessTokenResponse, str]:
    if not cookie_value:
        raise AppError(
            code=ErrorCode.INVALID_REFRESH_TOKEN,
            message="Refresh Token이 없습니다.",
            status_code=401,
        )
    user_id = await consume_refresh(redis, cookie_value)
    if user_id is None:
        raise AppError(
            code=ErrorCode.EXPIRED_REFRESH_TOKEN,
            message="Refresh Token이 만료되었거나 이미 사용되었습니다.",
            status_code=401,
        )
    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise AppError(
            code=ErrorCode.INVALID_REFRESH_TOKEN,
            message="유효하지 않은 세션입니다.",
            status_code=401,
        )
    roles = await get_role_names(session, user.id)
    access = create_access_token(
        subject=str(user.id),
        email=user.email,
        roles=roles,
    )
    new_refresh = secrets.token_urlsafe(48)
    await store_refresh(redis, user.id, new_refresh)
    return (
        AccessTokenResponse(data=AccessTokenData(tokens=Tokens(access_token=access))),
        new_refresh,
    )


async def logout(redis: Redis, cookie_value: str | None) -> None:
    if cookie_value:
        await delete_refresh(redis, cookie_value)


def _require_google_oauth_config() -> None:
    s = get_settings()
    if (
        not s.google_oauth_client_id
        or not s.google_oauth_client_secret
        or not s.google_oauth_redirect_uri
    ):
        raise AppError(
            code=ErrorCode.OAUTH_PROVIDER_ERROR,
            message="Google OAuth 환경 변수(GOOGLE_OAUTH_*)가 설정되지 않았습니다.",
            status_code=500,
        )


async def google_oauth_authorize_url(redis: Redis) -> str:
    _require_google_oauth_config()
    s = get_settings()
    state = secrets.token_urlsafe(32)
    await redis.setex(f"{OAUTH_STATE_PREFIX}{state}", 600, "1")
    q = urllib.parse.urlencode(
        {
            "client_id": s.google_oauth_client_id,
            "redirect_uri": s.google_oauth_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "select_account",
        }
    )
    return f"{GOOGLE_AUTH_URL}?{q}"


async def google_oauth_callback(
    session: AsyncSession,
    redis: Redis,
    code: str | None,
    state: str | None,
    oauth_error: str | None,
) -> tuple[AuthResponse, str]:
    if oauth_error:
        raise AppError(
            code=ErrorCode.OAUTH_LOGIN_FAILED,
            message=f"Google 인증이 거부되었습니다: {oauth_error}",
            status_code=401,
        )
    if not code or not state:
        raise AppError(
            code=ErrorCode.INVALID_AUTH_CODE,
            message="인가 코드 또는 state가 없습니다.",
            status_code=400,
        )
    state_key = f"{OAUTH_STATE_PREFIX}{state}"
    if not await redis.get(state_key):
        raise AppError(
            code=ErrorCode.INVALID_AUTH_CODE,
            message="유효하지 않거나 만료된 OAuth state 입니다.",
            status_code=400,
        )
    await redis.delete(state_key)
    _require_google_oauth_config()
    s = get_settings()
    async with httpx.AsyncClient(timeout=30.0) as client:
        tr = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": s.google_oauth_client_id,
                "client_secret": s.google_oauth_client_secret,
                "redirect_uri": s.google_oauth_redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )
    if tr.status_code != 200:
        raise AppError(
            code=ErrorCode.OAUTH_LOGIN_FAILED,
            message="Google 토큰 교환에 실패했습니다.",
            status_code=401,
        )
    token_body = tr.json()
    access = token_body.get("access_token")
    if not access:
        raise AppError(
            code=ErrorCode.OAUTH_LOGIN_FAILED,
            message="Google 액세스 토큰을 받지 못했습니다.",
            status_code=401,
        )
    async with httpx.AsyncClient(timeout=30.0) as client:
        ur = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access}"},
        )
    if ur.status_code != 200:
        raise AppError(
            code=ErrorCode.OAUTH_LOGIN_FAILED,
            message="Google 프로필 조회에 실패했습니다.",
            status_code=401,
        )
    profile = ur.json()
    email = (profile.get("email") or "").lower().strip()
    if not email:
        raise AppError(
            code=ErrorCode.OAUTH_LOGIN_FAILED,
            message="Google 계정에서 이메일을 확인할 수 없습니다.",
            status_code=401,
        )
    if profile.get("email_verified") is False:
        raise AppError(
            code=ErrorCode.OAUTH_LOGIN_FAILED,
            message="인증되지 않은 Google 이메일입니다.",
            status_code=401,
        )
    name = (profile.get("name") or email.split("@")[0])[:100]

    user = await session.scalar(select(User).where(User.email == email))
    if user is not None:
        if not user.is_active:
            raise AppError(
                code=ErrorCode.USER_INACTIVE,
                message="비활성화된 계정입니다.",
                status_code=403,
            )
        if user.provider == "GOOGLE":
            user.name = name
            await session.commit()
            await session.refresh(user)
            return await build_auth_response(session, user, redis)
        if user.password_hash:
            raise AppError(
                code=ErrorCode.OAUTH_LOGIN_FAILED,
                message="이 이메일은 이미 이메일/비밀번호로 가입되어 있습니다.",
                status_code=401,
            )
        user.provider = "GOOGLE"
        user.password_hash = None
        user.name = name
        await session.commit()
        await session.refresh(user)
        return await build_auth_response(session, user, redis)

    user = User(
        email=email,
        password_hash=None,
        provider="GOOGLE",
        name=name,
        is_active=True,
        host_request_status=None,
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise AppError(
            code=ErrorCode.EMAIL_ALREADY_EXISTS,
            message="이미 사용 중인 이메일입니다.",
            status_code=409,
        ) from None
    await session.refresh(user)
    return await build_auth_response(session, user, redis)
