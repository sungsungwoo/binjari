"""비동기 DB 엔진·세션 — FastAPI Depends(get_session)."""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

from app.core.config import get_settings

# Alembic·메타데이터는 동일 SQLModel.metadata 사용
metadata = SQLModel.metadata


def _async_database_url(url: str) -> str:
    """postgresql+psycopg2 / postgresql:// → postgresql+asyncpg (이미 asyncpg면 그대로)."""
    if "+asyncpg" in url:
        return url
    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


_settings = get_settings()

engine = create_async_engine(
    _async_database_url(_settings.database_url),
    echo=_settings.environment == "development",
    pool_pre_ping=True,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """요청 단위 세션. 커밋/롤백은 서비스·라우터에서 명시적으로 수행."""
    async with async_session_maker() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def dispose_engine() -> None:
    """앱 종료 시 연결 풀 정리."""
    await engine.dispose()


# 테이블을 metadata에 등록 (Alembic autogenerate·런타임 ORM)
import app.models  # noqa: E402, F401
