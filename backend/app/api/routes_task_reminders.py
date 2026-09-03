"""HR Admin controls and status for automatic task reminders."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import rate_limit_agent, require_roles
from app.models.entities import User
from app.services.task_followup_service import task_followup_service


router = APIRouter(prefix="/task-reminders", tags=["Automated Task Reminders"])


class TaskReminderToggleRequest(BaseModel):
    enabled: bool


class TaskReminderTestRequest(BaseModel):
    message: str = Field(
        default="[StudentOps AI Agent Test] This automated task reminder was detected and sent by the scheduler.",
        min_length=1,
        max_length=4096,
    )


@router.get("/status")
async def get_task_reminder_status(_: User = Depends(require_roles(["hr_admin"]))):
    return task_followup_service.status()


@router.patch("/status")
async def set_task_reminder_status(
    payload: TaskReminderToggleRequest,
    _: User = Depends(require_roles(["hr_admin"])),
):
    task_followup_service.set_enabled(payload.enabled)
    return task_followup_service.status()


@router.post("/test", dependencies=[Depends(rate_limit_agent)])
async def queue_task_reminder_test(
    payload: TaskReminderTestRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(["hr_admin"])),
):
    """Queue a synthetic test reminder; the scheduler performs the eventual send."""
    try:
        return await task_followup_service.queue_test_reminder(db=db, message=payload.message)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc