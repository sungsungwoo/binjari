# 📊 빈자리(Binjari.com) 최종 확정 ERD

## 전제

* `users`는 서비스의 모든 계정을 통합 관리
* **Guest**는 비로그인으로 `users` 행 없음. **Member**는 로그인한 일반 사용자로 `users`에 있으며 `user_roles`에 `HOST`/`ADMIN`이 없을 수 있다(별도 `MEMBER` 행은 DDL에 필수 아님 — 제품 정책은 [`docs/인증인가.md`](./인증인가.md) 참고).
* 호스트/관리자 권한은 RBAC(`roles`, `user_roles`)로 관리  - (Role-Based Access Control, 역할 기반 접근 제어)
* `host_settings`는 **호스트의 예약 페이지/서비스 단위**
* 저장 시각은 모두 **UTC (`TIMESTAMPTZ`)**
* 운영 규칙과 예외 규칙은 **호스트 타임존 기준**
* 임시 선점(Hold)은 **Redis TTL 기반**으로 처리하고, DB의 최종 무결성은 **트랜잭션 + 제약조건**으로 보장

---

## 1. 사용자 도메인 (User Domain)

### `users`

서비스의 모든 사용자 기본 정보

| 컬럼명             | 데이터 타입       | 제약조건 및 설명                            |
| :-------------- | :----------- | :----------------------------------- |
| `id`            | UUID         | Primary Key                          |
| `email`         | VARCHAR(255) | Not Null, Unique, Index              |
| `password_hash` | VARCHAR(255) | Nullable (`GOOGLE` 로그인 사용자는 Null 가능) |
| `provider`      | VARCHAR(20)  | Not Null, `LOCAL`, `GOOGLE`          |
| `name`          | VARCHAR(100) | Not Null                             |
| `is_active`     | BOOLEAN      | Not Null, Default `TRUE`             |
| `created_at`    | TIMESTAMPTZ  | Not Null, UTC                        |
| `updated_at`    | TIMESTAMPTZ  | Not Null, UTC                        |

**권장 제약**

* `UNIQUE(email)`
* `CHECK (provider IN ('LOCAL', 'GOOGLE'))`

---

### `roles`

시스템 권한 종류 정의

| 컬럼명           | 데이터 타입       | 제약조건 및 설명                          |
| :------------ | :----------- | :--------------------------------- |
| `id`          | INTEGER      | Primary Key (Auto Increment)       |
| `name`        | VARCHAR(50)  | Not Null, Unique (`HOST`, `ADMIN`) |
| `description` | VARCHAR(255) | Nullable                           |

**권장 제약**

* `UNIQUE(name)`

**설명**

* 일반 예약자는 별도 `USER` role 없이 `users` 자체로 간주
* 권한 관리가 필요한 역할만 `roles`로 관리

---

### `user_roles`

사용자와 역할의 매핑 테이블

| 컬럼명           | 데이터 타입      | 제약조건 및 설명                          |
| :------------ | :---------- | :--------------------------------- |
| `user_id`     | UUID        | Foreign Key → `users.id`, Not Null |
| `role_id`     | INTEGER     | Foreign Key → `roles.id`, Not Null |
| `assigned_at` | TIMESTAMPTZ | Not Null, UTC                      |

**권장 제약 및 인덱스**

* `PRIMARY KEY (user_id, role_id)`
* Index: `(user_id)`
* Index: `(role_id)`

**설명**

* 한 사용자가 `HOST`이면서 동시에 `ADMIN`일 수 있음

---

## 2. 호스트 운영 설정 도메인 (Host Settings Domain)

### `host_settings`

호스트의 예약 페이지 또는 서비스 단위 설정

