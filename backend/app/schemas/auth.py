"""인증 요청/응답 — docs/openapi.md."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.config import get_settings

from app.schemas.user import UserRead


class Tokens(BaseModel):
    model_config = ConfigDict(extra="forbid")

    access_token: str
    token_type: Literal["bearer"] = "bearer"


class SignupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=1, max_length=100)
    signup_type: Literal["member", "host"] = Field(
        default="member",
        description="member: 즉시 일반 회원. host: 호스트 신청(관리자 승인 후 HOST 역할).",
    )


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def map_admin_login_alias(cls, v: object) -> object:
        """로그인 필드에 `admin`만 입력해도 시드 관리자 이메일로 매핑."""
        if isinstance(v, str) and v.strip().lower() == "admin":
            return get_settings().default_admin_login_email
        return v


class AuthData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user: UserRead
    tokens: Tokens


class AuthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: AuthData


class AccessTokenData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tokens: Tokens


class AccessTokenResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: AccessTokenData


class MeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: UserRead
