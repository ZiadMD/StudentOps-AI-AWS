"""
ReAct AI Agent Loop with OpenRouter LLM (streaming) and Deterministic Grounding.
"""
from typing import Any, AsyncIterator
import json
import httpx
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.agent.tools import TOOL_REGISTRY
from app.services.audit_service import AuditService
from app.models.schemas import (
    AgentChatResponse, ToolCallExecution, PendingConfirmation
)

# In-memory conversational state per conversation_id
CONVERSATION_STATE: dict[str, dict[str, Any]] = {}


async def stream_openrouter(messages: list[dict], system: str = "") -> AsyncIterator[str]:
    """
    Stream a chat completion from OpenRouter using Server-Sent Events.
    Yields text delta strings as they arrive.
    """
    if not settings.OPENROUTER_API_KEY:
        yield "OpenRouter API key is not configured. Please set OPENROUTER_API_KEY in your .env file."
        return

    all_messages = []
    if system:
        all_messages.append({"role": "system", "content": system})
    all_messages.extend(messages)

    payload: dict[str, Any] = {
        "model": settings.OPENROUTER_MODEL,
        "messages": all_messages,
        "stream": True,
    }

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://studentops.ai",
        "X-Title": "StudentOps AI",
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{settings.OPENROUTER_BASE_URL}/chat/completions",
            json=payload,
            headers=headers,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                data = line[6:]  # strip "data: "
                if data.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                    delta = chunk["choices"][0]["delta"].get("content", "")
                    if delta:
                        yield delta
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue


async def call_openrouter(messages: list[dict], system: str = "") -> str:
    """Non-streaming convenience wrapper — collects the full stream into a string."""
    parts: list[str] = []
    async for chunk in stream_openrouter(messages, system):
        parts.append(chunk)
    return "".join(parts)


