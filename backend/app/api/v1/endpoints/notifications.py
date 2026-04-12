"""알림 bootstrap — Redis 큐."""

from fastapi import APIRouter

from app.api.v1.deps import CurrentUserIdDep, RedisDep
from app.schemas.notification import NotificationBootstrapData, NotificationBootstrapResponse
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/bootstrap", response_model=NotificationBootstrapResponse)
async def notifications_bootstrap(user_id: CurrentUserIdDep, redis: RedisDep):
    unread, events = await notification_service.get_bootstrap(redis, user_id)
    return NotificationBootstrapResponse(
        data=NotificationBootstrapData(unread_count=unread, last_events=events)
    )
