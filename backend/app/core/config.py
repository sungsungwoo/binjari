"""환경 변수(.env) 기반 설정 — pydantic-settings."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Literal["development", "staging", "production"] = Field(
        default="development",
        validation_alias="BINJARI_ENV",
        description="실행 환경 (쿠키 Secure 등에 사용)",
    )

    database_url: str = Field(
        default="postgresql+psycopg2://binjari:binjari_secret@127.0.0.1:5432/binjari_db",
        description="DB URL. Alembic·동기 스크립트는 그대로 사용. 앱 런타임은 asyncpg로 변환해 비동기 엔진에 연결.",
    )

    redis_url: str = Field(
        default="redis://127.0.0.1:6379/0",
        description="Redis 연결 URL",
    )

    secret_key: str = Field(
        default="dev-secret-change-in-production-min-32-chars!!",
        min_length=16,
        description="JWT 서명용 비밀키 (운영에서는 반드시 강한 값으로 교체)",
    )

    jwt_algorithm: str = Field(default="HS256")
    jwt_issuer: str = Field(default="binjari")
    jwt_audience: str = Field(default="binjari-api")
    access_token_expire_minutes: int = Field(default=30, ge=1, le=24 * 60)
    refresh_token_expire_days: int = Field(default=14, ge=1, le=365)

    refresh_token_cookie_name: str = Field(default="refresh_token")
    refresh_token_cookie_path: str = Field(default="/api/v1/auth")

    grant_host_on_signup: bool = Field(
        default=False,
        validation_alias="GRANT_HOST_ON_SIGNUP",
        description="레거시. 현재 이메일 가입은 signup_type(member/host)으로 처리하며 이 플래그는 사용하지 않음.",
    )

    default_admin_login_email: str = Field(
        default="admin@binjari.com",
        validation_alias="BINJARI_DEFAULT_ADMIN_EMAIL",
        description="시드 관리자 계정 이메일. 로그인 요청에서 입력값 'admin'은 이 주소로 치환된다.",
    )

    hold_ttl_seconds: int = Field(default=300, ge=30, le=3600)

    google_oauth_client_id: str = Field(
        default="",
        validation_alias="GOOGLE_OAUTH_CLIENT_ID",
        description="Google OAuth 클라이언트 ID (비우면 /auth/google 은 500)",
    )
    google_oauth_client_secret: str = Field(
        default="",
        validation_alias="GOOGLE_OAUTH_CLIENT_SECRET",
    )
    google_oauth_redirect_uri: str = Field(
        default="",
        validation_alias="GOOGLE_OAUTH_REDIRECT_URI",
        description="Google 콘솔에 등록한 콜백 URL (예: http://127.0.0.1:8000/api/v1/auth/google/callback)",
    )
    frontend_oauth_success_url: str = Field(
        default="http://localhost:5173/",
        validation_alias="FRONTEND_OAUTH_SUCCESS_URL",
        description="OAuth 성공 후 브라우저 리다이렉트(Refresh 쿠키는 API 도메인에 설정)",
    )

    _cors_origins_default = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "http://43.201.105.93,"
        "http://43.201.105.93:5173,"
        "https://binjari.com"
    )

    cors_origins: str = Field(
        default=_cors_origins_default,
        validation_alias="CORS_ORIGINS",
        description="쉼표로 구분된 허용 Origin 목록 (비우면 개발용 기본값 사용)",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def strip_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("cors_origins", mode="after")
    @classmethod
    def cors_origins_nonempty(cls, v: str) -> str:
        # .env 에서 CORS_ORIGINS= 만 넣으면 목록이 비어 OPTIONS 가 400 이 된다.
        if not v:
            return cls._cors_origins_default
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def refresh_cookie_secure(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
