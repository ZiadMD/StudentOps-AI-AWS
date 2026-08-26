"""
Agent Chat, Confirmation, and Tool API Endpoints.
"""
from typing import Any
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.schemas import (
    AgentChatMessage, AgentChatResponse, ActionConfirmationRequest
)
from app.models.entities import AgentActionAudit
from app.agent.react_agent import agent_engine
from app.agent.tools import TOOL_DEFINITIONS, tool_send_reminder
from app.services.audit_service import AuditService

router = APIRouter(prefix="/agent", tags=["Agent"])


@router.post("/chat", response_model=AgentChatResponse)
async def chat_with_agent(
    payload: AgentChatMessage,
    db: AsyncSession = Depends(get_db)
):
    """Processes a natural language query from HR through the ReAct Agent."""
    conversation_id = payload.conversation_id or f"conv_{int(datetime.now().timestamp())}"
    return await agent_engine.run_step(
        query=payload.query,
        conversation_id=conversation_id,
        db=db,
        user_role=payload.user_role
    )


@router.post("/confirm")
async def confirm_action(
    payload: ActionConfirmationRequest,
    db: AsyncSession = Depends(get_db)
):
    """Confirms or cancels a pending sensitive agent action."""
    audit_entry = await AuditService.get_pending_action(payload.action_id, db)
    if not audit_entry:
        raise HTTPException(status_code=404, detail=f"Pending action '{payload.action_id}' not found.")

    if not payload.confirmed:
        audit_entry.status = "REJECTED"
        audit_entry.confirmed = False
        await db.commit()
        return {
            "success": True,
            "action_id": payload.action_id,
            "status": "REJECTED",
            "message": "Action was cancelled by the user."
        }

    # Execute action
    params = json.loads(audit_entry.parameters) if audit_entry.parameters else {}
    
    if audit_entry.tool_name == "send_reminder":
        exec_res = await tool_send_reminder(
            db=db,
            student_ids=params.get("student_ids", []),
            event_id=params.get("event_id"),
            custom_message=params.get("custom_message"),
            channel=params.get("channel", "WHATSAPP"),
            is_confirmed=True
        )
        
        audit_entry.status = "EXECUTED"
        audit_entry.confirmed = True
        audit_entry.result = json.dumps(exec_res, default=str)
        await db.commit()

        return {
            "success": True,
            "action_id": payload.action_id,
            "status": "EXECUTED",
            "result": exec_res,
            "message": f"Successfully sent reminder to {exec_res.get('sent_count', 0)} recipient(s)."
        }

    raise HTTPException(status_code=400, detail=f"Unsupported action execution for {audit_entry.tool_name}")


@router.get("/tools")
async def get_registered_tools():
    """Lists all available tools and schema specifications."""
    return {"tools": TOOL_DEFINITIONS}
