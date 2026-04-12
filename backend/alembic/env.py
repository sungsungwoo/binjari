import sys
import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context
from sqlmodel import SQLModel

# 🚀 1. 'app' 폴더를 인식할 수 있도록 경로 추가
sys.path.append(os.getcwd())

# 🚀 2. 설정값과 모델 메타데이터 가져오기
from app.core.config import get_settings
from app.database import metadata  # SQLModel.metadata와 동일
import app.models  # 모든 모델 테이블이 metadata에 등록되도록 import

settings = get_settings()
config = context.config

# 로깅 설정
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Alembic이 분석할 대상 지정
target_metadata = metadata

def run_migrations_offline() -> None:
    """내보내기(스크립트 생성) 모드"""
    # 동기 드라이버 주소로 변환
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True, # 컬럼 타입 변경 감지
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """실제 DB 연결 모드"""
    # 🚀 3. Alembic용 동기 DB 주소 강제 설정
    # asyncpg(비동기) 주소가 들어오면 psycopg2(동기)로 바꿉니다.
    sync_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    
    # alembic.ini의 주소를 무시하고 우리 설정값 주입
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = sync_url

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, 
            target_metadata=target_metadata,
            compare_type=True
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()