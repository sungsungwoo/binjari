-- UUID 생성 함수 사용
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================
-- 1. users
-- =========================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    provider VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    host_request_status VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT chk_users_provider
        CHECK (provider IN ('LOCAL', 'GOOGLE')),
    CONSTRAINT chk_users_host_request_status
        CHECK (
            host_request_status IS NULL
            OR host_request_status IN ('pending', 'approved', 'rejected')
        )
);


-- =========================
-- 2. roles
-- =========================
CREATE TABLE roles (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(255),

    CONSTRAINT uq_roles_name UNIQUE (name)
);


-- =========================
-- 3. user_roles
-- =========================
CREATE TABLE user_roles (
    user_id UUID NOT NULL,
    role_id INTEGER NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_user_roles PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_user_roles_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_role
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_roles_role_id ON user_roles (role_id);


-- =========================
-- 4. host_settings
-- =========================
CREATE TABLE host_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL,
    slug VARCHAR(100) NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    host_timezone VARCHAR(50) NOT NULL,
    slot_duration_mins INTEGER NOT NULL,
    buffer_duration_mins INTEGER NOT NULL DEFAULT 0,
    approval_type VARCHAR(20) NOT NULL,
    booking_open_days_ahead INTEGER NOT NULL DEFAULT 30,
    booking_close_minutes_before INTEGER NOT NULL DEFAULT 120,
    cancel_deadline_minutes_before INTEGER NOT NULL DEFAULT 1440,
    max_active_bookings_per_user INTEGER NOT NULL DEFAULT 3,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_listed BOOLEAN NOT NULL DEFAULT TRUE,
    listing_category VARCHAR(50),
    setup_completed BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_host_settings_slug UNIQUE (slug),

    CONSTRAINT fk_host_settings_host
        FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT chk_host_settings_slug_format
        CHECK (slug ~ '^[a-z0-9-]+$'),
    CONSTRAINT chk_host_settings_title_not_blank
        CHECK (btrim(title) <> ''),
    CONSTRAINT chk_host_settings_host_timezone_not_blank
        CHECK (btrim(host_timezone) <> ''),
    CONSTRAINT chk_host_settings_approval_type
        CHECK (approval_type IN ('AUTO', 'MANUAL')),
    CONSTRAINT chk_host_settings_slot_duration
        CHECK (slot_duration_mins > 0),
    CONSTRAINT chk_host_settings_buffer_duration
        CHECK (buffer_duration_mins >= 0),
    CONSTRAINT chk_host_settings_open_days_ahead
        CHECK (booking_open_days_ahead >= 0),
    CONSTRAINT chk_host_settings_close_minutes_before
        CHECK (booking_close_minutes_before >= 0),
    CONSTRAINT chk_host_settings_cancel_deadline
        CHECK (cancel_deadline_minutes_before >= 0),
    CONSTRAINT chk_host_settings_max_active_bookings
        CHECK (max_active_bookings_per_user >= 1)
);

CREATE INDEX idx_host_settings_host_id ON host_settings (host_id);

CREATE INDEX idx_host_settings_marketplace_list ON host_settings (created_at, id)
    WHERE is_active IS TRUE AND is_listed IS TRUE;


-- =========================
-- 5. schedule_rules
-- =========================
CREATE TABLE schedule_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_setting_id UUID NOT NULL,
    day_of_week SMALLINT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    rule_type VARCHAR(20) NOT NULL,
    effective_start_date DATE,
    effective_end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_schedule_rules_host_setting
        FOREIGN KEY (host_setting_id) REFERENCES host_settings(id) ON DELETE CASCADE,

    CONSTRAINT chk_schedule_rules_day_of_week
        CHECK (day_of_week BETWEEN 0 AND 6),
    CONSTRAINT chk_schedule_rules_time_range
        CHECK (end_time > start_time),
    CONSTRAINT chk_schedule_rules_rule_type
        CHECK (rule_type IN ('OPEN', 'BREAK')),
    CONSTRAINT chk_schedule_rules_effective_date_range
        CHECK (
            effective_end_date IS NULL
            OR effective_start_date IS NULL
            OR effective_end_date >= effective_start_date
        )
);

CREATE INDEX idx_schedule_rules_host_setting_id
    ON schedule_rules (host_setting_id);


