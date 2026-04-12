"""seed roles (HOST, ADMIN) and default admin user

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-10

`app.services.db_seed`와 동일한 초기 데이터. 마이그레이션만으로 DB를 맞출 때 사용.
비밀번호 해시는 `hash_password('admin1234!!')` 한 번 생성한 값(고정 salt).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# docs/DDL.md · db_seed와 동일 (로그인: admin@binjari.com 또는 로그인 별칭 admin / admin1234!!)
ADMIN_USER_ID = "a0000000-0000-4000-8000-000000000001"
ADMIN_EMAIL = "admin@binjari.com"
ADMIN_PASSWORD_HASH = (
    "$2b$12$6kpDQkZXQhOorVFPLNiMFulCS9Gh2k0FyiQn02181BIy9sAXhNLgG"
)


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO roles (name, description) VALUES
            ('HOST', '예약 페이지 호스트'),
            ('ADMIN', '관리자')
        ON CONFLICT (name) DO NOTHING;
        """
    )
    op.execute(
        f"""
        INSERT INTO users (
            id, email, password_hash, provider, name, is_active
        ) VALUES (
            '{ADMIN_USER_ID}'::uuid,
            '{ADMIN_EMAIL}',
            '{ADMIN_PASSWORD_HASH}',
            'LOCAL',
            'Admin',
            TRUE
        ) ON CONFLICT (email) DO NOTHING;
        """
    )
    op.execute(
        f"""
        INSERT INTO user_roles (user_id, role_id)
        SELECT u.id, r.id
        FROM users u
        CROSS JOIN roles r
        WHERE u.email = '{ADMIN_EMAIL}'
          AND r.name = 'ADMIN'
        ON CONFLICT (user_id, role_id) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        DELETE FROM user_roles
        WHERE user_id = '{ADMIN_USER_ID}'::uuid;
        """
    )
    op.execute(
        f"""
        DELETE FROM users
        WHERE id = '{ADMIN_USER_ID}'::uuid;
        """
    )
    # roles (HOST, ADMIN) 행은 다른 user_roles가 참조할 수 있어 삭제하지 않음
