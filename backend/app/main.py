from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api_router import api_router
from app.core import (
    close_redis_client,
    create_redis_client,
    get_settings,
    register_exception_handlers,
)
from app.database import async_session_maker, dispose_engine
from app.services.db_seed import seed_default_admin, seed_roles


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with async_session_maker() as session:
        await seed_roles(session)
        await seed_default_admin(session)
    redis_client = create_redis_client()
    app.state.redis = redis_client
    yield
    await close_redis_client(redis_client)
    await dispose_engine()


settings = get_settings()

app = FastAPI(
    title="Binjari API",
    description="Real-time booking and scheduling platform API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

register_exception_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