| 컬럼명                              | 데이터 타입       | 제약조건 및 설명                                 |
| :------------------------------- | :----------- | :---------------------------------------- |
| `id`                             | UUID         | Primary Key                               |
| `host_id`                        | UUID         | Foreign Key → `users.id`, Not Null, Index |
| `slug`                           | VARCHAR(100) | Not Null, Unique, 예약 페이지 URL 식별자          |
| `title`                          | VARCHAR(150) | Not Null, 예약 페이지/서비스명                     |
| `description`                    | TEXT         | Nullable                                  |
| `host_timezone`                  | VARCHAR(50)  | Not Null, 예: `Asia/Seoul`                 |
| `slot_duration_mins`             | INTEGER      | Not Null, 예: `30`, `60`                   |
| `buffer_duration_mins`           | INTEGER      | Not Null, Default `0`                     |
| `approval_type`                  | VARCHAR(20)  | Not Null, `AUTO`, `MANUAL`                |
| `booking_open_days_ahead`        | INTEGER      | Not Null, Default `30`                    |
| `booking_close_minutes_before`   | INTEGER      | Not Null, Default `120`                   |
| `cancel_deadline_minutes_before` | INTEGER      | Not Null, Default `1440`                  |
| `max_active_bookings_per_user`   | INTEGER      | Not Null, Default `3`                     |
| `is_active`                      | BOOLEAN      | Not Null, Default `TRUE` — 예약 페이지·슬롯 API 사용 가능 여부 |
| `is_listed`                      | BOOLEAN      | Not Null, Default `TRUE` — 마켓플레이스·랜딩 검색 노출 여부 |
| `listing_category`               | VARCHAR(50)  | Nullable, 마켓 필터용 카테고리 라벨(예: 과외·상담)            |
| `setup_completed`              | BOOLEAN      | Not Null, Default `TRUE` — 온보딩/마법사 완료 여부(초안은 `FALSE`) |
| `created_at`                     | TIMESTAMPTZ  | Not Null, UTC                             |
| `updated_at`                     | TIMESTAMPTZ  | Not Null, UTC                             |


**권장 제약**

* `UNIQUE(slug)`
* `CHECK (approval_type IN ('AUTO', 'MANUAL'))`
* `CHECK (slot_duration_mins > 0)`
* `CHECK (buffer_duration_mins >= 0)`
* `CHECK (booking_open_days_ahead >= 0)`
* `CHECK (booking_close_minutes_before >= 0)`
* `CHECK (cancel_deadline_minutes_before >= 0)`
* `CHECK (max_active_bookings_per_user >= 1)`

**중요 정책**

* `host_settings` 생성/수정은 `HOST` 역할을 가진 사용자만 가능
* 이 제약은 **애플리케이션 권한 검증**으로 보장
* `is_active=false`이면 공개 URL(`/book/{slug}`)·슬롯 조회가 거부되고, `is_listed=false`이면 마켓플레이스 목록에 나오지 않으며 직접 링크로만 안내할 수 있다.

---

### `schedule_rules`

호스트의 반복 운영 규칙

| 컬럼명                    | 데이터 타입      | 제약조건 및 설명                                         |
| :--------------------- | :---------- | :------------------------------------------------ |
| `id`                   | UUID        | Primary Key                                       |
| `host_setting_id`      | UUID        | Foreign Key → `host_settings.id`, Not Null, Index |
| `day_of_week`          | SMALLINT    | Not Null, `0~6`                                   |
| `start_time`           | TIME        | Not Null, 호스트 타임존 기준                              |
| `end_time`             | TIME        | Not Null, 호스트 타임존 기준                              |
| `rule_type`            | VARCHAR(20) | Not Null, `OPEN`, `BREAK`                         |
| `effective_start_date` | DATE        | Nullable                                          |
| `effective_end_date`   | DATE        | Nullable                                          |
| `created_at`           | TIMESTAMPTZ | Not Null, UTC                                     |
| `updated_at`           | TIMESTAMPTZ | Not Null, UTC                                     |

**권장 제약**

* `CHECK (day_of_week BETWEEN 0 AND 6)`
* `CHECK (end_time > start_time)`
* `CHECK (rule_type IN ('OPEN', 'BREAK'))`
* `CHECK (effective_end_date IS NULL OR effective_start_date IS NULL OR effective_end_date >= effective_start_date)`

