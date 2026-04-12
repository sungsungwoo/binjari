openapi: 3.1.0
info:
  title: Binjari API
  version: 0.1.0
  summary: Real-time booking and scheduling platform API
  description: |
    MVP draft for Binjari.com.
    Designed for FastAPI + Pydantic + JWT auth.
    Public booking pages use slug-based routing. Refresh Token is delivered via HttpOnly Secure Cookie.

    **에러·HTTP·`error_code` 전수 대조:** [`docs/API_ERRORS.md`](./API_ERRORS.md) (OpenAPI에 모든 경로별 4xx를 나열하지 않음; 구현 기준은 해당 문서가 우선).

    **공통 HTTP API 오류 본문:** `{ "success": false, "error_code": "<string>", "message": "<string>" }`
    - 인증 누락: `401` + `UNAUTHORIZED`
    - JWT 무효/만료: `401` + `INVALID_TOKEN`
    - 호스트 전용(`/host/*`) 비호스트: `403` + `HOST_ROLE_REQUIRED`
    - 스키마 검증 실패: `422` + `INVALID_INPUT`
    - WebSocket `/ws`는 HTTP JSON 오류가 아니라 close code `1008` 등으로 거절될 수 있음.

servers:
  - url: /api/v1
    description: API v1

tags:
  - name: auth
  - name: users
  - name: public-booking-pages
  - name: holds
  - name: bookings
  - name: host-booking-pages
  - name: host-rules
  - name: host-overrides
  - name: host-slots
  - name: host-bookings
  - name: host-analytics
  - name: notifications
  - name: system

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  parameters:
    SlugParam:
      name: slug
      in: path
      required: true
      schema:
        type: string
      description: Public booking page slug

    HostSettingIdParam:
      name: hostSettingId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    BookingIdParam:
      name: bookingId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    SlotIdParam:
      name: slotId
      in: path
      required: true
      schema:
        type: string
        format: uuid

    FromDateParam:
      name: from
      in: query
      required: true
      schema:
        type: string
        format: date

    ToDateParam:
      name: to
      in: query
      required: true
      schema:
        type: string
        format: date

    DailyDateParam:
      name: date
      in: query
      required: true
      schema:
        type: string
        format: date

    StatusParam:
      name: status
      in: query
      required: false
      schema:
        type: string

    CursorParam:
      name: cursor
      in: query
      required: false
      schema:
        type: string

    LimitParam:
      name: limit
      in: query
      required: false
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 20

    IdempotencyKeyHeader:
      name: Idempotency-Key
      in: header
      required: true
      schema:
        type: string
        minLength: 1
        maxLength: 100

  schemas:
    ErrorResponse:
      type: object
      required: [success, error_code, message]
      properties:
        success:
          type: boolean
          example: false
        error_code:
          type: string
          example: SLOT_ALREADY_BOOKED
        message:
          type: string
          example: 이미 예약된 시간입니다.

    Tokens:
      type: object
      required: [access_token, token_type]
      properties:
        access_token:
          type: string
        token_type:
          type: string
          example: bearer

    User:
      type: object
      required: [id, email, name, provider, is_active, created_at, updated_at]
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        name:
          type: string
        provider:
          type: string
          enum: [LOCAL, GOOGLE]
        is_active:
          type: boolean
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time

    AuthResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
          example: true
        data:
          type: object
          required: [user, tokens]
          properties:
            user:
              $ref: '#/components/schemas/User'
            tokens:
              $ref: '#/components/schemas/Tokens'

    SignupRequest:
      type: object
      required: [email, password, name]
      properties:
        email:
          type: string
          format: email
        password:
          type: string
          minLength: 8
        name:
          type: string
          minLength: 1
          maxLength: 100

    LoginRequest:
      type: object
      required: [email, password]
      properties:
        email:
          type: string
          format: email
        password:
          type: string

    # Refresh Token은 request body가 아니라 HttpOnly Secure Cookie로 전달됨
    AccessTokenResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
          example: true
        data:
          type: object
          required: [tokens]
          properties:
            tokens:
              $ref: '#/components/schemas/Tokens'

    HostSetting:
      type: object
      required:
        - id
        - host_id
        - slug
        - title
        - host_timezone
        - slot_duration_mins
        - buffer_duration_mins
        - approval_type
        - booking_open_days_ahead
        - booking_close_minutes_before
        - cancel_deadline_minutes_before
        - max_active_bookings_per_user
        - is_active
        - is_listed
        - created_at
        - updated_at
      properties:
        id:
          type: string
          format: uuid
        host_id:
          type: string
          format: uuid
        slug:
          type: string
          example: career-consulting-30min
        title:
          type: string
          example: 1:1 진로 상담
        description:
          type: string
          nullable: true
        host_timezone:
          type: string
          example: Asia/Seoul
        slot_duration_mins:
          type: integer
          example: 30
        buffer_duration_mins:
          type: integer
          example: 10
        approval_type:
          type: string
          enum: [AUTO, MANUAL]
        booking_open_days_ahead:
          type: integer
          example: 30
        booking_close_minutes_before:
          type: integer
          example: 120
        cancel_deadline_minutes_before:
          type: integer
          example: 1440
        max_active_bookings_per_user:
          type: integer
          example: 3
        is_active:
          type: boolean
        is_listed:
          type: boolean
          description: 마켓플레이스·랜딩 검색 노출 여부
        listing_category:
          type: string
          maxLength: 50
          nullable: true
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time

    MarketplaceBookingPageItem:
      type: object
      required: [slug, title]
      properties:
        slug:
          type: string
        title:
          type: string
        description:
          type: string
          nullable: true
        listing_category:
          type: string
          nullable: true

    MarketplaceBookingPagesResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
          example: true
        data:
          type: object
          required: [items]
          properties:
            items:
              type: array
              items:
                $ref: '#/components/schemas/MarketplaceBookingPageItem'
            next_cursor:
              type: string
              nullable: true

    HostSettingCreateRequest:
      type: object
      required:
        - slug
        - title
        - host_timezone
        - slot_duration_mins
        - approval_type
      properties:
        slug:
          type: string
          pattern: '^[a-z0-9-]+$'
        title:
          type: string
          minLength: 1
          maxLength: 150
        description:
          type: string
          nullable: true
        host_timezone:
          type: string
          example: Asia/Seoul
        slot_duration_mins:
          type: integer
          minimum: 1
        buffer_duration_mins:
          type: integer
          minimum: 0
          default: 0
        approval_type:
          type: string
          enum: [AUTO, MANUAL]
        booking_open_days_ahead:
          type: integer
          minimum: 0
          default: 30
        booking_close_minutes_before:
          type: integer
          minimum: 0
          default: 120
        cancel_deadline_minutes_before:
          type: integer
          minimum: 0
          default: 1440
        max_active_bookings_per_user:
          type: integer
          minimum: 1
          default: 3
        is_listed:
          type: boolean
          default: true
        listing_category:
          type: string
          maxLength: 50
          nullable: true

    HostSettingUpdateRequest:
      type: object
      properties:
        slug:
          type: string
          pattern: '^[a-z0-9-]+$'
        title:
          type: string
          minLength: 1
          maxLength: 150
        description:
          type: string
          nullable: true
        host_timezone:
          type: string
        slot_duration_mins:
          type: integer
          minimum: 1
        buffer_duration_mins:
          type: integer
          minimum: 0
        approval_type:
          type: string
          enum: [AUTO, MANUAL]
        booking_open_days_ahead:
          type: integer
          minimum: 0
        booking_close_minutes_before:
          type: integer
          minimum: 0
        cancel_deadline_minutes_before:
          type: integer
          minimum: 0
        max_active_bookings_per_user:
          type: integer
          minimum: 1
        is_active:
          type: boolean
        is_listed:
          type: boolean
        listing_category:
          type: string
          maxLength: 50
          nullable: true

    Slot:
      type: object
      required: [id, host_setting_id, start_time, end_time, status]
      properties:
        id:
          type: string
          format: uuid
        host_setting_id:
          type: string
          format: uuid
        start_time:
          type: string
          format: date-time
        end_time:
          type: string
          format: date-time
        status:
          type: string
          enum: [OPEN, BOOKED, BLOCKED]

    SlotListResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          type: object
          required: [items]
          properties:
            items:
              type: array
              items:
                $ref: '#/components/schemas/Slot'

    PublicSlotsDayGroup:
      type: object
      required: [date, slots]
      properties:
        date:
          type: string
          format: date
        slots:
          type: array
          items:
            $ref: '#/components/schemas/Slot'

    PublicSlotsCalendarResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          type: object
          required: [days]
          properties:
            days:
              type: array
              items:
                $ref: '#/components/schemas/PublicSlotsDayGroup'

    MyBookingDetailResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          type: object
          required: [booking, can_cancel]
          properties:
            booking:
              $ref: '#/components/schemas/Booking'
            can_cancel:
              type: boolean

    HoldResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          type: object
          required: [slot_id, hold_token, expires_at, remaining_seconds]
          properties:
            slot_id:
              type: string
              format: uuid
            hold_token:
              type: string
            expires_at:
              type: string
              format: date-time
            remaining_seconds:
              type: integer

    Booking:
      type: object
      required:
        - id
        - slot_id
        - booker_id
        - status
        - idempotency_key
        - created_at
        - updated_at
      properties:
        id:
          type: string
          format: uuid
        slot_id:
          type: string
          format: uuid
        booker_id:
          type: string
          format: uuid
        status:
          type: string
          enum: [PENDING, CONFIRMED, REJECTED, CANCELLED, NO_SHOW, COMPLETED]
        idempotency_key:
          type: string
        request_message:
          type: string
          nullable: true
        status_reason:
          type: string
          nullable: true
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time
        confirmed_at:
          type: string
          format: date-time
          nullable: true
        cancelled_at:
          type: string
          format: date-time
          nullable: true
        rejected_at:
          type: string
          format: date-time
          nullable: true
        completed_at:
          type: string
          format: date-time
          nullable: true

    BookingCreateRequest:
      type: object
      required: [slot_id, hold_token]
      properties:
        slot_id:
          type: string
          format: uuid
        hold_token:
          type: string
        request_message:
          type: string
          nullable: true

    BookingActionResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          type: object
          required: [booking]
          properties:
            booking:
              $ref: '#/components/schemas/Booking'
            slot_status:
              type: string
              enum: [OPEN, BOOKED, BLOCKED]
            message:
              type: string

    BookingListResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          type: object
          required: [items]
          properties:
            items:
              type: array
              items:
                $ref: '#/components/schemas/Booking'
            next_cursor:
              type: string
              nullable: true

    CancelBookingRequest:
      type: object
      properties:
        reason:
          type: string
          nullable: true
          maxLength: 255

    ScheduleRule:
      type: object
      required:
        - id
        - host_setting_id
        - day_of_week
        - start_time
        - end_time
        - rule_type
        - created_at
        - updated_at
      properties:
        id:
          type: string
          format: uuid
        host_setting_id:
          type: string
          format: uuid
        day_of_week:
          type: integer
          minimum: 0
          maximum: 6
        start_time:
          type: string
          format: time
        end_time:
          type: string
          format: time
        rule_type:
          type: string
          enum: [OPEN, BREAK]
        effective_start_date:
          type: string
          format: date
          nullable: true
        effective_end_date:
          type: string
          format: date
          nullable: true
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time

    ScheduleRuleCreateRequest:
      type: object
      required: [day_of_week, start_time, end_time, rule_type]
      properties:
        day_of_week:
          type: integer
          minimum: 0
          maximum: 6
        start_time:
          type: string
          format: time
        end_time:
          type: string
          format: time
        rule_type:
          type: string
          enum: [OPEN, BREAK]
        effective_start_date:
          type: string
          format: date
          nullable: true
        effective_end_date:
          type: string
          format: date
          nullable: true

    ScheduleOverride:
      type: object
      required:
        - id
        - host_setting_id
        - override_date
        - override_type
        - created_at
        - updated_at
      properties:
        id:
          type: string
          format: uuid
        host_setting_id:
          type: string
          format: uuid
        override_date:
          type: string
          format: date
        start_time:
          type: string
          format: time
          nullable: true
        end_time:
          type: string
          format: time
          nullable: true
        override_type:
          type: string
          enum: [DAY_OFF, OPEN, BLOCK]
        reason:
          type: string
          nullable: true
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time

    ScheduleOverrideCreateRequest:
      type: object
      required: [override_date, override_type]
      properties:
        override_date:
          type: string
          format: date
        start_time:
          type: string
          format: time
          nullable: true
        end_time:
          type: string
          format: time
          nullable: true
        override_type:
          type: string
          enum: [DAY_OFF, OPEN, BLOCK]
        reason:
          type: string
          nullable: true

    GenerateSlotsRequest:
      type: object
      required: [from_date, to_date]
      properties:
        from_date:
          type: string
          format: date
        to_date:
          type: string
          format: date

    GenerateSlotsResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          type: object
          required: [generated_count, skipped_count, from_date, to_date]
          properties:
            generated_count:
              type: integer
            skipped_count:
              type: integer
            from_date:
              type: string
              format: date
            to_date:
              type: string
              format: date

    RejectBookingRequest:
      type: object
      required: [reason]
      properties:
        reason:
          type: string
          minLength: 1
          maxLength: 255

    AnalyticsSummaryResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          type: object
          required: [daily_count, weekly_count, approval_rate, popular_slots]
          properties:
            daily_count:
              type: integer
            weekly_count:
              type: integer
            approval_rate:
              type: number
              format: float
            popular_slots:
              type: array
              items:
                type: object
                required: [hour, count]
                properties:
                  hour:
                    type: integer
                  count:
                    type: integer

    PopularSlotsResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          type: object
          required: [items]
          properties:
            items:
              type: array
              items:
                type: object
                required: [hour, count]
                properties:
                  hour:
                    type: integer
                  count:
                    type: integer

    NotificationBootstrapResponse:
      type: object
      required: [success, data]
      properties:
        success:
          type: boolean
        data:
          type: object
          properties:
            unread_count:
              type: integer
            last_events:
              type: array
              items:
                type: object
                additionalProperties: true

