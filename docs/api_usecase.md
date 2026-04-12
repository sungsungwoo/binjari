# 빈자리(Binjari.com) API 유스케이스 표

> **구현·`error_code`·HTTP 상태의 상세 대조표:** [`docs/API_ERRORS.md`](./API_ERRORS.md)  
> 아래 표는 흐름 요약이며, 실패 케이스는 빠짐없이 `API_ERRORS.md`를 기준으로 한다.  
> **역할(Guest / Member / Host / Admin)·공개 vs 보호 API 기준:** [`docs/인증인가.md`](./인증인가.md) §2.1

## 공통 (보호 API에 공통 적용)

| 상황 | HTTP | `error_code` |
|------|------|----------------|
| 인증 필요 API에 Bearer 없음 / 스킴 오류 | 401 | `UNAUTHORIZED` |
| JWT 만료·서명 오류 | 401 | `INVALID_TOKEN` |
| `/host/*` 호스트 전용 API에 `roles`에 `HOST` 없음 | 403 | `HOST_ROLE_REQUIRED` |
| Pydantic·FastAPI 검증 실패 (본문·쿼리·헤더) | 422 | `INVALID_INPUT` |
| 미처리 서버 예외 | 500 | `INTERNAL_ERROR` |

---

## 1. 인증 / 사용자

| 행위              | 엔드포인트                              | 요청                          | 응답                                                   | 실패 케이스 (요약) |
| --------------- | ---------------------------------- | --------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| 이메일 회원가입        | `POST /api/v1/auth/signup`         | `email`, `password`, `name` | `201 Created`, `user`, `accessToken` + `Set-Cookie(refresh_token=...)` | `409 EMAIL_ALREADY_EXISTS`, `422 INVALID_INPUT`          |
| 이메일 로그인         | `POST /api/v1/auth/login`          | `email`, `password`         | `200 OK`, `user`, `accessToken` + `Set-Cookie(refresh_token=...)`      | `401 INVALID_CREDENTIALS`, `403 USER_INACTIVE`, `422 INVALID_INPUT`           |
| 구글 OAuth 로그인 시작 | `GET /api/v1/auth/google`          | 없음                          | `302` 구글 인증 URL                                     | `500 OAUTH_PROVIDER_ERROR`                               |
| 구글 OAuth 콜백 처리  | `GET /api/v1/auth/google/callback` | query: `code`, `state`, (optional) `error`, `response_mode=json` | `302` + `Set-Cookie` 또는 `response_mode=json` 시 `200` + JSON `AuthResponse` + `Set-Cookie` | `400 INVALID_AUTH_CODE`, `401 OAUTH_LOGIN_FAILED`, `409 EMAIL_ALREADY_EXISTS`, `500 OAUTH_PROVIDER_ERROR`        |
| 토큰 재발급          | `POST /api/v1/auth/refresh`        | HttpOnly Cookie `refresh_token` (body 없음) | `200 OK`, 새 `accessToken` + `Set-Cookie(refresh_token=...)` | `401 INVALID_REFRESH_TOKEN`, `401 EXPIRED_REFRESH_TOKEN` |
| 로그아웃 | `POST /api/v1/auth/logout` | Cookie 선택 | `200 OK`, Redis에서 refresh 무효화 시도 + 쿠키 삭제 | 공통 제외 특이 없음 |
| 내 정보 조회         | `GET /api/v1/users/me`             | Authorization Header        | `200 OK`, 현재 로그인 사용자 정보                              | `401 UNAUTHORIZED`, `401 INVALID_TOKEN`, `401 UNAUTHORIZED`(DB에 사용자 없음)                                       |

`users`는 이메일/비밀번호 또는 구글 로그인 사용자 정보를 담고, `provider`는 `LOCAL` 또는 `GOOGLE`이며 이메일은 유니크입니다.  
Refresh Token은 응답 body가 아니라 **HttpOnly Secure Cookie**로 전달하며, `/auth/refresh`는 쿠키 기반으로 동작합니다.  
(문서상 Origin/Referer 검증은 권장 사항이며, 구현 여부는 배포 설정에 따름.)

---

## 2. 공개 예약 페이지 / 예약자 조회

공개 예약 페이지 식별자는 `slug`를 사용하고, 내부 관리용 식별자는 `hostSettingId`(UUID)를 사용합니다.

