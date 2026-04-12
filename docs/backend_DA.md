# 빈자리(Binjari) 백엔드 폴더 구조 (Directory Architecture)

## 문서 목적

- 아래 트리는 **구현 시 목표로 삼는 구조(Target layout)** 입니다.
- **현재 레포와의 차이:** DB 모델은 초기에 `app/models/models.py` 한 파일에 DDL을 반영해 두고, 도메인이 커지면 `user.py`, `host_setting.py` 등으로 **점진적으로 분리**하면 됩니다.
- **Redis:** 연결·풀은 `core/redis.py`에 두고, `database.py`는 RDB 세션 위주로 두는 편이 역할이 분명합니다. 규모가 작을 때는 둘을 합쳐 `database.py`만 써도 무방합니다.
- **WebSocket:** `endpoints/ws.py`에 라우트/핸들러를 두고, 실제 앱 마운트·lifespan은 `main.py`에서 처리합니다.
- **API 계약·에러 코드:** 구현과의 1:1 대조는 [`docs/API_ERRORS.md`](./API_ERRORS.md), 유스케이스 요약은 [`docs/api_usecase.md`](./api_usecase.md), OpenAPI 초안은 [`docs/openapi.md`](./openapi.md)를 병행한다.
- **엔드포인트 파일:** 트리의 `host_settings.py` 등 세분 이름과 달리, 현재 레포는 `endpoints/host.py`(예약 페이지+규칙+예외+슬롯), `slots_hold.py`, `bookings.py`, `analytics.py` 등으로 묶여 있을 수 있다.

---

