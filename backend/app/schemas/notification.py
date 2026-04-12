"""알림 bootstrap — docs/openapi.md `NotificationBootstrapResponse`."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class NotificationBootstrapData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    unread_count: int = 0
    last_events: list[dict[str, Any]] = Field(default_factory=list)


class NotificationBootstrapResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: NotificationBootstrapData