| 행위                 | 엔드포인트                                                                         | 요청                                | 응답                                                                                                        | 실패 케이스 (요약)                                                    |
| ------------------ | ----------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 마켓플레이스 공개 예약 페이지 목록 | `GET /api/v1/public/marketplace/booking-pages` | query: `q`(선택), `category`(선택, 미분류는 `__uncategorized__`), `limit`, `cursor` | `200 OK`, `data.items[]`(`slug`, `title`, `description`, `listing_category`), `data.next_cursor` | `400 INVALID_INPUT`(잘못된 `cursor`) |
| 공개 예약 페이지 기본 정보 조회 | `GET /api/v1/public/booking-pages/{slug}`                                     | path: `slug`                      | `200 OK`, `data` = `HostSetting` 필드 | `404 BOOKING_PAGE_NOT_FOUND`, `403 BOOKING_PAGE_INACTIVE` |
| 월 단위 캘린더 슬롯 조회     | `GET /api/v1/public/booking-pages/{slug}/slots?from=2026-04-01&to=2026-04-30` | path: `slug`, query: `from`, `to` | `200 OK`, `data.days[]` — `date`, `slots[]` | `400 INVALID_DATE`, `422 INVALID_DATE_RANGE`, `404 BOOKING_PAGE_NOT_FOUND`    |
| 특정 날짜 슬롯 조회        | `GET /api/v1/public/booking-pages/{slug}/slots/daily?date=2026-04-15`         | path: `slug`, query: `date`       | `200 OK`, `data.items[]` 슬롯 배열                                                                                     | `400 INVALID_DATE`, `404 BOOKING_PAGE_NOT_FOUND`          |

`host_settings`에는 예약 페이지 정책(`approval_type`, `slot_duration_mins`, `booking_close_minutes_before`, `cancel_deadline_minutes_before`, `max_active_bookings_per_user`)과 노출 정책(`is_active`, `is_listed`, `listing_category`)이 있고, 마켓 목록에는 **`is_active`·`is_listed`가 모두 true**인 행만 포함된다. `slots.status`는 `OPEN`, `BOOKED`, `BLOCKED`로 관리됩니다. `HELD`는 DB에 저장하지 않고 Redis TTL로만 처리합니다. 

---

## 3. 예약 임시 선점 / 예약 생성

| 행위                    | 엔드포인트                              | 요청                                                                                                          | 응답                                                                                         | 실패 케이스 (요약)                                                                                                             |
| --------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 슬롯 임시 선점 시작           | `POST /api/v1/slots/{slotId}/hold` | Authorization Header, `slotId`                                                                              | `200 OK`, `hold_token`, `expires_at`, `remaining_seconds`                                  | 공통, `404 SLOT_NOT_FOUND`, `409 SLOT_ALREADY_HELD`, `409 SLOT_NOT_OPEN`                             |
| 임시 선점 상태 조회           | `GET /api/v1/slots/{slotId}/hold`  | Authorization Header                                                                                        | `200 OK`, `held`, `expires_at`, 본인 선점 시 `hold_token`                                                  | 공통, `404 SLOT_NOT_FOUND`                                                                           |
| 예약 생성(수동 승인/자동 승인 공통) | `POST /api/v1/bookings`            | Header: `Idempotency-Key`, body: `slot_id`, `hold_token`, `request_message`(optional) | `201 Created` 또는 **동일 키 재요청** `200 OK`, `data.booking`, `slot_status`, `message` | 공통, `404 SLOT_NOT_FOUND`, `404 BOOKING_PAGE_NOT_FOUND`, `409 SLOT_ALREADY_BOOKED`, `409 HOLD_EXPIRED`, `409 DUPLICATE_REQUEST`(동일 키·다른 슬롯), `422 POLICY_VIOLATION`, `422 INVALID_INPUT` |

예약 생성 시 `Idempotency-Key`를 받아 같은 요청의 중복 처리 방지하고, Redis 임시 선점은 사용자 경험 개선용이며, 최종 확정은 DB 트랜잭션과 제약으로 보장합니다. `bookings.status`는 `PENDING`, `CONFIRMED`, `REJECTED`, `CANCELLED`, `NO_SHOW`, `COMPLETED`를 사용하고, 동일 슬롯에는 활성 예약(`PENDING`, `CONFIRMED`)이 최대 1건만 허용됩니다.   

### 예약 생성 응답 예시

* 수동 승인형: `status = PENDING`, `slot_status = BOOKED`
* 자동 승인형: `status = CONFIRMED`, `slot_status = BOOKED`

