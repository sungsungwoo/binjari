# 1. 가볍고 안정적인 Python 3.11 Slim 이미지 사용
FROM python:3.11-slim

# 2. 파이썬 환경 변수 설정 (성능 및 로그 최적화)
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# 3. 작업 디렉토리 설정
WORKDIR /app

# 4. 필수 시스템 패키지 설치 (PostgreSQL 드라이버 빌드용)
# 설치 후 apt 캐시를 지워 도커 이미지 용량을 최소화합니다.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 5. 파이썬 의존성 파일 복사 및 설치
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# 6. 소스 코드 전체 복사
COPY . .

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# 7. 포트 노출 (문서화 용도)
EXPOSE 8000

# 8. 마이그레이션 후 uvicorn (compose의 command 인자가 exec 로 전달됨)
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]