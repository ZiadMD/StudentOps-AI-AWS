"""
Attendance Provider Abstraction and Implementations (Google Meet & Mock).
"""
from abc import ABC, abstractmethod
from typing import Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel


class RawParticipantSession(BaseModel):
    display_name: str
    email: Optional[str] = None
    join_time: datetime
    leave_time: datetime
    duration_seconds: int


class RawMeetingAttendance(BaseModel):
    meeting_code: str
    title: str
    start_time: datetime
    end_time: datetime
    sessions: list[RawParticipantSession]


class AttendanceProvider(ABC):
    """Abstract interface for retrieving raw meeting attendance from source systems."""

    @abstractmethod
    async def get_raw_meeting_attendance(self, meeting_code: str) -> Optional[RawMeetingAttendance]:
        """Fetch raw participant sessions for a meeting."""
        pass


class GoogleMeetAttendanceProvider(AttendanceProvider):
    """Google Meet API Conference Records Provider."""

    def __init__(self, credentials_path: Optional[str] = None):
        self.credentials_path = credentials_path

    async def get_raw_meeting_attendance(self, meeting_code: str) -> Optional[RawMeetingAttendance]:
        # If Google credentials are not configured, fallback gracefully or raise structured error
        try:
            # Google Meet REST API v2 conferenceRecords client can be invoked here
            pass
        except Exception as e:
            return None
        return None


class MockAttendanceProvider(AttendanceProvider):
    """Mock Provider that simulates realistic Google Meet session data for demos & testing."""

    def __init__(self):
        self._mock_data: dict[str, RawMeetingAttendance] = {}
        self._initialize_mock_sessions()

    def _initialize_mock_sessions(self):
        now = datetime.now(timezone.utc)
        today_sync_start = now.replace(hour=18, minute=0, second=0, microsecond=0)
        today_sync_end = now.replace(hour=19, minute=0, second=0, microsecond=0)

        # Meeting 1: Today's Sync
        self._mock_data["today_sync"] = RawMeetingAttendance(
            meeting_code="today_sync",
            title="Weekly Operations & Camp Sync",
            start_time=today_sync_start,
            end_time=today_sync_end,
            sessions=[
                # Maurine: Joined on time (18:02), left at 18:59 -> 57 mins (PRESENT)
                RawParticipantSession(
                    display_name="Maurine Magdy",
                    email="maurine.magdy@studentops.org",
                    join_time=today_sync_start + timedelta(minutes=2),
                    leave_time=today_sync_end - timedelta(minutes=1),
                    duration_seconds=57 * 60
                ),
                # Alaa: Joined on time (18:05), left at 19:00 -> 55 mins (PRESENT)
                RawParticipantSession(
                    display_name="Alaa Mohamed",
                    email="alaa.mohamed@studentops.org",
                    join_time=today_sync_start + timedelta(minutes=5),
                    leave_time=today_sync_end,
                    duration_seconds=55 * 60
                ),
                # Note: Hanan Ahmed did not join -> ABSENT
            ]
        )

        # Meeting 2: Camp Day 1 (from 8.xlsx 20/08)
        camp_start = datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc)
        camp_end = datetime(2026, 8, 20, 12, 0, 0, tzinfo=timezone.utc)
        self._mock_data["camp_day_1"] = RawMeetingAttendance(
            meeting_code="camp_day_1",
            title="Camp Day 1 - Orientation",
            start_time=camp_start,
            end_time=camp_end,
            sessions=[
                RawParticipantSession(
                    display_name="مورين مجدي",
                    email="maurine.magdy@studentops.org",
                    join_time=camp_start + timedelta(minutes=1),
                    leave_time=camp_end,
                    duration_seconds=119 * 60
                ),
                RawParticipantSession(
                    display_name="Alaa Mohamed",
                    email="alaa.mohamed@studentops.org",
                    join_time=camp_start + timedelta(minutes=3),
                    leave_time=camp_end,
                    duration_seconds=117 * 60
                ),
                RawParticipantSession(
                    display_name="Hanan Ahmed",
                    email="hanan.ahmed@studentops.org",
                    join_time=camp_start + timedelta(minutes=4),
                    leave_time=camp_end,
                    duration_seconds=116 * 60
                )
            ]
        )

    async def get_raw_meeting_attendance(self, meeting_code: str) -> Optional[RawMeetingAttendance]:
        return self._mock_data.get(meeting_code)