---

## 4. 예약자 내 예약 조회 / 취소

| 행위         | 엔드포인트                                               | 요청                                                                | 응답                                                       | 실패 케이스 (요약)                                                                                                |
| ---------- | --------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 내 예약 목록 조회 | `GET /api/v1/me/bookings?status=PENDING&cursor=...` | Authorization Header, optional query: `status`, `cursor`, `limit` | `200 OK`, `items[]`, `next_cursor`                       | 공통                                                                                    |
| 내 예약 상세 조회 | `GET /api/v1/me/bookings/{bookingId}`               | Authorization Header                                              | `200 OK`, `data.booking`, `data.can_cancel`                        | 공통, `404 BOOKING_NOT_FOUND` (타인 예약도 동일 코드·메시지로 비노출)                                          |
| 내 예약 취소    | `POST /api/v1/me/bookings/{bookingId}/cancel`       | Authorization Header, optional body: `reason`                     | `200 OK`, `booking.status=CANCELLED`, `slot.status=OPEN`, `reason` → `bookings.status_reason`(최대 255자) | 공통, `404 BOOKING_NOT_FOUND`, `409 CANCELLATION_DEADLINE_PASSED`, `409 INVALID_BOOKING_STATUS`, `422 INVALID_INPUT` |

취소 가능 시점은 `cancel_deadline_minutes_before`와 `host_timezone` 기준으로 검증하고, 취소 성공 시 `bookings`는 `CANCELLED`, `slots`는 `OPEN`으로 함께 바뀝니다. 예약 목록은 사용자 기준 조회가 많아서 `booker_id`, `created_at` 인덱스를 둔 구조입니다.  

---

## 5. 호스트 예약 페이지(`host_settings`) 관리

다른 호스트 소유 `host_setting_id` 또는 존재하지 않는 ID: **`404 HOST_SETTING_NOT_FOUND`** (403 `FORBIDDEN` 아님).

| 행위               | 엔드포인트                                                           | 요청                                                                                                                                                                                                                                                                      | 응답                           | 실패 케이스 (요약)                                                                                       |
| ---------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| 내 예약 페이지 목록 조회   | `GET /api/v1/host/booking-pages`                                | Authorization Header                                                                                                                                                                                                                                                    | `200 OK`, `data.items[]` 각 항목에 `metrics`(rules_count, open_slots_count, today_bookings, week_bookings, pending_bookings) 포함 | 공통, `403 HOST_ROLE_REQUIRED`                                                 |
| 예약 페이지 생성        | `POST /api/v1/host/booking-pages`                               | Authorization Header, body: `title`, `slug`, `start_as_draft`(선택, true면 초안·비활성) 등 | `201 Created`, `hostSetting` | 공통, `403 HOST_ROLE_REQUIRED`, `409 SLUG_ALREADY_EXISTS`, `422 INVALID_INPUT` |
| 예약 페이지 상세 조회     | `GET /api/v1/host/booking-pages/{hostSettingId}`                | Authorization Header                                                                                                                                                                                                                                                    | `200 OK`, `hostSetting`      | 공통, `403 HOST_ROLE_REQUIRED`, `404 HOST_SETTING_NOT_FOUND`                            |
| 예약 페이지 기본 설정 수정  | `PATCH /api/v1/host/booking-pages/{hostSettingId}`              | Authorization Header, 일부 필드 patch                                                                                                                                                                                                                                       | `200 OK`, 수정된 `hostSetting`  | 공통, `403 HOST_ROLE_REQUIRED`, `404 HOST_SETTING_NOT_FOUND`, `409 SLUG_ALREADY_EXISTS`, `422 INVALID_INPUT`          |
| 예약 페이지 활성/비활성 전환 | `POST /api/v1/host/booking-pages/{hostSettingId}/toggle-active` | Authorization Header, `is_active`                                                                                                                                                                                                                                       | `200 OK`, `is_active` 반영 결과  | 공통, `403 HOST_ROLE_REQUIRED`, `404 HOST_SETTING_NOT_FOUND`                            |
| 마켓플레이스 공개/비공개 전환 | `POST /api/v1/host/booking-pages/{hostSettingId}/toggle-listed` | Authorization Header, `is_listed`                                                                                                                                                                                                                                       | `200 OK`, `is_listed` 반영 결과   | 공통, `403 HOST_ROLE_REQUIRED`, `404 HOST_SETTING_NOT_FOUND`                            |
| 마법사 완료·활성화 | `POST /api/v1/host/booking-pages/{hostSettingId}/complete-setup` | Authorization Header, body: `activate`(기본 true) | `200 OK`, `setup_completed=true`, `activate`가 true면 `is_active=true` | 공통, `404 HOST_SETTING_NOT_FOUND` |
| 예약 페이지 삭제 | `DELETE /api/v1/host/booking-pages/{hostSettingId}` | Authorization Header | `204 No Content` | 공통, `404 HOST_SETTING_NOT_FOUND`, 예약이 있으면 `409 HOST_SETTING_HAS_BOOKINGS` |

