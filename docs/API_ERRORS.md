# Binjari API — HTTP 상태·`error_code` 대조표 (백엔드 구현 기준)

본 문서는 `backend/app` 기준 **실제 응답**과 `docs/api_usecase.md`를 맞추기 위한 참조다.  
전역 예외 처리: `AppError` → JSON `{ "success": false, "error_code", "message" }`.  
Pydantic 검증 실패 → `422`, `error_code`: **`INVALID_INPUT`**.

---

## 1. 공통

| 상황 | HTTP | `error_code` | 비고 |
|------|------|--------------|------|
| 보호 API에 Bearer 없음 / `Bearer` 아님 | 401 | `UNAUTHORIZED` | `deps.require_auth_payload` |
| Bearer는 있으나 JWT 만료·서명 오류 | 401 | `INVALID_TOKEN` | `security.decode_access_token` |
| JWT에 `sub` 없음 | 401 | `UNAUTHORIZED` | `deps.get_current_user_id` |
| `/host/*`에서 역할에 `HOST` 없음 | 403 | `HOST_ROLE_REQUIRED` | `deps.require_host_payload` |
| 검증되지 않은 요청 본문·쿼리 | 422 | `INVALID_INPUT` | `RequestValidationError` |
| 처리되지 않은 서버 예외 | 500 | `INTERNAL_ERROR` | 전역 핸들러 |

---

## 2. 엔드포인트별 ( `/api/v1` )

### 2.1 시스템

| Method | Path | 추가 실패 (공통 제외) |
|--------|------|------------------------|
| GET | `/health` | 없음 |

### 2.2 인증 (`/auth`)

| Method | Path | 추가 실패 |
|--------|------|-----------|
| POST | `/auth/signup` | `409 EMAIL_ALREADY_EXISTS`, `422 INVALID_INPUT` |
| POST | `/auth/login` | `401 INVALID_CREDENTIALS`, `403 USER_INACTIVE` |
| GET | `/auth/google` | `500 OAUTH_PROVIDER_ERROR` (Google 환경 변수 미설정) |
| GET | `/auth/google/callback` | `400 INVALID_AUTH_CODE`, `401 OAUTH_LOGIN_FAILED`, `409 EMAIL_ALREADY_EXISTS`(경쟁 가입), `500 OAUTH_PROVIDER_ERROR` |
| POST | `/auth/refresh` | `401 INVALID_REFRESH_TOKEN`, `401 EXPIRED_REFRESH_TOKEN` |
| POST | `/auth/logout` | 없음 (쿠키 없어도 200) |

### 2.3 사용자

| Method | Path | 추가 실패 |
|--------|------|-----------|
| GET | `/users/me` | `401 UNAUTHORIZED`, `401 INVALID_TOKEN`, `404` 없음 — 사용자 없을 때 `401 UNAUTHORIZED` (`users.py`) |

### 2.4 공개 (`/public`)

| Method | Path | 추가 실패 |
|--------|------|-----------|
| GET | `/public/marketplace/booking-pages` | `400 INVALID_INPUT`(잘못된 `cursor`) |
| GET | `/public/booking-pages/{slug}` | `404 BOOKING_PAGE_NOT_FOUND`, `403 BOOKING_PAGE_INACTIVE` |
| GET | `/public/booking-pages/{slug}/slots` | `400 INVALID_DATE`, `422 INVALID_DATE_RANGE`, `404 BOOKING_PAGE_NOT_FOUND` |
| GET | `/public/booking-pages/{slug}/slots/daily` | `400 INVALID_DATE`, `404 BOOKING_PAGE_NOT_FOUND` |

### 2.5 Hold / 예약

| Method | Path | 추가 실패 |
|--------|------|-----------|
| POST | `/slots/{slotId}/hold` | `404 SLOT_NOT_FOUND`, `409 SLOT_NOT_OPEN`, `409 SLOT_ALREADY_HELD` |
| GET | `/slots/{slotId}/hold` | `404 SLOT_NOT_FOUND` |
| POST | `/bookings` | `404 SLOT_NOT_FOUND`, `404 BOOKING_PAGE_NOT_FOUND`, `409 SLOT_ALREADY_BOOKED`, `409 HOLD_EXPIRED`, `409 DUPLICATE_REQUEST`, `422 POLICY_VIOLATION`, `422 INVALID_INPUT`(본문·`Idempotency-Key` 등) |

### 2.6 예약자 (`/me`)

| Method | Path | 추가 실패 |
|--------|------|-----------|
| GET | `/me/bookings` | — |
| GET | `/me/bookings/{bookingId}` | `404 BOOKING_NOT_FOUND` (타인 예약도 동일 — 정보 비노출) |
| POST | `/me/bookings/{bookingId}/cancel` | `404 BOOKING_NOT_FOUND`, `409 CANCELLATION_DEADLINE_PASSED`, `409 INVALID_BOOKING_STATUS` |

