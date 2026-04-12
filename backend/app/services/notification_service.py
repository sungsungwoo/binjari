"""Redis Pub/Sub·사용자별 이벤트 큐 — bootstrap·WebSocket."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from redis.asyncio import Redis

UNREAD_KEY = "binjari:notify:unread:{user_id}"
EVENTS_KEY = "binjari:notify:events:{user_id}"
WS_CHANNEL = "binjari:ws:user:{user_id}"


def _ws_channel(user_id: UUID) -> str:
    return WS_CHANNEL.format(user_id=user_id)


async def publish_user_event(
    redis: Redis, user_id: UUID, event_type: str, payload: dict[str, Any]
) -> None:
    """호스트/예약자에게 실시간 이벤트 전파 + bootstrap용 큐 적재."""
    msg_obj = {
        "type": event_type,
        "payload": payload,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    raw = json.dumps(msg_obj, default=str)
    await redis.publish(_ws_channel(user_id), raw)
    await redis.incr(UNREAD_KEY.format(user_id=user_id))
    key = EVENTS_KEY.format(user_id=user_id)
    await redis.lpush(key, raw)
    await redis.ltrim(key, 0, 49)


async def get_bootstrap(redis: Redis, user_id: UUID) -> tuple[int, list[dict[str, Any]]]:
    unread = int(await redis.get(UNREAD_KEY.format(user_id=user_id)) or 0)
    raw_list = await redis.lrange(EVENTS_KEY.format(user_id=user_id), 0, 19)
    events: list[dict[str, Any]] = []
    for raw in raw_list:
        try:
            events.append(json.loads(raw))
        except (json.JSONDecodeError, TypeError):
            continue
    return unread, events