`host_settings`는 `HOST` 역할 사용자만 생성/수정 가능하고, `approval_type`은 `AUTO` 또는 `MANUAL`, 각 숫자 정책 컬럼은 양수/0 이상 제약을 가집니다. 생성·수정 시 `is_listed`, `listing_category`로 마켓 노출을 제어할 수 있다. 

---

## 6. 호스트 운영 규칙(`schedule_rules`) / 예외 일정(`schedule_overrides`) 관리

| 행위          | 엔드포인트                                                                      | 요청                                                                                                                             | 응답                        | 실패 케이스 (요약)                                                                                       |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------- |
| 운영 규칙 목록 조회 | `GET /api/v1/host/booking-pages/{hostSettingId}/rules`                     | Authorization Header                                                                                                           | `200 OK`, `rules[]`       | 공통, `403 HOST_ROLE_REQUIRED`, `404 HOST_SETTING_NOT_FOUND`                            |
| 운영 규칙 생성    | `POST /api/v1/host/booking-pages/{hostSettingId}/rules`                    | Authorization Header, body: `day_of_week`, `start_time`, `end_time`, `rule_type`, `effective_start_date`, `effective_end_date` | `201 Created`, `rule`     | 공통, `403 HOST_ROLE_REQUIRED`, `404 HOST_SETTING_NOT_FOUND`, `422 INVALID_TIME_RANGE`, `409 OVERLAPPING_RULE`        |
| 운영 규칙 수정    | `PATCH /api/v1/host/rules/{ruleId}`                                        | Authorization Header, partial body                                                                                             | `200 OK`, `rule`          | 공통, `403 HOST_ROLE_REQUIRED`, `404 RULE_NOT_FOUND`, `422 INVALID_TIME_RANGE`, `409 OVERLAPPING_RULE`            |
| 운영 규칙 삭제    | `DELETE /api/v1/host/rules/{ruleId}`                                       | Authorization Header                                                                                                           | `204 No Content`          | 공통, `403 HOST_ROLE_REQUIRED`, `404 RULE_NOT_FOUND`                                    |
| 예외 일정 목록 조회 | `GET /api/v1/host/booking-pages/{hostSettingId}/overrides?from=...&to=...` | Authorization Header                                                                                                           | `200 OK`, `overrides[]`   | 공통, `403 HOST_ROLE_REQUIRED`, `400 INVALID_DATE`, `422 INVALID_DATE_RANGE`, `404 HOST_SETTING_NOT_FOUND`                            |
| 예외 일정 생성    | `POST /api/v1/host/booking-pages/{hostSettingId}/overrides`                | Authorization Header, body: `override_date`, `override_type`, `start_time`, `end_time`, `reason`                               | `201 Created`, `override` | 공통, `403 HOST_ROLE_REQUIRED`, `404 HOST_SETTING_NOT_FOUND`, `422 INVALID_OVERRIDE_TYPE`, `422 INVALID_TIME_RANGE`, `409 OVERLAPPING_OVERRIDE` |
| 예외 일정 수정    | `PATCH /api/v1/host/overrides/{overrideId}`                                | Authorization Header                                                                                                           | `200 OK`, `override`      | 공통, `403 HOST_ROLE_REQUIRED`, `404 OVERRIDE_NOT_FOUND`, `422 INVALID_TIME_RANGE`, `409 OVERLAPPING_OVERRIDE`      |
| 예외 일정 삭제    | `DELETE /api/v1/host/overrides/{overrideId}`                               | Authorization Header                                                                                                           | `204 No Content`          | 공통, `403 HOST_ROLE_REQUIRED`, `404 OVERRIDE_NOT_FOUND`                                |

