"""DB 테이블 모델 — docs/DDL.md 기준.

Alembic autogenerate 후 수동 보강 권장:
  - CREATE UNIQUE INDEX uq_active_booking_per_slot ... WHERE status IN (...)
  - CREATE EXTENSION IF NOT EXISTS pgcrypto;
  - roles 시드 INSERT (HOST, ADMIN 등)

모델은 FK 의존 순서대로 import 되도록 하위 모듈을 로드한다.
"""

from app.models.booking import Booking
from app.models.host_setting import HostSetting
from app.models.schedule import ScheduleOverride, ScheduleRule
from app.models.slot import Slot
from app.models.user import Role, User, UserRole

__all__ = [
    "User",
    "Role",
    "UserRole",
    "HostSetting",
    "ScheduleRule",
    "ScheduleOverride",
    "Slot",
    "Booking",
]
