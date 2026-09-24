"""
Calendar and Event Endpoints.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_roles
from app.models.entities import User
from app.models.schemas import EventSchema, EventCreate
from app.agent.tools import calendar_service

router = APIRouter(prefix="/calendar", tags=["Calendar"])


@router.get("/events", response_model=list[EventSchema])
async def get_events(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_active_user)
):
    return await calendar_service.get_upcoming_events(db, limit=limit)


@router.post("/events", response_model=EventSchema)
async def create_event(
    event_in: EventCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(["hr_admin", "team_lead"]))
):
    return await calendar_service.create_event(event_in, db)