`schedule_rules`는 `OPEN`/`BREAK`, `schedule_overrides`는 `DAY_OFF`/`OPEN`/`BLOCK`를 사용하며, 날짜/시간 겹침은 애플리케이션 레벨에서 차단하는 설계입니다. `DAY_OFF`는 시간값이 없어야 하고, `OPEN`/`BLOCK`은 `start_time`, `end_time`이 모두 있어야 합니다. 

---

## 7. 슬롯 생성 / 슬롯 관리

| 행위        | 엔드포인트                                                                              | 요청                                                 | 응답                                                    | 실패 케이스 (요약)                                                                               |
| --------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 슬롯 일괄 생성  | `POST /api/v1/host/booking-pages/{hostSettingId}/slots/generate`                   | Authorization Header, body: `from_date`, `to_date` | `200 OK`, `generated_count`, `skipped_count`, `range` | 공통, `403 HOST_ROLE_REQUIRED`, `404 HOST_SETTING_NOT_FOUND`, `422 INVALID_DATE_RANGE`                        |
| 호스트 슬롯 조회 | `GET /api/v1/host/booking-pages/{hostSettingId}/slots?from=...&to=...&status=OPEN` | Authorization Header                               | `200 OK`, `slots[]`                                   | 공통, `403 HOST_ROLE_REQUIRED`, `400 INVALID_DATE`, `422 INVALID_DATE_RANGE`, `404 HOST_SETTING_NOT_FOUND`                    |
| 슬롯 수동 차단  | `POST /api/v1/host/slots/{slotId}/block`                                           | Authorization Header, optional `reason`            | `200 OK`, `slot.status=BLOCKED`                       | 공통, `403 HOST_ROLE_REQUIRED`, `404 SLOT_NOT_FOUND`, `403 FORBIDDEN`(타 호스트 슬롯), `409 SLOT_ALREADY_BOOKED` |
| 슬롯 차단 해제  | `POST /api/v1/host/slots/{slotId}/unblock`                                         | Authorization Header                               | `200 OK`, `slot.status=OPEN`                          | 공통, `403 HOST_ROLE_REQUIRED`, `404 SLOT_NOT_FOUND`, `403 FORBIDDEN`, `409 SLOT_NOT_BLOCKED`    |

슬롯은 운영 규칙과 예외 일정을 계산해 생성하고, `UNIQUE(host_setting_id, start_time)`으로 중복 생성을 막습니다. 상태는 `OPEN`, `BOOKED`, `BLOCKED`를 사용합니다. 

---

## 8. 호스트 예약 관리(조회 / 승인 / 거절)

소유 호스트가 아닌 예약 조회·처리: **`404 BOOKING_NOT_FOUND`**.

| 행위          | 엔드포인트                                                        | 요청                                   | 응답                                                         | 실패 케이스 (요약)                                                                                     |
| ----------- | ------------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 예약 요청 목록 조회 | `GET /api/v1/host/bookings?status=PENDING&hostSettingId=...` | Authorization Header, query filters  | `200 OK`, `items[]`                                        | 공통, `403 HOST_ROLE_REQUIRED`                                               |
| 예약 상세 조회    | `GET /api/v1/host/bookings/{bookingId}`                      | Authorization Header                 | `200 OK`, 예약 상세 + 예약자 정보 + 상태                              | 공통, `403 HOST_ROLE_REQUIRED`, `404 BOOKING_NOT_FOUND`                               |
| 예약 승인       | `POST /api/v1/host/bookings/{bookingId}/approve`             | Authorization Header                 | `200 OK`, `booking.status=CONFIRMED`, `slot.status=BOOKED` | 공통, `403 HOST_ROLE_REQUIRED`, `404 BOOKING_NOT_FOUND`, `409 INVALID_BOOKING_STATUS` |
| 예약 거절       | `POST /api/v1/host/bookings/{bookingId}/reject`              | Authorization Header, body: `reason` | `200 OK`, `booking.status=REJECTED`, `slot.status=OPEN`    | 공통, `403 HOST_ROLE_REQUIRED`, `404 BOOKING_NOT_FOUND`, `409 INVALID_BOOKING_STATUS`, `422 INVALID_INPUT` |

수동 승인 흐름에서는 예약 생성 시 `PENDING`, 승인 시 `CONFIRMED`, 거절 시 `REJECTED`가 되며, 거절/취소 시 슬롯은 다시 `OPEN`으로 돌아갑니다. `slots.status`는 캘린더 가용 상태, `bookings.status`는 비즈니스 상태라는 역할 분리가 핵심입니다. 

