"""관리자 — 호스트 신청."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

from app.schemas.user import UserRead


class PendingHostItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    name: str
    host_request_status: Literal["pending"] = "pending"
    created_at: datetime


class PendingHostListData(BaseModel):
    items: list[PendingHostItem]


class PendingHostListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: PendingHostListData


class HostRequestActionData(BaseModel):
    user: UserRead


class HostRequestActionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True] = True
    data: HostRequestActionData
