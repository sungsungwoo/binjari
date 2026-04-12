"""비밀번호 해싱 및 JWT(Access) 발급·검증."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import bcrypt
import jwt

from app.core.config import get_settings
from app.core.error_codes import ErrorCode
from app.core.exceptions import AppError

_BCRYPT_MAX_PASSWORD_BYTES = 72


def _bcrypt_password_bytes(plain: str) -> bytes:
    """bcrypt는 최대 72바이트만 사용한다. 이전 passlib/bcrypt와 동일하게 앞 72바이트만 사용."""
    return plain.encode("utf-8")[:_BCRYPT_MAX_PASSWORD_BYTES]


def hash_password(plain: str) -> str:
    digest = bcrypt.hashpw(_bcrypt_password_bytes(plain), bcrypt.gensalt())
    return digest.decode("ascii")


def verify_password(plain: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            _bcrypt_password_bytes(plain),
            password_hash.encode("ascii"),
        )
    except (ValueError, TypeError):
        return False


def create_access_token(
    *,
    subject: str,
    email: str,
    roles: list[str],
    expires_delta: timedelta | None = None,
) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "email": email,
        "roles": roles,
        "iat": now,
        "exp": now + expires_delta,
        "jti": str(uuid4()),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    }
    return jwt.encode(
        payload,
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
    except jwt.ExpiredSignatureError:
        raise AppError(
            code=ErrorCode.INVALID_TOKEN,
            message="토큰이 만료되었습니다.",
            status_code=401,
        ) from None
    except jwt.InvalidTokenError:
        raise AppError(
            code=ErrorCode.INVALID_TOKEN,
            message="유효하지 않은 토큰입니다.",
            status_code=401,
        ) from None
