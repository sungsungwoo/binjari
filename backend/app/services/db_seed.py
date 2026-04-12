"""초기 DB 시드 — roles, 기본 Admin 계정."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.user import Role, User, UserRole

# 개발·로컬용 기본 관리자 (운영 배포 시 비밀번호 변경 또는 계정 비활성화 권장)
# 로그인: 이메일 `admin`(별칭) 또는 `default_admin_login_email` / 비밀번호 admin1234!!
DEFAULT_ADMIN_PASSWORD = "admin1234!!"
DEFAULT_ADMIN_NAME = "Admin"
DEFAULT_ADMIN_USER_ID = UUID("a0000000-0000-4000-8000-000000000001")


async def seed_roles(session: AsyncSession) -> None:
    defaults = [
        ("HOST", "예약 페이지 호스트"),
        ("ADMIN", "관리자"),
    ]
    for name, desc in defaults:
        exists = await session.scalar(select(Role).where(Role.name == name))
        if exists is None:
            session.add(Role(name=name, description=desc))
    await session.commit()


async def seed_default_admin(session: AsyncSession) -> None:
    """ADMIN 역할을 가진 기본 계정 1건 (이미 있으면 스킵)."""
    email = get_settings().default_admin_login_email
    existing = await session.scalar(select(User).where(User.email == email))
    if existing is not None:
        return

    admin_role = await session.scalar(select(Role).where(Role.name == "ADMIN"))
    if admin_role is None:
        return

    user = User(
        id=DEFAULT_ADMIN_USER_ID,
        email=email,
        password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
        provider="LOCAL",
        name=DEFAULT_ADMIN_NAME,
        is_active=True,
    )
    session.add(user)
    await session.flush()
    session.add(UserRole(user_id=user.id, role_id=admin_role.id))
    await session.commit()
