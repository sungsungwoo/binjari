"""DB·API에서 쓰는 상태/타입 값 — DDL·api_usecase와 동일 문자열."""

from enum import StrEnum


class AuthProvider(StrEnum):
    LOCAL = "LOCAL"
    GOOGLE = "GOOGLE"


class RoleName(StrEnum):
    HOST = "HOST"
    ADMIN = "ADMIN"


class ApprovalType(StrEnum):
    AUTO = "AUTO"
    MANUAL = "MANUAL"


class ScheduleRuleType(StrEnum):
    OPEN = "OPEN"
    BREAK = "BREAK"


class ScheduleOverrideType(StrEnum):
    DAY_OFF = "DAY_OFF"
    OPEN = "OPEN"
    BLOCK = "BLOCK"


class SlotStatus(StrEnum):
    OPEN = "OPEN"
    BOOKED = "BOOKED"
    BLOCKED = "BLOCKED"


class BookingStatus(StrEnum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    NO_SHOW = "NO_SHOW"
    COMPLETED = "COMPLETED"