class ReActAgent:
    """ReAct Reasoning & Action Engine — grounded deterministic intents + OpenRouter LLM."""

    async def execute_tool(self, tool_name: str, parameters: dict[str, Any], db: AsyncSession) -> tuple[Any, str]:
        handler = TOOL_REGISTRY.get(tool_name)
        if not handler:
            return {"error": f"Unknown tool: {tool_name}"}, "FAILED"
        try:
            res = await handler(db=db, **parameters)
            if isinstance(res, dict) and res.get("status") == "REQUIRES_CONFIRMATION":
                return res, "PENDING_CONFIRMATION"
            return res, "SUCCESS"
        except Exception as e:
            return {"error": str(e)}, "FAILED"

    async def run_step(
        self,
        query: str,
        conversation_id: str,
        db: AsyncSession,
        user_role: str = "HR_LEAD"
    ) -> AgentChatResponse:
        """
        Runs a deterministic intent check.
        If matched: returns structured tool result immediately.
        If unmatched: calls OpenRouter and collects the full reply (use /stream for streaming).
        """
        state = CONVERSATION_STATE.setdefault(conversation_id, {
            "last_absent_student_ids": [],
            "last_absent_students": [],
            "last_meeting_id": "today_sync",
            "history": []
        })

        query_clean = query.strip()
        is_arabic = any('\u0600' <= char <= '\u06FF' for char in query_clean)
        tool_executions: list[ToolCallExecution] = []

        # ── INTENT 1: Attendance ──────────────────────────────────────────
        if any(w in query_clean.lower() for w in ["absent", "غياب", "غائب", "غاب", "attendance", "حضور", "حضر"]):
            tool_name = "get_meeting_attendance"
            params = {"meeting_id": "today_sync"}
            result, status = await self.execute_tool(tool_name, params, db)
            tool_executions.append(ToolCallExecution(
                tool_name=tool_name, parameters=params, result=result, status=status,
                reasoning_summary="Checking meeting attendance records..."
            ))
            absent_list = result.get("absent_students", []) if isinstance(result, dict) else []
            state["last_absent_student_ids"] = [s["student_id"] for s in absent_list]
            state["last_absent_students"] = absent_list
            state["last_meeting_id"] = result.get("meeting", {}).get("id", "today_sync")
            audit_entry = await AuditService.record_action(
                db=db, intent="QUERY_ATTENDANCE", tool_name=tool_name,
                parameters=params, result=result, user_id=user_role, status="EXECUTED"
            )
            if is_arabic:
                absent_names = [f"• {s['arabic_name']} ({s['phone']})" for s in absent_list]
                names_str = "\n".join(absent_names) if absent_names else "لا يوجد غائبون اليوم!"
                resp_text = (
                    f"📊 **تقرير الحضور:**\n"
                    f"حضر: {result.get('summary', {}).get('present_count', 0)} | "
                    f"غياب: {len(absent_list)}\n\n**الغائبون:**\n{names_str}\n\n"
                    f"💡 هل ترغب في إرسال تذكير لهم؟"
                )
            else:
                absent_names = [f"• {s['name']} ({s['arabic_name']}) — {s['phone']}" for s in absent_list]
                names_str = "\n".join(absent_names) if absent_names else "Everyone attended!"
                resp_text = (
                    f"📊 **Attendance Report:**\n"
                    f"Present: {result.get('summary', {}).get('present_count', 0)} | "
                    f"Late: {result.get('summary', {}).get('late_count', 0)} | "
                    f"Absent: {len(absent_list)}\n\n**Absent Members:**\n{names_str}\n\n"
                    f"Would you like me to send them a reminder?"
                )
            return AgentChatResponse(conversation_id=conversation_id, response=resp_text,
                                     tool_executions=tool_executions, audit_id=audit_entry.id)

        # ── INTENT 2: Reminder ────────────────────────────────────────────
        elif any(w in query_clean.lower() for w in ["remind", "ذكر", "تذكير", "رسالة", "message"]):
            target_ids = state.get("last_absent_student_ids", [])
            if not target_ids:
                att_res, _ = await self.execute_tool("get_meeting_attendance", {"meeting_id": "today_sync"}, db)
                absent_list = att_res.get("absent_students", []) if isinstance(att_res, dict) else []
                target_ids = [s["student_id"] for s in absent_list]
                state["last_absent_students"] = absent_list
                state["last_absent_student_ids"] = target_ids
            cal_res, cal_stat = await self.execute_tool("get_upcoming_meetings", {"limit": 3}, db)
            tool_executions.append(ToolCallExecution(
                tool_name="get_upcoming_meetings", parameters={"limit": 3},
                result=cal_res, status=cal_stat,
                reasoning_summary="Retrieving next scheduled meeting..."
            ))
            next_meetings = cal_res.get("meetings", []) if isinstance(cal_res, dict) else []
            next_event_id = next_meetings[0]["id"] if next_meetings else None
            prep_params = {"student_ids": target_ids, "event_id": next_event_id}
            prep_res, prep_stat = await self.execute_tool("prepare_reminder", prep_params, db)
            tool_executions.append(ToolCallExecution(
                tool_name="prepare_reminder", parameters=prep_params,
                result=prep_res, status=prep_stat,
                reasoning_summary="Generating draft reminder and verifying contacts..."
            ))
            action_id = f"act_rem_{int(datetime.now().timestamp() * 1000)}"
            audit_entry = await AuditService.record_action(
                db=db, intent="SEND_REMINDER", tool_name="send_reminder",
                parameters=prep_params, result=prep_res, user_id=user_role,
                requires_confirmation=True, confirmed=False,
                status="PENDING_CONFIRMATION", action_id=action_id
            )
            pending_conf = PendingConfirmation(
                action_id=action_id, tool_name="send_reminder",
                description=f"Send reminder for '{prep_res.get('event', {}).get('title', 'Upcoming Meeting')}' to {len(target_ids)} member(s).",
                target_count=len(target_ids), preview_data=prep_res
            )
            if is_arabic:
                resp_text = (
                    f"⚠️ **مطلوب تأكيد:** رسالة لـ {len(target_ids)} عضو.\n\n"
                    f"**نص الرسالة:**\n```\n{prep_res.get('message_preview')}\n```\n"
                    f"اضغط **تأكيد وإرسال** للمتابعة."
                )
            else:
                resp_text = (
                    f"⚠️ **Confirmation Required:** Reminder for {len(target_ids)} member(s).\n\n"
                    f"**Message Preview:**\n```\n{prep_res.get('message_preview')}\n```\n"
                    f"Click **Confirm & Send** to dispatch."
                )
            return AgentChatResponse(conversation_id=conversation_id, response=resp_text,
                                     tool_executions=tool_executions, requires_confirmation=True,
                                     pending_confirmation=pending_conf, audit_id=audit_entry.id)

        # ── INTENT 3: Score / Evaluation ──────────────────────────────────
        elif any(w in query_clean.lower() for w in ["score", "درجة", "تقييم", "points", "نقاط", "evaluation", "behavior"]):
            target_name = "std_maurine"
            if "alaa" in query_clean.lower() or "الاء" in query_clean:
                target_name = "std_alaa"
            elif "hanan" in query_clean.lower() or "حنان" in query_clean:
                target_name = "std_hanan"
            params = {"student_id_or_name": target_name}
            result, status = await self.execute_tool("get_student_score", params, db)
            tool_executions.append(ToolCallExecution(
                tool_name="get_student_score", parameters=params, result=result, status=status,
                reasoning_summary="Retrieving official evaluation scorecard..."
            ))
            audit_entry = await AuditService.record_action(
                db=db, intent="GET_STUDENT_SCORE", tool_name="get_student_score",
                parameters=params, result=result, user_id=user_role, status="EXECUTED"
            )
            sc = result.get("score_summary", {})
            if is_arabic:
                resp_text = (
                    f"📋 **تقييم: {sc.get('arabic_name')}**\n\n"
                    f"• الحضور: {sc.get('on_time_attendance_count')} في الميعاد | {sc.get('late_attendance_count')} متأخر | {sc.get('absence_count')} غياب\n"
                    f"• متوسط التاسكات: {sc.get('average_task_quality')} / 10\n"
                    f"• السلوك: {sc.get('total_behavior_score')} / 23\n"
                    f"• التقييم العام: ⭐ {sc.get('overall_rating')}"
                )
            else:
                resp_text = (
                    f"📋 **Evaluation: {sc.get('student_name')} ({sc.get('arabic_name')})**\n\n"
                    f"• Attendance: {sc.get('on_time_attendance_count')} On-time | {sc.get('late_attendance_count')} Late | {sc.get('absence_count')} Absent\n"
                    f"• Avg Task Quality: {sc.get('average_task_quality')} / 10\n"
                    f"• Behavior & Discipline: {sc.get('total_behavior_score')} / 23\n"
                    f"  — Group: {sc.get('group_interaction_score')}/5 | Social: {sc.get('social_media_score')}/5 | Rules: {sc.get('hierarchy_rules_score')}/5 | Conduct: {sc.get('polite_conduct_score')}/8\n"
                    f"• Overall: ⭐ {sc.get('overall_rating')}"
                )
            return AgentChatResponse(conversation_id=conversation_id, response=resp_text,
                                     tool_executions=tool_executions, audit_id=audit_entry.id)

        # ── INTENT 4: Pending Submissions ─────────────────────────────────
        elif any(w in query_clean.lower() for w in ["task", "تاسك", "تسليم", "submitted", "submission", "pending"]):
            result, status = await self.execute_tool("get_pending_submissions", {}, db)
            tool_executions.append(ToolCallExecution(
                tool_name="get_pending_submissions", parameters={}, result=result, status=status,
                reasoning_summary="Querying pending task submissions..."
            ))
            audit_entry = await AuditService.record_action(
                db=db, intent="GET_PENDING_SUBMISSIONS", tool_name="get_pending_submissions",
                parameters={}, result=result, user_id=user_role, status="EXECUTED"
            )
            pending = result.get("pending_submissions", [])
            if is_arabic:
                items = [f"• {p['arabic_name']} — {p['task_title']}" for p in pending]
                resp_text = f"📝 **التاسكات المعلقة ({len(pending)}):**\n" + ("\n".join(items) if items else "الكل سلّم!")
            else:
                items = [f"• {p['student_name']} ({p['arabic_name']}) — {p['task_title']}" for p in pending]
                resp_text = f"📝 **Pending Submissions ({len(pending)}):**\n" + ("\n".join(items) if items else "All submitted!")
            return AgentChatResponse(conversation_id=conversation_id, response=resp_text,
                                     tool_executions=tool_executions, audit_id=audit_entry.id)

        # ── INTENT 5: Calendar ────────────────────────────────────────────
        elif any(w in query_clean.lower() for w in ["calendar", "meeting", "قادم", "ميتينج", "اجتماع", "مواعيد", "schedule", "event"]):
            result, status = await self.execute_tool("get_upcoming_events", {"limit": 5}, db)
            tool_executions.append(ToolCallExecution(
                tool_name="get_upcoming_events", parameters={"limit": 5}, result=result, status=status,
                reasoning_summary="Retrieving upcoming schedule..."
            ))
            audit_entry = await AuditService.record_action(
                db=db, intent="GET_UPCOMING_EVENTS", tool_name="get_upcoming_events",
                parameters={"limit": 5}, result=result, user_id=user_role, status="EXECUTED"
            )
            events = result.get("events", [])
            items = [f"• **{e['title']}** — 📅 {e['start_time'][:16].replace('T', ' ')}" for e in events]
            if is_arabic:
                resp_text = "📅 **الأحداث القادمة:**\n" + "\n".join(items)
            else:
                resp_text = "📅 **Upcoming Events:**\n" + "\n".join(items)
            return AgentChatResponse(conversation_id=conversation_id, response=resp_text,
                                     tool_executions=tool_executions, audit_id=audit_entry.id)

        # ── FALLBACK: OpenRouter LLM (non-streaming, for /chat endpoint) ──
        else:
            history = state.get("history", [])
            history.append({"role": "user", "content": query_clean})
            system_prompt = (
                "You are the AI Operations & HR Agent for StudentOps AI — a student community management platform. "
                "Help HR leads and team managers with attendance, tasks, member evaluations, scheduling, and reminders. "
                "Be concise and professional. Support English and Arabic naturally. "
                "Do not fabricate specific student data — direct users to use specific commands for real data."
            )
            try:
                llm_reply = await call_openrouter(messages=history, system=system_prompt)
            except httpx.HTTPStatusError as e:
                llm_reply = f"LLM Error {e.response.status_code}: {e.response.text[:300]}"
            except Exception as e:
                llm_reply = f"Could not reach OpenRouter: {str(e)}"

            history.append({"role": "assistant", "content": llm_reply})
            state["history"] = history[-20:]

            audit_entry = await AuditService.record_action(
                db=db, intent="LLM_CHAT", tool_name="openrouter_llm",
                parameters={"query": query_clean, "model": settings.OPENROUTER_MODEL},
                result={"response": llm_reply[:500]},
                user_id=user_role, status="EXECUTED"
            )
            return AgentChatResponse(conversation_id=conversation_id, response=llm_reply,
                                     tool_executions=[], audit_id=audit_entry.id)

    def is_deterministic_intent(self, query: str) -> bool:
        """Returns True if the query matches a grounded tool intent (won't call LLM)."""
        q = query.lower()
        return any(w in q for w in [
            "absent", "غياب", "غائب", "attendance", "حضور",
            "remind", "ذكر", "تذكير",
            "score", "درجة", "تقييم", "evaluation",
            "task", "تاسك", "submission",
            "calendar", "meeting", "اجتماع", "schedule",
        ])


agent_engine = ReActAgent()
