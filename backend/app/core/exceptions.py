"""애플리케이션 예외 및 FastAPI 전역 핸들러 등록."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.error_codes import ErrorCode


class AppError(Exception):
    """비즈니스/API 규격 오류 — 핸들러가 JSON 규격 응답으로 변환한다."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int = 400,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error_code": exc.code,
                "message": exc.message,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        errors = exc.errors()
        first = errors[0] if errors else {}
        loc = ".".join(str(x) for x in first.get("loc", ()))
        msg = first.get("msg", "입력값이 올바르지 않습니다.")
        detail = f"{loc}: {msg}" if loc else str(msg)
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "error_code": ErrorCode.INVALID_INPUT,
                "message": detail,
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_request: Request, _exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error_code": ErrorCode.INTERNAL_ERROR,
                "message": "서버 오류가 발생했습니다.",
            },
        )