paths:
  /auth/signup:
    post:
      tags: [auth]
      summary: Email signup
      operationId: signup
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SignupRequest'
      responses:
        '201':
          description: Signup success
          headers:
            Set-Cookie:
              description: "refresh_token cookie"
              schema:
                type: string
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
        '409':
          description: Email already exists
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /auth/login:
    post:
      tags: [auth]
      summary: Email login
      operationId: login
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LoginRequest'
      responses:
        '200':
          description: Login success
          headers:
            Set-Cookie:
              description: "refresh_token cookie"
              schema:
                type: string
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
        '401':
          description: Invalid credentials
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'


  /auth/google:
    get:
      tags: [auth]
      summary: Start Google OAuth login
      operationId: startGoogleOAuth
      responses:
        '302':
          description: Redirect to Google authorization page

  /auth/google/callback:
    get:
      tags: [auth]
      summary: Google OAuth callback
      operationId: googleOAuthCallback
      parameters:
        - name: code
          in: query
          required: false
          schema:
            type: string
        - name: state
          in: query
          required: false
          schema:
            type: string
        - name: error
          in: query
          required: false
          schema:
            type: string
        - name: response_mode
          in: query
          required: false
          schema:
            type: string
            enum: [json]
          description: "json이면 AuthResponse JSON + Set-Cookie; 생략 시 FRONTEND_OAUTH_SUCCESS_URL로 302"
      responses:
        '200':
          description: OAuth login success (response_mode=json)
          headers:
            Set-Cookie:
              description: "refresh_token cookie"
              schema:
                type: string
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
        '302':
          description: Redirect to frontend after Set-Cookie
        '400':
          description: Invalid authorization code or state
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '401':
          description: OAuth login failed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '500':
          description: OAuth provider not configured
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /auth/refresh:
    post:
      tags: [auth]
      summary: Refresh access token
      description: "HttpOnly Secure Cookie에 저장된 refresh_token을 사용하며 request body는 없다. Origin/Referer 검증 또는 CSRF 방어를 함께 적용한다."
      operationId: refreshToken
      responses:
        '200':
          description: Refresh success
          headers:
            Set-Cookie:
              description: "rotated refresh_token cookie"
              schema:
                type: string
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AccessTokenResponse'
        '401':
          description: Invalid refresh token
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /users/me:
    get:
      tags: [users]
      summary: Get current user
      operationId: getMe
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Current user
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                  data:
                    $ref: '#/components/schemas/User'
        '401':
          description: Unauthorized
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /public/marketplace/booking-pages:
    get:
      tags: [public-booking-pages]
      summary: List marketplace booking pages
      description: >
        Returns rows where is_active and is_listed are true.
        Optional query category `__uncategorized__` filters listing_category IS NULL.
      operationId: listMarketplaceBookingPages
      parameters:
        - name: q
          in: query
          schema:
            type: string
          description: Partial match on title and description (ILIKE)
        - name: category
          in: query
          schema:
            type: string
          description: Exact listing_category, or `__uncategorized__` for uncategorized
        - name: limit
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 24
        - name: cursor
          in: query
          schema:
            type: string
          description: Opaque cursor from previous response next_cursor
      responses:
        '200':
          description: Marketplace list
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MarketplaceBookingPagesResponse'
        '400':
          description: Invalid cursor
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /public/booking-pages/{slug}:
    get:
      tags: [public-booking-pages]
      summary: Get public booking page
      operationId: getPublicBookingPage
      parameters:
        - $ref: '#/components/parameters/SlugParam'
      responses:
        '200':
          description: Booking page info
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                  data:
                    $ref: '#/components/schemas/HostSetting'
        '404':
          description: Booking page not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /public/booking-pages/{slug}/slots:
    get:
      tags: [public-booking-pages]
      summary: Get slots in date range
      operationId: getPublicSlots
      parameters:
        - $ref: '#/components/parameters/SlugParam'
        - $ref: '#/components/parameters/FromDateParam'
        - $ref: '#/components/parameters/ToDateParam'
      responses:
        '200':
          description: Slots grouped by local calendar date (host timezone)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PublicSlotsCalendarResponse'
        '400':
          description: Invalid date range
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'


  /public/booking-pages/{slug}/slots/daily:
    get:
      tags: [public-booking-pages]
      summary: Get slots for a specific date
      operationId: getPublicDailySlots
      parameters:
        - $ref: '#/components/parameters/SlugParam'
        - $ref: '#/components/parameters/DailyDateParam'
      responses:
        '200':
          description: Daily slot list
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SlotListResponse'
        '400':
          description: Invalid date
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /slots/{slotId}/hold:
    post:
      tags: [holds]
      summary: Create temporary hold for a slot
      operationId: createSlotHold
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/SlotIdParam'
      responses:
        '200':
          description: Hold created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HoldResponse'
        '409':
          description: Slot already held or not open
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
    get:
      tags: [holds]
      summary: Get hold status for a slot
      operationId: getSlotHold
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/SlotIdParam'
      responses:
        '200':
          description: Hold status
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HoldResponse'

  /bookings:
    post:
      tags: [bookings]
      summary: Create booking request or confirm booking
      operationId: createBooking
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/IdempotencyKeyHeader'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/BookingCreateRequest'
      responses:
        '201':
          description: Booking created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BookingActionResponse'
        '409':
          description: Hold expired, duplicate request, or slot already booked
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '422':
          description: Policy violation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /me/bookings:
    get:
      tags: [bookings]
      summary: Get my bookings
      operationId: getMyBookings
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/StatusParam'
        - $ref: '#/components/parameters/CursorParam'
        - $ref: '#/components/parameters/LimitParam'
      responses:
        '200':
          description: My booking list
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BookingListResponse'

  /me/bookings/{bookingId}:
    get:
      tags: [bookings]
      summary: Get my booking detail
      operationId: getMyBookingDetail
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/BookingIdParam'
      responses:
        '200':
          description: Booking detail with cancellation eligibility
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MyBookingDetailResponse'
        '403':
          description: Forbidden
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /me/bookings/{bookingId}/cancel:
    post:
      tags: [bookings]
      summary: Cancel my booking
      operationId: cancelMyBooking
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/BookingIdParam'
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CancelBookingRequest'
      responses:
        '200':
          description: Booking cancelled
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BookingActionResponse'
        '409':
          description: Cancellation deadline passed or invalid status
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /host/booking-pages:
    get:
      tags: [host-booking-pages]
      summary: Get host booking pages
      operationId: getHostBookingPages
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Host booking page list
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                  data:
                    type: object
                    required: [items]
                    properties:
                      items:
                        type: array
                        items:
                          $ref: '#/components/schemas/HostSetting'
    post:
      tags: [host-booking-pages]
      summary: Create a booking page
      operationId: createHostBookingPage
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/HostSettingCreateRequest'
      responses:
        '201':
          description: Booking page created
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                  data:
                    $ref: '#/components/schemas/HostSetting'
        '403':
          description: Host role required
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
        '409':
          description: Slug already exists
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /host/booking-pages/{hostSettingId}:
    get:
      tags: [host-booking-pages]
      summary: Get booking page detail
      operationId: getHostBookingPageDetail
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/HostSettingIdParam'
      responses:
        '200':
          description: Booking page detail
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                  data:
                    $ref: '#/components/schemas/HostSetting'
    patch:
      tags: [host-booking-pages]
      summary: Update booking page
      operationId: updateHostBookingPage
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/HostSettingIdParam'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/HostSettingUpdateRequest'
      responses:
        '200':
          description: Booking page updated
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                  data:
                    $ref: '#/components/schemas/HostSetting'

  /host/booking-pages/{hostSettingId}/toggle-listed:
    post:
      tags: [host-booking-pages]
      summary: Toggle marketplace listing (is_listed)
      operationId: toggleHostBookingPageListed
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/HostSettingIdParam'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [is_listed]
              properties:
                is_listed:
                  type: boolean
      responses:
        '200':
          description: Updated booking page
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                  data:
                    $ref: '#/components/schemas/HostSetting'

  /host/booking-pages/{hostSettingId}/rules:
    get:
      tags: [host-rules]
      summary: Get schedule rules
      operationId: getScheduleRules
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/HostSettingIdParam'
      responses:
        '200':
          description: Schedule rule list
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                  data:
                    type: object
                    required: [items]
                    properties:
                      items:
                        type: array
                        items:
                          $ref: '#/components/schemas/ScheduleRule'
    post:
      tags: [host-rules]
      summary: Create schedule rule
      operationId: createScheduleRule
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/HostSettingIdParam'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ScheduleRuleCreateRequest'
      responses:
        '201':
          description: Schedule rule created
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                  data:
                    $ref: '#/components/schemas/ScheduleRule'

  /host/booking-pages/{hostSettingId}/overrides:
    get:
      tags: [host-overrides]
      summary: Get schedule overrides
      operationId: getScheduleOverrides
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/HostSettingIdParam'
        - $ref: '#/components/parameters/FromDateParam'
        - $ref: '#/components/parameters/ToDateParam'
      responses:
        '200':
          description: Schedule override list
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                  data:
                    type: object
                    required: [items]
                    properties:
                      items:
                        type: array
                        items:
                          $ref: '#/components/schemas/ScheduleOverride'
    post:
      tags: [host-overrides]
      summary: Create schedule override
      operationId: createScheduleOverride
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/HostSettingIdParam'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ScheduleOverrideCreateRequest'
      responses:
        '201':
          description: Schedule override created
          content:
            application/json:
              schema:
                type: object
                required: [success, data]
                properties:
                  success:
                    type: boolean
                  data:
                    $ref: '#/components/schemas/ScheduleOverride'

  /host/booking-pages/{hostSettingId}/slots/generate:
    post:
      tags: [host-slots]
      summary: Generate slots in bulk
      operationId: generateSlots
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/HostSettingIdParam'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenerateSlotsRequest'
      responses:
        '200':
          description: Slots generated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GenerateSlotsResponse'

  /host/booking-pages/{hostSettingId}/slots:
    get:
      tags: [host-slots]
      summary: Get host slots
      operationId: getHostSlots
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/HostSettingIdParam'
        - $ref: '#/components/parameters/FromDateParam'
        - $ref: '#/components/parameters/ToDateParam'
        - $ref: '#/components/parameters/StatusParam'
      responses:
        '200':
          description: Host slot list
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SlotListResponse'


  /host/slots/{slotId}/block:
    post:
      tags: [host-slots]
      summary: Block a slot manually
      operationId: blockSlot
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/SlotIdParam'
      responses:
        '200':
          description: Slot blocked
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BookingActionResponse'
        '409':
          description: Slot already booked
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /host/slots/{slotId}/unblock:
    post:
      tags: [host-slots]
      summary: Unblock a slot
      operationId: unblockSlot
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/SlotIdParam'
      responses:
        '200':
          description: Slot unblocked
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BookingActionResponse'
        '409':
          description: Slot not blocked
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /host/bookings:
    get:
      tags: [host-bookings]
      summary: Get host booking requests
      operationId: getHostBookings
      security:
        - bearerAuth: []
      parameters:
        - name: hostSettingId
          in: query
          required: false
          schema:
            type: string
            format: uuid
        - $ref: '#/components/parameters/StatusParam'
        - $ref: '#/components/parameters/CursorParam'
        - $ref: '#/components/parameters/LimitParam'
      responses:
        '200':
          description: Host booking list
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BookingListResponse'

  /host/bookings/{bookingId}:
    get:
      tags: [host-bookings]
      summary: Get host booking detail
      operationId: getHostBookingDetail
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/BookingIdParam'
      responses:
        '200':
          description: Host booking detail
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BookingActionResponse'

  /host/bookings/{bookingId}/approve:
    post:
      tags: [host-bookings]
      summary: Approve booking request
      operationId: approveBooking
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/BookingIdParam'
      responses:
        '200':
          description: Booking approved
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BookingActionResponse'
        '409':
          description: Invalid booking state
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /host/bookings/{bookingId}/reject:
    post:
      tags: [host-bookings]
      summary: Reject booking request
      operationId: rejectBooking
      security:
        - bearerAuth: []
      parameters:
        - $ref: '#/components/parameters/BookingIdParam'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RejectBookingRequest'
      responses:
        '200':
          description: Booking rejected
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BookingActionResponse'
        '409':
          description: Invalid booking state
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /host/analytics/summary:
    get:
      tags: [host-analytics]
      summary: Get analytics summary
      operationId: getAnalyticsSummary
      security:
        - bearerAuth: []
      parameters:
        - name: hostSettingId
          in: query
          required: true
          schema:
            type: string
            format: uuid
        - $ref: '#/components/parameters/FromDateParam'
        - $ref: '#/components/parameters/ToDateParam'
      responses:
        '200':
          description: Analytics summary
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AnalyticsSummaryResponse'
        '422':
          description: Invalid date range
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'



  /host/analytics/popular-slots:
    get:
      tags: [host-analytics]
      summary: Get popular slot chart data
      operationId: getPopularSlots
      security:
        - bearerAuth: []
      parameters:
        - name: hostSettingId
          in: query
          required: true
          schema:
            type: string
            format: uuid
        - $ref: '#/components/parameters/FromDateParam'
        - $ref: '#/components/parameters/ToDateParam'
      responses:
        '200':
          description: Popular slot chart data
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PopularSlotsResponse'

  /notifications/bootstrap:
    get:
      tags: [users]
      summary: Get initial notification sync state
      operationId: getNotificationBootstrap
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Notification bootstrap data
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/NotificationBootstrapResponse'

x-websocket:
  endpoint: /api/v1/ws
  description: "WebSocket 인증은 query token 대신 `Sec-WebSocket-Protocol: bearer, <access_token>` 또는 짧은 수명의 WS 전용 티켓을 사용한다."