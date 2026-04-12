"""현재 사용자."""

from fastapi import APIRouter

from app.api.v1.deps import CurrentUserIdDep, SessionDep
from app.core.exceptions import AppError
from app.core.error_codes import ErrorCode
from app.models.user import User
from app.schemas.auth import MeResponse
from app.schemas.user import UserRead

router = APIRouter()


@router.get("/me", response_model=MeResponse)
async def read_me(session: SessionDep, user_id: CurrentUserIdDep):
    user = await session.get(User, user_id)
    if user is None:
        raise AppError(
            code=ErrorCode.UNAUTHORIZED,
            message="사용자를 찾을 수 없습니다.",
            status_code=401,
        )
    return MeResponse(data=UserRead.model_validate(user))
