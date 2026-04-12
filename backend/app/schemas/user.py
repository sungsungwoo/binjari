"""사용자 공개 정보 — docs/openapi.md `User`."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    name: str
    provider: Literal["LOCAL", "GOOGLE"]
    is_active: bool
    host_request_status: str | None = None
    created_at: datetime
    updated_at: datetime
