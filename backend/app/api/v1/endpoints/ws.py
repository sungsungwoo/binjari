"""WebSocket — Redis Pub/Sub로 사용자별 이벤트 스트림."""

from __future__ import annotations

import asyncio
from uuid import UUID

from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect

from app.core.exceptions import AppError
from app.core.security import decode_access_token

router = APIRouter()


def _ws_access_token(websocket: WebSocket) -> str | None:
    proto = websocket.headers.get("sec-websocket-protocol") or ""
    parts = [p.strip() for p in proto.split(",") if p.strip()]
    if len(parts) >= 2 and parts[0].lower() == "bearer":
        return parts[1]
    if len(parts) == 1 and parts[0].lower().startswith("bearer "):
        return parts[0].split(" ", 1)[1].strip()
    return websocket.query_params.get("token")


@router.websocket("/ws")
async def websocket_events(websocket: WebSocket):
    token = _ws_access_token(websocket)
    if not token:
        await websocket.close(code=1008, reason="INVALID_TOKEN")
        return
    try:
        payload = decode_access_token(token)
        user_id = UUID(payload["sub"])
    except (AppError, KeyError, ValueError, TypeError):
        await websocket.close(code=1008, reason="INVALID_TOKEN")
        return

    await websocket.accept(subprotocol="bearer")
    redis = websocket.app.state.redis
    pubsub = redis.pubsub()
    channel = f"binjari:ws:user:{user_id}"
    await pubsub.subscribe(channel)

    async def pump_client() -> None:
        try:
            while True:
                await websocket.receive()
        except WebSocketDisconnect:
            pass

    async def pump_redis() -> None:
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    data = message["data"]
                    if isinstance(data, bytes):
                        data = data.decode("utf-8")
                    await websocket.send_text(data)
        except (WebSocketDisconnect, asyncio.CancelledError):
            raise
        except Exception:
            pass

    run = asyncio.create_task(pump_redis())
    try:
        await pump_client()
    finally:
        run.cancel()
        try:
            await run
        except asyncio.CancelledError:
            pass
        await pubsub.unsubscribe(channel)
        await pubsub.close()
