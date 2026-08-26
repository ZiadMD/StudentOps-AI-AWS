"""
Calendar and Event Endpoints.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.schemas import EventSchema, EventCreate
from app.agent.tools import calendar_service

router = APIRouter(prefix="/calendar", tags=["Calendar"])


@router.get("/events", response_model=list[EventSchema])
async def get_events(limit: int = 20, db: AsyncSession = Depends(get_db)):
    return await calendar_service.get_upcoming_events(db, limit=limit)


@router.post("/events", response_model=EventSchema)
async def create_event(event_in: EventCreate, db: AsyncSession = Depends(get_db)):
    return await calendar_service.create_event(event_in, db)
