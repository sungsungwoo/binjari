"""공통 응답·에러·페이지네이션 — docs/openapi.md."""

from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[False] = False
    error_code: str
    message: str


class CursorPaginationParams(BaseModel):
    """쿼리 파라미터 스키마 (필요 시 Depends/Query와 조합)."""

    model_config = ConfigDict(extra="forbid")

    cursor: str | None = None
    limit: int = Field(default=20, ge=1, le=100)


class SuccessEnvelope(BaseModel, Generic[T]):
    """`{ success: true, data: T }` 공통 형태."""

    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: T
