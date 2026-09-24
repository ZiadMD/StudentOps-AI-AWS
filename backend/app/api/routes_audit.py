"""
Audit Log Endpoints.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import require_roles
from app.services.audit_service import AuditService

router = APIRouter(
    prefix="/audit",
    tags=["Audit"],
    dependencies=[Depends(require_roles(["hr_admin"]))]
)


@router.get("/logs")
async def get_audit_logs(limit: int = 50, db: AsyncSession = Depends(get_db)):
    logs = await AuditService.get_recent_actions(db, limit=limit)
    return [
        {
            "id": l.id,
            "action_id": l.action_id,
            "user_id": l.user_id,
            "intent": l.intent,
            "tool_name": l.tool_name,
            "parameters": l.parameters,
            "result": l.result,
            "requires_confirmation": l.requires_confirmation,
            "confirmed": l.confirmed,
            "status": l.status,
            "timestamp": l.timestamp.isoformat()
        }
        for l in logs
    ]