**운영 규칙**

* 동일 `host_setting_id`, 동일 요일 기준으로 시간이 겹치는 규칙은 애플리케이션에서 차단

---

### `schedule_overrides`

특정 날짜에 대한 예외 규칙

| 컬럼명               | 데이터 타입       | 제약조건 및 설명                                         |
| :---------------- | :----------- | :------------------------------------------------ |
| `id`              | UUID         | Primary Key                                       |
| `host_setting_id` | UUID         | Foreign Key → `host_settings.id`, Not Null, Index |
| `override_date`   | DATE         | Not Null                                          |
| `start_time`      | TIME         | Nullable                                          |
| `end_time`        | TIME         | Nullable                                          |
| `override_type`   | VARCHAR(20)  | Not Null, `DAY_OFF`, `OPEN`, `BLOCK`              |
| `reason`          | VARCHAR(255) | Nullable                                          |
| `created_at`      | TIMESTAMPTZ  | Not Null, UTC                                     |
| `updated_at`      | TIMESTAMPTZ  | Not Null, UTC                                     |

**권장 제약**

* `CHECK (override_type IN ('DAY_OFF', 'OPEN', 'BLOCK'))`
* `CHECK (
  (override_type = 'DAY_OFF' AND start_time IS NULL AND end_time IS NULL)
  OR
  (override_type IN ('OPEN', 'BLOCK') AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )`

**운영 규칙**

* 동일 `host_setting_id`, 동일 `override_date` 기준으로 시간이 겹치는 예외 규칙은 애플리케이션에서 차단

---

## 3. 트랜잭션 도메인 (Transaction Domain)

### `slots`

실제 예약 가능한 시간 블록

| 컬럼명               | 데이터 타입      | 제약조건 및 설명                                         |
| :---------------- | :---------- | :------------------------------------------------ |
| `id`              | UUID        | Primary Key                                       |
| `host_setting_id` | UUID        | Foreign Key → `host_settings.id`, Not Null, Index |
| `start_time`      | TIMESTAMPTZ | Not Null, UTC, Index                              |
| `end_time`        | TIMESTAMPTZ | Not Null, UTC                                     |
| `status`          | VARCHAR(20) | Not Null, `OPEN`, `BOOKED`, `BLOCKED`             |
| `created_at`      | TIMESTAMPTZ | Not Null, UTC                                     |
| `updated_at`      | TIMESTAMPTZ | Not Null, UTC                                     |

**권장 제약 및 인덱스**

* `CHECK (end_time > start_time)`
* `CHECK (status IN ('OPEN', 'BOOKED', 'BLOCKED'))`
* `UNIQUE(host_setting_id, start_time)`
* Index: `(host_setting_id, start_time, status)`

**설명**

* `HELD`는 DB 상태로 저장하지 않음
* 임시 선점은 Redis TTL로만 관리
* `EXPIRED`도 저장형 상태로 두지 않고, 과거 여부는 `end_time < now()`로 계산

---

### `bookings`

예약 요청 및 예약 상태 관리의 핵심 테이블

| 컬럼명               | 데이터 타입       | 제약조건 및 설명                                                                         |
| :---------------- | :----------- | :-------------------------------------------------------------------------------- |
| `id`              | UUID         | Primary Key                                                                       |
| `slot_id`         | UUID         | Foreign Key → `slots.id`, Not Null, Index                                         |
| `booker_id`       | UUID         | Foreign Key → `users.id`, Not Null, Index                                         |
| `status`          | VARCHAR(20)  | Not Null, `PENDING`, `CONFIRMED`, `REJECTED`, `CANCELLED`, `NO_SHOW`, `COMPLETED` |
| `idempotency_key` | VARCHAR(100) | Not Null                                                                          |
| `status_reason`   | VARCHAR(255) | Nullable                                                                          |
| `created_at`      | TIMESTAMPTZ  | Not Null, UTC                                                                     |
| `updated_at`      | TIMESTAMPTZ  | Not Null, UTC                                                                     |
| `confirmed_at`    | TIMESTAMPTZ  | Nullable, UTC                                                                     |
| `cancelled_at`    | TIMESTAMPTZ  | Nullable, UTC                                                                     |
| `rejected_at`     | TIMESTAMPTZ  | Nullable, UTC                                                                     |
| `completed_at`    | TIMESTAMPTZ  | Nullable, UTC                                                                     |

