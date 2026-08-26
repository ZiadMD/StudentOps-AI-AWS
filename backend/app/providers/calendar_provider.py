"""
Calendar Provider Abstraction and Implementations (Google Calendar & Mock).
"""
from abc import ABC, abstractmethod
from typing import Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel


class CalendarEventItem(BaseModel):
    id: str
    title: str
    description: Optional[str] = ""
    start_time: datetime
    end_time: datetime
    location: str = "Google Meet"
    meet_url: Optional[str] = ""
    is_mandatory: bool = True


class CalendarProvider(ABC):
    """Abstract interface for interacting with Calendar services."""

    @abstractmethod
    async def get_upcoming_events(self, limit: int = 10) -> list[CalendarEventItem]:
        """Retrieve upcoming calendar events."""
        pass

    @abstractmethod
    async def create_event(self, event: CalendarEventItem) -> CalendarEventItem:
        """Create a new calendar event."""
        pass


class GoogleCalendarProvider(CalendarProvider):
    """Google Calendar API v3 provider."""

    def __init__(self, credentials_path: Optional[str] = None):
        self.credentials_path = credentials_path

    async def get_upcoming_events(self, limit: int = 10) -> list[CalendarEventItem]:
        return []

    async def create_event(self, event: CalendarEventItem) -> CalendarEventItem:
        return event


class MockCalendarProvider(CalendarProvider):
    """Mock Calendar Provider for seamless offline demos and automated testing."""

    def __init__(self):
        self._events: list[CalendarEventItem] = []
        self._initialize_mock_events()

    def _initialize_mock_events(self):
        now = datetime.now(timezone.utc)
        
        # Event 1: Today's Sync
        self._events.append(
            CalendarEventItem(
                id="ev_today_sync",
                title="Weekly Operations & Camp Sync",
                description="Review week 3 attendance and upcoming Camp milestones.",
                start_time=now.replace(hour=18, minute=0, second=0, microsecond=0),
                end_time=now.replace(hour=19, minute=0, second=0, microsecond=0),
                location="Google Meet",
                meet_url="https://meet.google.com/ops-sync-demo",
                is_mandatory=True
            )
        )

        # Event 2: Next Meeting (e.g. 2 days from now)
        next_meeting_time = now + timedelta(days=2)
        self._events.append(
            CalendarEventItem(
                id="ev_camp_followup",
                title="Camp Logistics & Sub-team Follow-up",
                description="Final review before project submission.",
                start_time=next_meeting_time.replace(hour=17, minute=30, second=0, microsecond=0),
                end_time=next_meeting_time.replace(hour=19, minute=0, second=0, microsecond=0),
                location="Google Meet",
                meet_url="https://meet.google.com/logistics-followup",
                is_mandatory=True
            )
        )

        # Event 3: Task 4 Deadline
        deadline_time = now + timedelta(days=3)
        self._events.append(
            CalendarEventItem(
                id="ev_task4_deadline",
                title="Task 4 Final Submission Deadline",
                description="Submit sprint documentation and deliverables.",
                start_time=deadline_time.replace(hour=23, minute=59, second=0, microsecond=0),
                end_time=deadline_time.replace(hour=23, minute=59, second=0, microsecond=0),
                location="Platform Portal",
                meet_url="",
                is_mandatory=True
            )
        )

    async def get_upcoming_events(self, limit: int = 10) -> list[CalendarEventItem]:
        now = datetime.now(timezone.utc)
        upcoming = [e for e in self._events if e.start_time >= now - timedelta(hours=2)]
        upcoming.sort(key=lambda x: x.start_time)
        return upcoming[:limit]

    async def create_event(self, event: CalendarEventItem) -> CalendarEventItem:
        self._events.append(event)
        return event