---

## 9. 통계 대시보드

| 행위               | 엔드포인트                                                                        | 요청                              | 응답                                                                          | 실패 케이스 (요약)                                                        |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 호스트 통계 요약 조회     | `GET /api/v1/host/analytics/summary?hostSettingId=...&from=...&to=...`       | Authorization Header, query: 기간 | `200 OK`, `daily_count`, `weekly_count`, `approval_rate`, `popular_slots[]` | 공통, `403 HOST_ROLE_REQUIRED`, `400 INVALID_DATE`, `422 INVALID_DATE_RANGE`, `404 HOST_SETTING_NOT_FOUND`(선택 `hostSettingId` 소유 검증 실패 시) |
| 인기 시간대 차트 데이터 조회 | `GET /api/v1/host/analytics/popular-slots?hostSettingId=...&from=...&to=...` | Authorization Header            | `200 OK`, `data.items[]` 시간대 집계                                                    | 공통, `403 HOST_ROLE_REQUIRED`, `400 INVALID_DATE`, `422 INVALID_DATE_RANGE`, `404 HOST_SETTING_NOT_FOUND`                           |

MVP 통계는 일간/주간 예약 건수, 승인율, 인기 시간대 중심입니다. 

---

## 10. 실시간 알림 / 상태 동기화

| 행위           | 엔드포인트                                 | 요청                   | 응답                                           | 실패 케이스 (요약)                               |
| ------------ | ------------------------------------- | -------------------- | -------------------------------------------- | ------------------------------------ |
| 웹소켓 연결       | `GET /api/v1/ws` (Upgrade)            | `Sec-WebSocket-Protocol: bearer, <access_token>` 또는 `?token=`         | 연결 유지 시 JSON 텍스트 프레임으로 이벤트 수신                            | 토큰 없음/무효 시 **WebSocket close `1008`** (HTTP `401` JSON 본문 아님). `INVALID_TOKEN` 등은 close reason 문자열로 전달될 수 있음. |
| 초기 동기화 상태 조회 | `GET /api/v1/notifications/bootstrap` | Authorization Header | `200 OK`, `unread_count`, `last_events[]` | 공통 |

실시간 알림은 WebSocket + **Redis Pub/Sub**로 사용자별 채널에 발행됩니다. 연결이 끊겨도 `bootstrap`으로 큐 상태를 재조회할 수 있습니다. 

### WebSocket 이벤트 예시

* `booking.requested`
* `booking.confirmed`
* `booking.rejected`
* `booking.cancelled`
* `slot.updated`

---

## 11. 시스템

| 행위 | 엔드포인트 | 응답 | 실패 |
|------|------------|------|------|
| 헬스 | `GET /api/v1/health` | `200 OK`, `success`, `message` | 없음 |

---

# 공통 응답/에러 규격 예시

## 성공 응답 예시

```json
{
  "success": true,
  "data": {
    "booking_id": "uuid",
    "status": "PENDING"
  }
}
```

## 실패 응답 예시 (HTTP API)

```json
{
  "success": false,
  "error_code": "SLOT_ALREADY_BOOKED",
  "message": "이미 예약된 시간입니다."
}
```

일관된 글로벌 예외 처리와 규격화된 JSON 에러 응답을 사용하는 방향이 PRD에 맞습니다. 

---

# 우선 구현 순서 추천

1.인증 API (Auth): 모든 API의 기반이 되는 로그인/회원가입
2.호스트 예약 페이지 API (Host Settings): 예약을 받을 '판'을 까는 단계 (현재 5번)
3.운영 규칙 / 슬롯 생성 API (Rules & Slots): 빈자리를 DB에 생성하는 단계 (현재 6, 7번)
4.공개 예약 페이지 조회 API (Public): 만들어진 빈자리를 조회하는 단계 (현재 2번)
5.슬롯 임시 선점 / 예약 생성 API (Booking): 실제 예약을 꽂아 넣는 트랜잭션 단계 (현재 3번)
6.호스트 승인 / 거절 API (Host Action): 들어온 예약을 처리하는 단계 (현재 8번)
7.내 예약 조회 / 취소 API (Me): 내 결과를 확인하는 단계 (현재 4번)
8.통계 및 WebSocket (Analytics & WS): 마무리 및 고도화 단계
