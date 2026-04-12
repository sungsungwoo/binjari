"""관리자 — 호스트 가입 신청."""

from uuid import UUID

from fastapi import APIRouter

from app.api.v1.deps import AdminPayloadDep, SessionDep
from app.schemas.admin_host import (
    HostRequestActionData,
    HostRequestActionResponse,
    PendingHostItem,
    PendingHostListData,
    PendingHostListResponse,
)
from app.schemas.user import UserRead
from app.services.admin_host_service import (
    approve_host_request as approve_host_request_svc,
    list_pending_host_requests as list_pending_host_requests_svc,
    reject_host_request as reject_host_request_svc,
)

router = APIRouter(prefix="/admin/host-requests", tags=["admin"])


@router.get("", response_model=PendingHostListResponse)
async def list_pending_host_requests(
    _admin: AdminPayloadDep,
    session: SessionDep,
):
    users = await list_pending_host_requests_svc(session)
    items = [PendingHostItem.model_validate(u) for u in users]
    return PendingHostListResponse(data=PendingHostListData(items=items))


@router.post("/{user_id}/approve", response_model=HostRequestActionResponse)
async def approve_host_request(
    user_id: UUID,
    _admin: AdminPayloadDep,
    session: SessionDep,
):
    user = await approve_host_request_svc(session, user_id)
    return HostRequestActionResponse(data=HostRequestActionData(user=UserRead.model_validate(user)))


@router.post("/{user_id}/reject", response_model=HostRequestActionResponse)
async def reject_host_request(
    user_id: UUID,
    _admin: AdminPayloadDep,
    session: SessionDep,
):
    user = await reject_host_request_svc(session, user_id)
    return HostRequestActionResponse(data=HostRequestActionData(user=UserRead.model_validate(user)))
