"""
Audit Logging Service for Agent Actions and Platform Operations.
"""
from typing import Any, Optional
from datetime import datetime, timezone
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.entities import AgentActionAudit


class AuditService:
    """Records and fetches immutable audit trails."""

    @staticmethod
    async def record_action(
        db: AsyncSession,
        intent: str,
        tool_name: str,
        parameters: dict[str, Any],
        result: Any,
        user_id: str = "hr_lead",
        requires_confirmation: bool = False,
        confirmed: bool = True,
        status: str = "EXECUTED",
        action_id: Optional[str] = None
    ) -> AgentActionAudit:
        if not action_id:
            action_id = f"act_{int(datetime.now().timestamp() * 1000)}"

        audit_entry = AgentActionAudit(
            id=f"aud_{action_id}",
            action_id=action_id,
            user_id=user_id,
            intent=intent,
            tool_name=tool_name,
            parameters=json.dumps(parameters, default=str),
            result=json.dumps(result, default=str) if isinstance(result, (dict, list, str, int, float, bool)) else str(result),
            requires_confirmation=requires_confirmation,
            confirmed=confirmed,
            status=status,
            timestamp=datetime.now(timezone.utc)
        )
        db.add(audit_entry)
        await db.commit()
        await db.refresh(audit_entry)
        return audit_entry

    @staticmethod
    async def get_recent_actions(db: AsyncSession, limit: int = 50) -> list[AgentActionAudit]:
        res = await db.execute(
            select(AgentActionAudit)
            .order_by(AgentActionAudit.timestamp.desc())
            .limit(limit)
        )
        return list(res.scalars().all())

    @staticmethod
    async def get_pending_action(action_id: str, db: AsyncSession) -> Optional[AgentActionAudit]:
        res = await db.execute(
            select(AgentActionAudit).where(AgentActionAudit.action_id == action_id)
        )
        return res.scalar_one_or_none()
