"""Redis 비동기 클라이언트 팩토리 — Hold, Idempotency, Pub/Sub 등에서 사용."""

from redis.asyncio import Redis

from app.core.config import get_settings


def create_redis_client() -> Redis:
    """앱 lifespan에서 생성 후 `close_redis_client`로 종료하는 것을 권장."""
    settings = get_settings()
    return Redis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
    )


async def close_redis_client(client: Redis | None) -> None:
    if client is not None:
        await client.aclose()
