"""
Automation & Scheduling Configuration Endpoints for StudentOps AI.
Allows HR personnel to manage attendance grace, task reminder triggers, and inspection logs.
"""
from typing import Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_roles
from app.models.entities import User, AutomationSettings, ReminderLog, utcnow
from app.models.schemas import AutomationSettingsSchema
from app.services.automation_service import automation_engine

router = APIRouter(prefix="/automation", tags=["Automation"])


@router.get("/settings", response_model=AutomationSettingsSchema)
async def get_automation_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Retrieves automation settings for the authenticated user or system defaults."""
    settings = await automation_engine.get_hr_settings(current_user.id, db)
    return AutomationSettingsSchema(
        attendance_enabled=settings.attendance_enabled,
        attendance_grace_minutes=settings.attendance_grace_minutes,
        attendance_message=settings.attendance_message,
        task_pre_enabled=settings.task_pre_enabled,
        task_pre_hours=settings.task_pre_hours,
        task_pre_message=settings.task_pre_message,
        task_post_enabled=settings.task_post_enabled,
        task_post_delay_hours=settings.task_post_delay_hours,
        task_post_message=settings.task_post_message,
        whatsapp_enabled=settings.whatsapp_enabled,
    )


@router.put("/settings", response_model=AutomationSettingsSchema)
async def update_automation_settings(
    body: AutomationSettingsSchema,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["region_hr_head", "committee_hr_leader", "hr_admin"]))
):
    """Updates automation settings for the authenticated HR leader."""
    res = await db.execute(
        select(AutomationSettings).where(AutomationSettings.user_id == current_user.id)
    )
    existing = res.scalar_one_or_none()

    if not existing:
        existing = AutomationSettings(
            id=f"auto_{uuid.uuid4().hex[:12]}",
            user_id=current_user.id,
        )
        db.add(existing)

    existing.attendance_enabled = body.attendance_enabled
    existing.attendance_grace_minutes = body.attendance_grace_minutes
    existing.attendance_message = body.attendance_message
    existing.task_pre_enabled = body.task_pre_enabled
    existing.task_pre_hours = body.task_pre_hours
    existing.task_pre_message = body.task_pre_message
    existing.task_post_enabled = body.task_post_enabled
    existing.task_post_delay_hours = body.task_post_delay_hours
    existing.task_post_message = body.task_post_message
    existing.whatsapp_enabled = body.whatsapp_enabled
    existing.updated_at = utcnow()

    await db.commit()
    await db.refresh(existing)

    return AutomationSettingsSchema(
        attendance_enabled=existing.attendance_enabled,
        attendance_grace_minutes=existing.attendance_grace_minutes,
        attendance_message=existing.attendance_message,
        task_pre_enabled=existing.task_pre_enabled,
        task_pre_hours=existing.task_pre_hours,
        task_pre_message=existing.task_pre_message,
        task_post_enabled=existing.task_post_enabled,
        task_post_delay_hours=existing.task_post_delay_hours,
        task_post_message=existing.task_post_message,
        whatsapp_enabled=existing.whatsapp_enabled,
    )


@router.post("/trigger-run")
async def trigger_automation_cycle(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["region_hr_head", "committee_hr_leader", "hr_admin"]))
):
    """Manually triggers an immediate background automation evaluation cycle."""
    result = await automation_engine.run_cycle(db)
    return {
        "status": "success",
        "triggered_by": current_user.full_name,
        "results": result
    }


@router.get("/logs")
async def get_automation_logs(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Lists recent automated notifications and reminder logs."""
    res = await db.execute(
        select(ReminderLog)
        .order_by(ReminderLog.sent_at.desc())
        .limit(limit)
    )
    logs = res.scalars().all()
    return [
        {
            "id": l.id,
            "recipient_id": l.recipient_id,
            "recipient_name": l.recipient_name,
            "recipient_phone": l.recipient_phone,
            "channel": l.channel,
            "message_content": l.message_content,
            "status": l.status,
            "sent_at": l.sent_at.isoformat() if l.sent_at else None,
            "trigger_source": l.trigger_source,
        }
        for l in logs
    ]
