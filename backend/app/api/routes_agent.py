"""
Agent Chat, Confirmation, and Tool API Endpoints.
"""
from typing import Any, AsyncIterator
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.schemas import (
    AgentChatMessage, AgentChatResponse, ActionConfirmationRequest
)
from app.models.entities import AgentActionAudit
from app.agent.react_agent import agent_engine, stream_openrouter, CONVERSATION_STATE
from app.agent.tools import TOOL_DEFINITIONS, tool_send_reminder
from app.services.audit_service import AuditService
from app.core.config import settings

router = APIRouter(prefix="/agent", tags=["Agent"])


@router.post("/chat", response_model=AgentChatResponse)
async def chat_with_agent(
    payload: AgentChatMessage,
    db: AsyncSession = Depends(get_db)
):
    """Processes a natural language query through the ReAct Agent (full response)."""
    conversation_id = payload.conversation_id or f"conv_{int(datetime.now().timestamp())}"
    return await agent_engine.run_step(
        query=payload.query,
        conversation_id=conversation_id,
        db=db,
        user_role=payload.user_role
    )


@router.post("/stream")
async def stream_chat_with_agent(
    payload: AgentChatMessage,
    db: AsyncSession = Depends(get_db)
):
    """
    Streams the agent response as Server-Sent Events (SSE).

    Event types:
      data: {"type": "tool", "tool_name": "...", "status": "...", "result": {...}}
      data: {"type": "token", "content": "..."}
      data: {"type": "done", "requires_confirmation": bool, "pending_confirmation": {...} | null}
      data: {"type": "error", "message": "..."}
    """
    conversation_id = payload.conversation_id or f"conv_{int(datetime.now().timestamp())}"
    query = payload.query.strip()

    async def event_generator() -> AsyncIterator[str]:
        def sse(obj: dict) -> str:
            return f"data: {json.dumps(obj, default=str)}\n\n"

        # ── Deterministic intent? Run tools, stream structured response tokens ──
        if agent_engine.is_deterministic_intent(query):
            # Run the full deterministic step (fast, < 100ms)
            result = await agent_engine.run_step(
                query=query,
                conversation_id=conversation_id,
                db=db,
                user_role=payload.user_role
            )

            # Emit tool traces
            for trace in (result.tool_executions or []):
                yield sse({
                    "type": "tool",
                    "tool_name": trace.tool_name,
                    "status": trace.status,
                    "result": trace.result,
                    "reasoning_summary": trace.reasoning_summary,
                })

            # Stream the pre-built response text word-by-word for a live feel
            words = result.response.split(" ")
            for i, word in enumerate(words):
                chunk = word if i == 0 else " " + word
                yield sse({"type": "token", "content": chunk})

            # Done signal
            yield sse({
                "type": "done",
                "requires_confirmation": result.requires_confirmation,
                "pending_confirmation": result.pending_confirmation.dict() if result.pending_confirmation else None,
                "audit_id": result.audit_id,
            })
            return

        # ── LLM fallback: stream tokens directly from OpenRouter ──
        state = CONVERSATION_STATE.setdefault(conversation_id, {
            "last_absent_student_ids": [],
            "last_absent_students": [],
            "last_meeting_id": "today_sync",
            "history": []
        })

        history = state.get("history", [])
        history.append({"role": "user", "content": query})

        system_prompt = (
            "You are the AI Operations & HR Agent for StudentOps AI — a student community management platform. "
            "Help HR leads and team managers with attendance, tasks, member evaluations, scheduling, and reminders. "
            "Be concise and professional. Support English and Arabic naturally. "
            "Do not fabricate specific student data — direct users to use specific commands for real data."
        )

        full_reply: list[str] = []
        try:
            async for token in stream_openrouter(messages=history, system=system_prompt):
                full_reply.append(token)
                yield sse({"type": "token", "content": token})
        except Exception as e:
            yield sse({"type": "error", "message": str(e)})
            return

        llm_reply = "".join(full_reply)
        history.append({"role": "assistant", "content": llm_reply})
        state["history"] = history[-20:]

        await AuditService.record_action(
            db=db, intent="LLM_STREAM_CHAT", tool_name="openrouter_stream",
            parameters={"query": query, "model": settings.OPENROUTER_MODEL},
            result={"response": llm_reply[:500]},
            user_id=payload.user_role, status="EXECUTED"
        )

        yield sse({
            "type": "done",
            "requires_confirmation": False,
            "pending_confirmation": None,
            "audit_id": None,
        })

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
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
        return {"success": True, "action_id": payload.action_id, "status": "REJECTED",
                "message": "Action was cancelled by the user."}

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
            "success": True, "action_id": payload.action_id, "status": "EXECUTED",
            "result": exec_res,
            "message": f"Successfully sent reminder to {exec_res.get('sent_count', 0)} recipient(s)."
        }

    raise HTTPException(status_code=400, detail=f"Unsupported action: {audit_entry.tool_name}")


@router.get("/tools")
async def get_registered_tools():
    """Lists all available tools and schema specifications."""
    return {"tools": TOOL_DEFINITIONS}