```
backend/
├── Dockerfile                     # 백엔드 개발/배포용 Docker 이미지 정의
├── requirements.txt               # Python 패키지 목록
├── alembic.ini                    # Alembic 마이그레이션 설정 파일
│
├── alembic/                       # DB 마이그레이션 버전 관리
│   ├── env.py                     # Alembic 실행 환경 설정
│   ├── script.py.mako             # 마이그레이션 파일 템플릿
│   └── versions/                  # 생성된 마이그레이션 파일들
│
├── app/
│   ├── main.py                    # FastAPI 앱 생성, 미들웨어/예외 핸들러, v1 라우터·WS 마운트
│   ├── database.py                # RDB 엔진, 세션 팩토리, get_session 의존성 (Redis는 core/redis.py와 조합)
│   │
│   ├── core/                      # 공통 핵심 설정 및 보안 모듈
│   │   ├── config.py              # 환경변수(.env) 로드 및 Settings 관리
│   │   ├── redis.py               # Redis 클라이언트/풀 팩토리 (임시 선점, Idempotency, Pub/Sub 등)
│   │   ├── security.py            # 비밀번호 해싱, JWT 생성/검증, 토큰 유틸
│   │   ├── exceptions.py          # 커스텀 예외 클래스 및 전역 예외 처리 규칙
│   │   ├── error_codes.py         # API 에러 코드 상수 정의
│   │   └── enums.py               # 상태값/권한값 Enum 정의
│   │
│   ├── models/                    # SQLModel/SQLAlchemy DB 테이블 모델
│   │   ├── __init__.py            # 모델 import 집계용
│   │   ├── models.py              # (현재) DDL 기준 단일 모델 — 이후 도메인별 파일로 분리 가능
│   │   ├── user.py                # (목표) users, roles, user_roles
│   │   ├── host_setting.py        # (목표) host_settings
│   │   ├── schedule.py            # (목표) schedule_rules, schedule_overrides
│   │   ├── slot.py                # (목표) slots
│   │   └── booking.py             # (목표) bookings
│   │
│   ├── schemas/                   # Pydantic 요청/응답 스키마
│   │   ├── __init__.py            # 스키마 import 집계용
│   │   ├── auth.py                # 회원가입/로그인/토큰 재발급 Req/Res
│   │   ├── user.py                # 사용자 정보 응답 스키마
│   │   ├── host_setting.py        # 예약 페이지 생성/수정/조회 Req/Res
│   │   ├── schedule.py            # 운영 규칙/예외 일정 Req/Res
│   │   ├── slot.py                # 슬롯 조회/생성/차단 관련 Req/Res
│   │   ├── booking.py             # 예약 생성/취소/승인/거절 Req/Res
│   │   ├── notification.py        # 알림 bootstrap 등 Req/Res
│   │   └── common.py              # 공통 응답 포맷, 페이지네이션, 에러 응답 스키마
│   │
│   ├── api/                       # FastAPI 라우터 계층
│   │   └── v1/
│   │       ├── api_router.py      # v1 하위 라우터를 묶는 메인 API Router
│   │       ├── deps.py            # v1 공통 의존성 주입 (현재 유저, 권한 가드, 소유권 검증)
│   │       └── endpoints/
│   │           ├── auth.py              # 인증 API (회원가입, 로그인, OAuth, 토큰 재발급, 로그아웃)
│   │           ├── public.py            # 공개 예약 페이지 API (slug 기반 조회, 캘린더/슬롯 조회)
│   │           ├── holds.py             # Redis 임시 선점 API
│   │           ├── me.py                # 예약자 본인 예약 조회/상세/취소 API
│   │           ├── notifications.py     # GET /notifications/bootstrap 등 초기 동기화·알림 요약 API
│   │           ├── host_settings.py     # 호스트 예약 페이지 목록/생성/수정 API
│   │           ├── host_schedules.py    # 운영 규칙 및 예외 일정 관리 API
│   │           ├── host_slots.py        # 슬롯 일괄 생성/조회/차단 API
│   │           ├── host_bookings.py     # 호스트 예약 목록/상세/승인/거절 API
│   │           ├── host_analytics.py    # 호스트 통계/대시보드 API
│   │           └── ws.py                # WebSocket 핸들러 (앱 마운트는 main.py)
│   │
│   ├── services/                  # 비즈니스 로직 계층
│   │   ├── auth_service.py        # 회원가입/로그인/OAuth/토큰 재발급 로직
│   │   ├── hold_service.py        # Redis 임시 선점 생성/조회/만료 처리
│   │   ├── host_setting_service.py# host_settings 생성/수정/조회 로직
│   │   ├── schedule_service.py    # 운영 규칙/예외 일정 저장 및 검증 로직
│   │   ├── slot_service.py        # 규칙 기반 슬롯 생성, 차단/해제 로직
│   │   ├── booking_service.py     # 예약 생성, 취소, 승인/거절, 트랜잭션 처리
│   │   ├── analytics_service.py   # 통계 집계 로직
│   │   └── notification_service.py# WebSocket/이벤트 발행·bootstrap 데이터 조합 로직
│   │
│   └── utils/                     # 범용 헬퍼 함수 (표준 라이브러리 `datetime` 과 이름 충돌 방지)
│       ├── time_utils.py          # UTC 변환, 타임존 처리 유틸
│       ├── pagination.py          # 커서/페이지네이션 유틸
│       └── idempotency.py         # Idempotency-Key 처리 유틸
│
└── tests/                         # 테스트 코드 (app 바깥 분리)
    ├── conftest.py                # pytest 공통 fixture, 테스트 DB/세션 설정
    ├── test_auth.py               # 인증/인가 테스트
    ├── test_public.py             # 공개 예약 페이지/슬롯 조회 테스트
    ├── test_holds.py              # Redis 임시 선점 테스트
    ├── test_booking.py            # 예약 생성/취소/중복 예약 방지 테스트
    ├── test_host_settings.py      # 예약 페이지 생성/수정 테스트
    ├── test_host_schedules.py     # 운영 규칙/예외 일정 테스트
    ├── test_host_slots.py         # 슬롯 생성/조회/차단 테스트
    ├── test_host_bookings.py      # 호스트 승인/거절 테스트
    ├── test_analytics.py          # 통계 API 테스트
    └── test_notifications.py    # notifications/bootstrap 등 알림 초기화 API 테스트
```

---

## Docker / Alembic

- 모델에 컬럼을 추가한 뒤 **DB에 마이그레이션을 적용하지 않으면** 런타임에서 `UndefinedColumnError`(예: `host_settings.is_listed does not exist`)가 난다.
- `backend/Dockerfile`의 `ENTRYPOINT`가 컨테이너 시작 시 `alembic upgrade head`를 실행한 뒤 `CMD`/`command`(예: `uvicorn`)를 `exec`한다.
- 이미 실행 중인 컨테이너만 갱신할 때는 한 번 `docker compose exec backend alembic upgrade head`로 수동 적용해도 된다.
- 호스트 예약 페이지 온보딩은 `host_settings.setup_completed`·`start_as_draft`·`POST .../complete-setup`·목록 `metrics`로 프론트 마법사·카드와 맞춘다.
