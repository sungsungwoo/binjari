"""이메일 인증·Refresh 쿠키·Google OAuth."""

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse

from app.api.v1.deps import RedisDep, SessionDep
from app.core.config import get_settings
from app.schemas.auth import (
    AccessTokenResponse,
    AuthResponse,
    LoginRequest,
    SignupRequest,
)
from app.services import auth_service

router = APIRouter()


@router.post("/signup", response_model=AuthResponse, status_code=201)
async def signup(
    body: SignupRequest,
    response: Response,
    session: SessionDep,
    redis: RedisDep,
):
    auth_resp, plain = await auth_service.signup(session, redis, body)
    auth_service.attach_refresh_cookie(response, plain)
    return auth_resp


@router.post("/login", response_model=AuthResponse)
async def login(
    body: LoginRequest,
    response: Response,
    session: SessionDep,
    redis: RedisDep,
):
    auth_resp, plain = await auth_service.login(session, redis, body)
    auth_service.attach_refresh_cookie(response, plain)
    return auth_resp


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    session: SessionDep,
    redis: RedisDep,
):
    settings = get_settings()
    cookie = request.cookies.get(settings.refresh_token_cookie_name)
    access_resp, plain = await auth_service.refresh_access(session, redis, cookie)
    auth_service.attach_refresh_cookie(response, plain)
    return access_resp


@router.post("/logout")
async def logout(request: Request, response: Response, redis: RedisDep):
    settings = get_settings()
    cookie = request.cookies.get(settings.refresh_token_cookie_name)
    await auth_service.logout(redis, cookie)
    auth_service.clear_refresh_cookie(response)
    return {"success": True, "data": {}}


@router.get("/google")
async def google_oauth_start(redis: RedisDep):
    url = await auth_service.google_oauth_authorize_url(redis)
    return RedirectResponse(url=url, status_code=302)


@router.get("/google/callback")
async def google_oauth_callback(
    request: Request,
    session: SessionDep,
    redis: RedisDep,
):
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    err = request.query_params.get("error")
    mode = request.query_params.get("response_mode")
    auth_resp, plain = await auth_service.google_oauth_callback(session, redis, code, state, err)
    settings = get_settings()
    if mode == "json":
        resp = JSONResponse(content=auth_resp.model_dump(mode="json"))
        auth_service.attach_refresh_cookie(resp, plain)
        return resp
    resp = RedirectResponse(url=settings.frontend_oauth_success_url, status_code=302)
    auth_service.attach_refresh_cookie(resp, plain)
    return resp
