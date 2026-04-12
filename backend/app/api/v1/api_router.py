"""`/api/v1` 하위 라우터 집계."""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin_host,
    analytics,
    auth,
    bookings,
    host,
    host_bookings,
    me,
    notifications,
    public,
    slots_hold,
    users,
    ws,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth")
api_router.include_router(admin_host.router)
api_router.include_router(users.router, prefix="/users")
api_router.include_router(host.router)
api_router.include_router(host_bookings.router)
api_router.include_router(public.router)
api_router.include_router(slots_hold.router)
api_router.include_router(bookings.router)
api_router.include_router(me.router)
api_router.include_router(analytics.router)
api_router.include_router(notifications.router)
api_router.include_router(ws.router)


@api_router.get("/health", tags=["system"])
async def health_check():
    return {
        "success": True,
        "message": "Binjari API is up and running! 🚀",
    }
