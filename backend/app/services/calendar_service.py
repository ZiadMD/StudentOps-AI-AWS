"""
Calendar and Event Management Service.
"""
from typing import Optional
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.entities import Event
from app.models.schemas import EventSchema, EventCreate
from app.providers.calendar_provider import CalendarProvider, CalendarEventItem


class CalendarService:
    """Provides calendar event lookup, synchronization, and event creation."""

    def __init__(self, provider: CalendarProvider):
        self.provider = provider

    async def get_upcoming_events(self, db: AsyncSession, limit: int = 10) -> list[EventSchema]:
        """Fetch upcoming events from database and sync with provider."""
        now = datetime.now(timezone.utc)
        res = await db.execute(
            select(Event)
            .where(Event.start_time >= now - timedelta(hours=2))
            .order_by(Event.start_time.asc())
            .limit(limit)
        )
        events = res.scalars().all()
        return [
            EventSchema(
                id=e.id,
                title=e.title,
                description=e.description,
                event_type=e.event_type,
                start_time=e.start_time,
                end_time=e.end_time,
                location=e.location,
                meet_url=e.meet_url,
                is_mandatory=e.is_mandatory
            )
            for e in events
        ]

    async def get_next_meeting(self, db: AsyncSession) -> Optional[EventSchema]:
        """Returns the immediate next meeting on the schedule."""
        events = await self.get_upcoming_events(db, limit=5)
        meetings = [e for e in events if e.event_type in ("MEETING", "CAMP", "WORKSHOP")]
        return meetings[0] if meetings else None

    async def create_event(self, event_in: EventCreate, db: AsyncSession) -> EventSchema:
        event_id = f"ev_{int(datetime.now().timestamp())}"
        new_event = Event(
            id=event_id,
            title=event_in.title,
            description=event_in.description or "",
            event_type=event_in.event_type,
            start_time=event_in.start_time,
            end_time=event_in.end_time,
            location=event_in.location,
            meet_url=event_in.meet_url or "",
            is_mandatory=event_in.is_mandatory
        )
        db.add(new_event)
        await db.commit()
        await db.refresh(new_event)

        # Notify provider
        await self.provider.create_event(CalendarEventItem(
            id=new_event.id,
            title=new_event.title,
            description=new_event.description,
            start_time=new_event.start_time,
            end_time=new_event.end_time,
            location=new_event.location,
            meet_url=new_event.meet_url,
            is_mandatory=new_event.is_mandatory
        ))

        return EventSchema(
            id=new_event.id,
            title=new_event.title,
            description=new_event.description,
            event_type=new_event.event_type,
            start_time=new_event.start_time,
            end_time=new_event.end_time,
            location=new_event.location,
            meet_url=new_event.meet_url,
            is_mandatory=new_event.is_mandatory
        )