**권장 제약 및 인덱스**

* `CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'NO_SHOW', 'COMPLETED'))`
* `UNIQUE(booker_id, idempotency_key)`
* Index: `(booker_id, created_at DESC)`
* Index: `(slot_id)`

---

## 4. 핵심 무결성 규칙

### 4.1 한 슬롯에는 활성 예약이 하나만 존재

PostgreSQL 기준 권장 부분 유니크 인덱스:

```sql
CREATE UNIQUE INDEX uq_active_booking_per_slot
ON bookings(slot_id)
WHERE status IN ('PENDING', 'CONFIRMED');
```

의미:

* 같은 `slot_id`에 대해
* `PENDING` 또는 `CONFIRMED` 상태의 예약은
* 최대 1건만 허용

이것이 **최종 중복 예약 방지의 핵심 DB 제약**입니다.

---

### 4.2 임시 선점(Hold)은 Redis에서만 처리

* 사용자가 예약 진행 시작 시 Redis에 `slot_id` 기준 임시 홀드 생성
* TTL 만료 시 자동 해제
* 최종 예약 확정 시 DB 트랜잭션 내에서 다시 검증
* 따라서 DB `slots.status`에는 `HELD`를 저장하지 않음

이렇게 하면 Redis 상태와 DB 상태가 덜 꼬입니다.

---

### 4.3 슬롯 상태와 예약 상태 역할 분리

* `slots.status`

  * 캘린더에 보여줄 현재 상태
  * `OPEN`, `BOOKED`, `BLOCKED`
* `bookings.status`

  * 예약 요청의 실제 비즈니스 상태
  * `PENDING`, `CONFIRMED`, `REJECTED`, `CANCELLED`, `NO_SHOW`, `COMPLETED`

예:

* 예약 요청 생성 → `bookings.status = PENDING`
* 자동 승인 또는 호스트 승인 완료 → `bookings.status = CONFIRMED`, `slots.status = BOOKED`
* 예약 거절/취소 → 활성 예약이 없으면 `slots.status = OPEN`

---

## 5. 관계 요약

* `users (1) ── (N) user_roles`
* `roles (1) ── (N) user_roles`
* `users (1) ── (N) host_settings`
* `host_settings (1) ── (N) schedule_rules`
* `host_settings (1) ── (N) schedule_overrides`
* `host_settings (1) ── (N) slots`
* `users (1) ── (N) bookings`
* `slots (1) ── (N) bookings`

  * 단, 활성 예약은 DB 제약상 최대 1건

---

## 6. 최종 설계 포인트 요약

이 확정안의 핵심은 아래입니다.

* `users`와 권한을 분리한 RBAC 구조
* 일반 사용자는 `users`, 권한이 필요한 경우만 `roles/user_roles`
* `host_settings`는 호스트 1명당 여러 예약 페이지 지원
* 반복 규칙과 예외 규칙을 분리
* 예외 규칙은 `DAY_OFF / OPEN / BLOCK`를 엄격한 CHECK로 관리
* `slots`는 `OPEN / BOOKED / BLOCKED`만 저장
* 임시 선점은 Redis 전용으로 처리
* `bookings`는 상태 이력과 사유, 시각 컬럼 포함
* 최종 중복 예약 방지는 `uq_active_booking_per_slot`로 보장
* 타임존 정책은 “저장 UTC / 정책 검증은 host_timezone / 화면 표시만 local timezone”

---
