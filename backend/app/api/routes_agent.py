"""
Agent Chat, Confirmation, and Tool API Endpoints.
"""
from typing import Any, AsyncIterator
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import require_roles, get_current_active_user, rate_limit_agent
from app.models.schemas import (
    AgentChatMessage, AgentChatResponse, ActionConfirmationRequest
)
from app.models.entities import AgentActionAudit, User, Student
from app.agent.react_agent import agent_engine, stream_openrouter, CONVERSATION_STATE
from app.agent.tools import TOOL_DEFINITIONS, tool_send_reminder
from app.services.audit_service import AuditService
from app.core.config import settings

router = APIRouter(prefix="/agent", tags=["Agent"])


@router.post("/chat", response_model=AgentChatResponse, dependencies=[Depends(rate_limit_agent)])
async def chat_with_agent(
    payload: AgentChatMessage,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["hr_admin", "team_lead"]))
):
    """Processes a natural language query through the ReAct Agent (full response)."""
    conversation_id = payload.conversation_id or f"conv_{int(datetime.now().timestamp())}"
    return await agent_engine.run_step(
        query=payload.query,
        conversation_id=conversation_id,
        db=db,
        user_role=current_user.role,
        team_id=current_user.team_id,
        user_id=current_user.id
    )


@router.post("/stream", dependencies=[Depends(rate_limit_agent)])
async def stream_chat_with_agent(
    payload: AgentChatMessage,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["hr_admin", "team_lead"]))
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
                user_role=current_user.role,
                team_id=current_user.team_id,
                user_id=current_user.id
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

        # ── LLM fallback: stream tokens directly from OpenRouter (isolated per user) ──
        scoped_conv_key = f"{current_user.id}:{conversation_id}"
        state = CONVERSATION_STATE.setdefault(scoped_conv_key, {
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
            fallback = (
                "خوادم الذكاء الاصطناعي المجاني لـ OpenRouter تجاوزت حد الاستخدام المؤقت (Rate Limit 429). "
                "يمكنك استخدام الأوامر المباشرة للاستعلام عن الحضور، التقييمات، والتاسكات بدقة 100%."
                if any('\u0600' <= char <= '\u06FF' for char in query) else
                "OpenRouter free tier rate limit reached (HTTP 429). You can use direct operations for attendance, scores, tasks, and scheduling."
            )
            for word in fallback.split(" "):
                full_reply.append(word + " ")
                yield sse({"type": "token", "content": word + " "})

        llm_reply = "".join(full_reply)
        history.append({"role": "assistant", "content": llm_reply})
        state["history"] = history[-20:]

        await AuditService.record_action(
            db=db, intent="LLM_STREAM_CHAT", tool_name="openrouter_stream",
            parameters={"query": query, "model": settings.OPENROUTER_MODEL},
            result={"response": llm_reply[:500]},
            user_id=current_user.id, status="EXECUTED"
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["hr_admin", "team_lead"]))
):
    """
    Confirms or cancels a pending sensitive agent action.
    Enforces atomic status checking to prevent replay attacks and verifies role/team authorization boundaries.
    """
    audit_entry = await AuditService.get_pending_action(payload.action_id, db)
    if not audit_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pending action '{payload.action_id}' not found."
        )

    # Anti-replay & State validation
    if audit_entry.status != "PENDING_CONFIRMATION" or audit_entry.confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Action '{payload.action_id}' is not pending confirmation (current status: {audit_entry.status})."
        )

    # Scoping check: If team lead, verify ownership or team membership of targets
    params = json.loads(audit_entry.parameters) if audit_entry.parameters else {}
    target_student_ids = params.get("student_ids", [])
    if current_user.role == "team_lead" and target_student_ids:
        # Verify all target students belong to the team lead's team
        invalid_res = await db.execute(
            select(Student.id).where(
                Student.id.in_(target_student_ids),
                Student.team_id != current_user.team_id
            )
        )
        invalid_ids = invalid_res.scalars().all()
        if invalid_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: cannot confirm actions targeting students outside your assigned team."
            )

    if not payload.confirmed:
        audit_entry.status = "REJECTED"
        audit_entry.confirmed = False
        audit_entry.user_id = current_user.id
        await db.commit()
        return {
            "success": True,
            "action_id": payload.action_id,
            "status": "REJECTED",
            "message": "Action was cancelled by the user."
        }

    if audit_entry.tool_name == "send_reminder":
        exec_res = await tool_send_reminder(
            db=db,
            student_ids=target_student_ids,
            event_id=params.get("event_id"),
            custom_message=params.get("custom_message"),
            channel=params.get("channel", "WHATSAPP"),
            is_confirmed=True
        )
        audit_entry.status = "EXECUTED"
        audit_entry.confirmed = True
        audit_entry.user_id = current_user.id
        audit_entry.result = json.dumps(exec_res, default=str)
        await db.commit()
        return {
            "success": True,
            "action_id": payload.action_id,
            "status": "EXECUTED",
            "result": exec_res,
            "message": f"Successfully sent reminder to {exec_res.get('sent_count', 0)} recipient(s)."
        }

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported action: {audit_entry.tool_name}")


@router.get("/tools")
async def get_registered_tools(
    _: User = Depends(get_current_active_user)
):
    """Lists all available tools and schema specifications (Authenticated users only)."""
    return {"tools": TOOL_DEFINITIONS}