### 2.7 호스트 — 예약 페이지·규칙·예외·슬롯 (`/host`)

소유권 없음·다른 호스트 리소스: 대부분 **`404` + 도메인 코드** (예: `HOST_SETTING_NOT_FOUND`, `RULE_NOT_FOUND`) — `403 FORBIDDEN`이 아님.

| Method | Path | 주요 `error_code` (공통·HOST 외) |
|--------|------|----------------------------------|
| GET/POST | `/host/booking-pages` … | `404 HOST_SETTING_NOT_FOUND`, `409 SLUG_ALREADY_EXISTS` |
| PATCH | `/host/booking-pages/{id}` | 위와 동일 |
| POST | `/host/booking-pages/{id}/complete-setup` | `404 HOST_SETTING_NOT_FOUND` |
| DELETE | `/host/booking-pages/{id}` | `404 HOST_SETTING_NOT_FOUND`, `409 HOST_SETTING_HAS_BOOKINGS` |
| POST | `.../toggle-active` | `404 HOST_SETTING_NOT_FOUND` |
| POST | `.../toggle-listed` | `404 HOST_SETTING_NOT_FOUND` |
| GET/POST | `.../rules` | `404 HOST_SETTING_NOT_FOUND`, `422 INVALID_TIME_RANGE`, `409 OVERLAPPING_RULE` |
| PATCH/DELETE | `/host/rules/{ruleId}` | `404 RULE_NOT_FOUND`, `422 INVALID_TIME_RANGE`, `409 OVERLAPPING_RULE` |
| GET | `.../overrides` | `400 INVALID_DATE`, `422 INVALID_DATE_RANGE`, `404 HOST_SETTING_NOT_FOUND` |
| POST | `.../overrides` | `404 HOST_SETTING_NOT_FOUND`, `422 INVALID_OVERRIDE_TYPE`, `422 INVALID_TIME_RANGE`, `409 OVERLAPPING_OVERRIDE` |
| PATCH/DELETE | `/host/overrides/{id}` | `404 OVERRIDE_NOT_FOUND`, `422 INVALID_TIME_RANGE`, `409 OVERLAPPING_OVERRIDE` |
| POST | `.../slots/generate` | `404 HOST_SETTING_NOT_FOUND`, `422 INVALID_DATE_RANGE` |
| GET | `.../slots` | `400 INVALID_DATE`, `422 INVALID_DATE_RANGE`, `404 HOST_SETTING_NOT_FOUND` |
| POST | `/host/slots/{slotId}/block` | `404 SLOT_NOT_FOUND`, `403 FORBIDDEN`(타 호스트 슬롯), `409 SLOT_ALREADY_BOOKED` |
| POST | `/host/slots/{slotId}/unblock` | `404 SLOT_NOT_FOUND`, `403 FORBIDDEN`, `409 SLOT_NOT_BLOCKED` |

### 2.8 호스트 예약 (`/host/bookings`)

| Method | Path | 추가 실패 |
|--------|------|-----------|
| GET | `/host/bookings` | — |
| GET | `/host/bookings/{bookingId}` | `404 BOOKING_NOT_FOUND` (소유 호스트 아님 포함) |
| POST | `.../approve` | `404 BOOKING_NOT_FOUND`, `409 INVALID_BOOKING_STATUS` |
| POST | `.../reject` | 동일 + 본문 검증 `422 INVALID_INPUT` |

### 2.9 통계 (`/host/analytics`)

| Method | Path | 추가 실패 |
|--------|------|-----------|
| GET | `/host/analytics/summary` | `400 INVALID_DATE`, `422 INVALID_DATE_RANGE`, `404 HOST_SETTING_NOT_FOUND`(쿼리로 `hostSettingId` 지정 시) |
| GET | `/host/analytics/popular-slots` | 동일 |

### 2.10 알림

| Method | Path | 추가 실패 |
|--------|------|-----------|
| GET | `/notifications/bootstrap` | — |

### 2.11 WebSocket

| | |
|--|--|
| URL | `GET /api/v1/ws` (Upgrade) |
| 인증 | `Sec-WebSocket-Protocol: bearer, <access_token>` 또는 쿼리 `?token=` |
| 실패 | **HTTP JSON이 아님** — 연결 전/직후 **WebSocket close `1008`**, reason에 `INVALID_TOKEN` 등. HTTP API의 `401` + JSON 본문과는 형식이 다름. |

---

## 3. 문서 동기화

- 유스케이스 요약: `docs/api_usecase.md`
- OpenAPI 초안: `docs/openapi.md` (공통 에러는 본 표를 우선 참고)
- 상수 정의: `backend/app/core/error_codes.py`

마지막 대조일: 구현 기준 스냅샷 (변경 시 본 파일·유스케이스를 함께 수정할 것).