-- =========================
-- 6. schedule_overrides
-- =========================
CREATE TABLE schedule_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_setting_id UUID NOT NULL,
    override_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    override_type VARCHAR(20) NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_schedule_overrides_host_setting
        FOREIGN KEY (host_setting_id) REFERENCES host_settings(id) ON DELETE CASCADE,

    CONSTRAINT chk_schedule_overrides_type
        CHECK (override_type IN ('DAY_OFF', 'OPEN', 'BLOCK')),
    CONSTRAINT chk_schedule_overrides_time_logic
        CHECK (
            (override_type = 'DAY_OFF' AND start_time IS NULL AND end_time IS NULL)
            OR
            (override_type IN ('OPEN', 'BLOCK')
             AND start_time IS NOT NULL
             AND end_time IS NOT NULL
             AND end_time > start_time)
        )
);

CREATE INDEX idx_schedule_overrides_host_setting_date
    ON schedule_overrides (host_setting_id, override_date);


-- =========================
-- 7. slots
-- =========================
CREATE TABLE slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_setting_id UUID NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_slots_host_setting
        FOREIGN KEY (host_setting_id) REFERENCES host_settings(id) ON DELETE CASCADE,

    CONSTRAINT chk_slots_time_range
        CHECK (end_time > start_time),
    CONSTRAINT chk_slots_status
        CHECK (status IN ('OPEN', 'BOOKED', 'BLOCKED')),

    CONSTRAINT uq_slots_host_setting_start_time
        UNIQUE (host_setting_id, start_time)
);

CREATE INDEX idx_slots_host_setting_start_time_status
    ON slots (host_setting_id, start_time, status);


-- =========================
-- 8. bookings
-- =========================
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id UUID NOT NULL,
    booker_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL,
    request_message TEXT,
    status_reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    CONSTRAINT fk_bookings_slot
        FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_booker
        FOREIGN KEY (booker_id) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT chk_bookings_status
        CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'NO_SHOW', 'COMPLETED')),

    CONSTRAINT uq_bookings_booker_idempotency
        UNIQUE (booker_id, idempotency_key)
);

CREATE INDEX idx_bookings_booker_created_at
    ON bookings (booker_id, created_at DESC);

CREATE INDEX idx_bookings_slot_id
    ON bookings (slot_id);

-- 한 슬롯에는 활성 예약(PENDING/CONFIRMED)이 최대 1건만 존재
CREATE UNIQUE INDEX uq_active_booking_per_slot
    ON bookings (slot_id)
    WHERE status IN ('PENDING', 'CONFIRMED');


-- =========================
-- 초기 시드 데이터 (개발·참고용)
-- =========================
-- `alembic upgrade head` 시 `alembic/versions/c3d4e5f6a7b8_seed_roles_and_default_admin.py`에서
-- 동일 INSERT가 실행된다. 앱 기동 시 `backend/app/services/db_seed.py`도 ORM으로 맞춘다.
-- 아래 SQL은 수동으로 DB를 맞출 때 참고하며, bcrypt 해시는 앱과 동일한
-- `hash_password('admin1234!!')` 결과를 사용해야 로그인된다.
-- (해시는 salt마다 달라질 수 있으므로, 수동 삽입 시에는 시드 스크립트 실행을 권장한다.)

-- 역할
INSERT INTO roles (name, description) VALUES
    ('HOST', '예약 페이지 호스트'),
    ('ADMIN', '관리자')
ON CONFLICT (name) DO NOTHING;

-- 기본 관리자 (ADMIN 전용, HOST 역할 없음)
-- 로그인: 이메일 `admin`(별칭) 또는 `admin@binjari.com` / 비밀번호: admin1234!!
INSERT INTO users (
    id,
    email,
    password_hash,
    provider,
    name,
    is_active
) VALUES (
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'admin@binjari.com',
    '$2b$12$6kpDQkZXQhOorVFPLNiMFulCS9Gh2k0FyiQn02181BIy9sAXhNLgG',
    'LOCAL',
    'Admin',
    TRUE
) ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
CROSS JOIN roles r
WHERE u.email = 'admin@binjari.com'
  AND r.name = 'ADMIN'
ON CONFLICT (user_id, role_id) DO NOTHING;
