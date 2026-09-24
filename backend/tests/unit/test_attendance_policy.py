"""
Unit tests for Deterministic Attendance Policy Engine.
"""
from datetime import datetime, timezone, timedelta
from app.services.attendance_service import AttendancePolicyEngine


def test_present_policy_on_time():
    meeting_start = datetime(2026, 8, 26, 18, 0, tzinfo=timezone.utc)
    first_join = datetime(2026, 8, 26, 18, 3, tzinfo=timezone.utc)  # 3 mins delay
    total_duration = 55.0  # out of 60 mins (91.6%)

    status = AttendancePolicyEngine.evaluate_status(
        meeting_start=meeting_start,
        meeting_duration_minutes=60,
        first_join=first_join,
        total_duration_minutes=total_duration
    )
    assert status == "PRESENT"


def test_late_policy_after_threshold():
    meeting_start = datetime(2026, 8, 26, 18, 0, tzinfo=timezone.utc)
    first_join = datetime(2026, 8, 26, 18, 15, tzinfo=timezone.utc)  # 15 mins delay (>10)
    total_duration = 40.0  # out of 60 mins (66.6%)

    status = AttendancePolicyEngine.evaluate_status(
        meeting_start=meeting_start,
        meeting_duration_minutes=60,
        first_join=first_join,
        total_duration_minutes=total_duration
    )
    assert status == "LATE"


def test_unexcused_absent_no_join():
    meeting_start = datetime(2026, 8, 26, 18, 0, tzinfo=timezone.utc)
    status = AttendancePolicyEngine.evaluate_status(
        meeting_start=meeting_start,
        meeting_duration_minutes=60,
        first_join=None,
        total_duration_minutes=0.0
    )
    assert status == "UNEXCUSED_ABSENT"


def test_excused_status_override():
    meeting_start = datetime(2026, 8, 26, 18, 0, tzinfo=timezone.utc)
    status = AttendancePolicyEngine.evaluate_status(
        meeting_start=meeting_start,
        meeting_duration_minutes=60,
        first_join=None,
        total_duration_minutes=0.0,
        excuse_status="EXCUSED_ACCEPTED"
    )
    assert status == "EXCUSED_ACCEPTED"
