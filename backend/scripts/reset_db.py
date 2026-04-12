"""
PostgreSQL `public` 스키마를 삭제 후 재생성하고, `alembic upgrade head`로 테이블·시드를 다시 만든다.

사용법 (backend 디렉터리에서):

    python scripts/reset_db.py          # 확인 프롬프트
    python scripts/reset_db.py -y       # 확인 없이 실행

환경 변수는 `.env`의 `database_url` 등을 따른다.
연결 문자열에 호스트 `db`(Compose 서비스명)가 있어도, **호스트 PC에서 스크립트를 실행할 때는**
`db`를 DNS로 찾지 못하므로 자동으로 `127.0.0.1`로 바꿔 연결한다.
(Postgres는 `docker compose`로 5432가 열려 있어야 한다.)

Docker 볼륨까지 지우고 DB를 완전히 새로 쓰려면:

    docker compose down -v
    docker compose up -d db
    # 이후 backend 컨테이너에서 alembic 또는 이 스크립트 실행

세션·리프레시 토큰은 Redis에 있으므로, 로그인 상태까지 깨끗이 하려면 Redis도 비운다:

    docker compose exec redis redis-cli FLUSHALL
"""

from __future__ import annotations

import argparse
import os
import socket
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import get_settings  # noqa: E402


def _sync_database_url() -> str:
    u = get_settings().database_url
    u = u.replace("postgresql+asyncpg://", "postgresql://", 1)
    u = u.replace("postgresql+psycopg2://", "postgresql://", 1)
    return u


def _hostname_resolves(hostname: str) -> bool:
    try:
        socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
        return True
    except OSError:
        return False


def _rewrite_db_host_to_localhost(url: str, local_host: str = "127.0.0.1") -> str:
    """Docker Compose 서비스명 `db` 등 — 호스트 OS에서는 DNS가 안 될 때 로컬 Postgres로 연결."""
    parts = urlsplit(url)
    if parts.hostname is None or parts.hostname != "db":
        return url
    userinfo = ""
    if parts.username is not None:
        userinfo = quote(parts.username, safe="")
        if parts.password is not None:
            userinfo += ":" + quote(parts.password, safe="")
        userinfo += "@"
    port = parts.port
    netloc = f"{userinfo}{local_host}"
    if port is not None:
        netloc += f":{port}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


def effective_sync_database_url() -> tuple[str, str | None]:
    """
    (연결용 URL, alembic에 넘길 DATABASE_URL 오버라이드 또는 None)
    `db` 호스트가 현재 환경에서 해석되지 않으면 127.0.0.1로 치환한다.
    """
    url = _sync_database_url()
    parts = urlsplit(url)
    if parts.hostname == "db" and not _hostname_resolves("db"):
        rewritten = _rewrite_db_host_to_localhost(url)
        return rewritten, rewritten
    return url, None


def reset_schema(url: str) -> None:
    conn = psycopg2.connect(url)
    try:
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        cur.execute("DROP SCHEMA IF EXISTS public CASCADE;")
        cur.execute("CREATE SCHEMA public;")
        cur.execute("GRANT ALL ON SCHEMA public TO public;")
        cur.close()
    finally:
        conn.close()


def run_alembic(database_url_override: str | None) -> int:
    env = os.environ.copy()
    if database_url_override is not None:
        # pydantic-settings: DATABASE_URL이 .env의 db 호스트보다 우선
        env["DATABASE_URL"] = database_url_override
    return subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_ROOT,
        env=env,
        check=False,
    ).returncode


def main() -> None:
    parser = argparse.ArgumentParser(description="DB 초기화 후 마이그레이션 재적용")
    parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="확인 없이 실행",
    )
    args = parser.parse_args()

    if not args.yes:
        print(
            "이 작업은 public 스키마의 모든 데이터와 객체를 삭제한 뒤 "
            "alembic upgrade head를 다시 실행합니다.",
        )
        reply = input("계속하시겠습니까? [y/N]: ").strip().lower()
        if reply != "y":
            print("취소했습니다.")
            sys.exit(0)

    connect_url, alembic_url = effective_sync_database_url()
    if alembic_url is not None:
        print(
            "호스트명 'db'를 이 환경에서 찾을 수 없어 "
            "127.0.0.1로 연결합니다. (Docker 밖에서 실행한 경우)",
            file=sys.stderr,
        )

    print("스키마 초기화 중…")
    reset_schema(connect_url)
    print("alembic upgrade head 실행 중…")
    code = run_alembic(alembic_url)
    if code != 0:
        print(f"alembic이 종료 코드 {code}로 끝났습니다.", file=sys.stderr)
        sys.exit(code)
    print("완료. (세션 정리를 위해 Redis FLUSHALL이 필요할 수 있습니다.)")


if __name__ == "__main__":
    main()
