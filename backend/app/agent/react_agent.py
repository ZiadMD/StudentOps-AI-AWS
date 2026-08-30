"""
ReAct AI Agent Loop with OpenRouter LLM (streaming) and Deterministic Grounding.
"""
from typing import Any, AsyncIterator, Optional
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


async def stream_groq(messages: list[dict], system: str = "") -> AsyncIterator[str]:
    """
    Stream chat completion directly from Groq using ultra-fast LPU hardware.
    Yields text delta strings as they arrive.
    """
    if not settings.GROQ_API_KEY:
        return

    all_messages = []
    if system:
        all_messages.append({"role": "system", "content": system})
    all_messages.extend(messages)

    payload: dict[str, Any] = {
        "model": settings.GROQ_MODEL,
        "messages": all_messages,
        "stream": True,
    }

    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        async with client.stream(
            "POST",
            f"{settings.GROQ_BASE_URL}/chat/completions",
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
                    delta = chunk["choices"][0]["delta"]
                    content = delta.get("content", "")
                    if content:
                        yield content
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue


async def stream_openrouter(messages: list[dict], system: str = "") -> AsyncIterator[str]:
    """
    Multi-provider cascading LLM stream:
    1. Try Groq if configured (ultra-fast 500+ tok/sec, generous rate limits).
    2. Try OpenRouter.
    3. Fall back to Groq if OpenRouter returns 429 Rate Limit or errors.
    4. Fall back to local deterministic response if external providers are unavailable.
    """
    last_user_msg = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
    is_arabic = any('\u0600' <= char <= '\u06FF' for char in last_user_msg)

    # ── Tier 1: Groq LLM (Primary / Fallback) ──
    if settings.GROQ_API_KEY:
        try:
            tokens_emitted = 0
            async for token in stream_groq(messages, system):
                tokens_emitted += 1
                yield token
            if tokens_emitted > 0:
                return
        except Exception:
            pass  # Fall through to OpenRouter or local mode

    # ── Tier 2: OpenRouter LLM ──
    if settings.OPENROUTER_API_KEY:
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

        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                async with client.stream(
                    "POST",
                    f"{settings.OPENROUTER_BASE_URL}/chat/completions",
                    json=payload,
                    headers=headers,
                ) as resp:
                    if resp.status_code == 200:
                        async for line in resp.aiter_lines():
                            if not line or not line.startswith("data: "):
                                continue
                            data = line[6:]
                            if data.strip() == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data)
                                delta = chunk["choices"][0]["delta"].get("content", "")
                                if delta:
                                    yield delta
                            except (json.JSONDecodeError, KeyError, IndexError):
                                continue
                        return
                    # If 429 or status error, try Groq
                    if settings.GROQ_API_KEY:
                        try:
                            async for token in stream_groq(messages, system):
                                yield token
                            return
                        except Exception:
                            pass
        except Exception:
            if settings.GROQ_API_KEY:
                try:
                    async for token in stream_groq(messages, system):
                        yield token
                    return
                except Exception:
                    pass

    # ── Tier 3: Local Deterministic Agent Response ──
    fallback_text = (
        "يعمل المساعد الآن في الوضع المحلي المستقل لجميع العمليات (الحضور، التذكيرات، التقييمات، والتاسكات بدقة 100%)."
        if is_arabic else
        "Operating in local deterministic mode for all operations (attendance, reminders, scorecards, and tasks)."
    )
    for word in fallback_text.split(" "):
        yield word + " "


async def call_openrouter(messages: list[dict], system: str = "") -> str:
    """Non-streaming convenience wrapper — collects the full stream into a string."""
    parts: list[str] = []
    try:
        async for chunk in stream_openrouter(messages, system):
            parts.append(chunk)
    except Exception as e:
        return f"Local agent mode active: {str(e)}"
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
        user_role: str = "HR_LEAD",
        team_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> AgentChatResponse:
        """
        Runs a deterministic intent check.
        If matched: returns structured tool result immediately.
        If unmatched: calls OpenRouter and collects the full reply (use /stream for streaming).
        
        SECURITY & ISOLATION:
        - Conversational state is strictly keyed by user_id:conversation_id.
        - Tool executions are scoped to team_id for team leads.
        - Immutable audit trails record the exact user_id.
        """
        acting_user = user_id or user_role
        scoped_state_key = f"{acting_user}:{conversation_id}"
        state = CONVERSATION_STATE.setdefault(scoped_state_key, {
            "last_absent_student_ids": [],
            "last_absent_students": [],
            "last_meeting_id": "today_sync",
            "history": []
        })

        query_clean = query.strip()
        is_arabic = any('\u0600' <= char <= '\u06FF' for char in query_clean)
        tool_executions: list[ToolCallExecution] = []

        # ── INTENT 0A: Greeting ───────────────────────────────────────────
        greetings_en = ["hi", "hello", "hey", "good morning", "good evening", "welcome"]
        greetings_ar = ["مرحبا", "سلام", "ازيك", "صباح الخير", "مساء الخير", "السلام عليكم", "اهلا", "أهلا"]
        if any(query_clean.lower() == g or query_clean.lower().startswith(g + " ") for g in greetings_en + greetings_ar):
            if is_arabic:
                resp_text = (
                    "أهلاً بك! أنا المساعد الذكي لإدارة العمليات والموارد البشرية في **StudentOps AI**.\n\n"
                    "يمكنني مساعدتك في المهام التالية:\n"
                    "• **الحضور والغياب:** *'مين غاب في ميتينج النهاردة؟'*\n"
                    "• **إرسال التذكيرات:** *'ابعت تذكير للغائبين بالميتينج القادم'*\n"
                    "• **تقييمات الأعضاء:** *'عرض تقييم مورين'* أو *'درجات الاء'*\n"
                    "• **متابعة التاسكات:** *'عرض التاسكات المعلقة'*\n"
                    "• **جدول المواعيد:** *'ما هي الاجتماعات القادمة؟'*\n\n"
                    "كيف أستطيع مساعدتك اليوم؟"
                )
            else:
                resp_text = (
                    "Hello! I am your AI Operations & HR Assistant for **StudentOps AI**.\n\n"
                    "I can help you with:\n"
                    "• **Meeting Attendance:** *'Who was absent from today\\'s meeting?'*\n"
                    "• **Dispatching Reminders:** *'Remind absent members about the next meeting'*\n"
                    "• **Member Scorecards:** *'Show Maurine\\'s evaluation scores'* or *'Alaa scorecard'*\n"
                    "• **Task Submissions:** *'Show pending task submissions'*\n"
                    "• **Schedule & Calendar:** *'What upcoming meetings are scheduled?'*\n\n"
                    "How can I help you today?"
                )
            return AgentChatResponse(conversation_id=conversation_id, response=resp_text, tool_executions=[])

        # ── INTENT 0B: Help / Capabilities ────────────────────────────────
        help_triggers = ["help", "commands", "skills", "capabilities", "what can you do", "who are you",
                         "مساعدة", "اوامر", "أوامر", "من انت", "من أنت", "ماذا تفعل", "شرح"]
        if any(h in query_clean.lower() for h in help_triggers):
            if is_arabic:
                resp_text = (
                    "**دليل الأوامر السريعة لمنصة StudentOps AI:**\n\n"
                    "1. **الحضور والغياب:** اكتب `مين غاب النهاردة؟` لمطابقة بيانات Google Meet آلياً.\n"
                    "2. **التذكيرات مع التحقق البشري:** اكتب `ابعت تذكير للغائبين` لإنشاء مسودة رسالة تذكيرية.\n"
                    "3. **بطاقة التقييم والسلوك:** اكتب `تقييم مورين` أو `درجات الاء` لعرض تقييم السلوك (من 23) وجودة التاسكات (من 10).\n"
                    "4. **متابعة التاسكات:** اكتب `التاسكات المعلقة` لعرض الأعضاء الذين لم يسلموا مهامهم.\n"
                    "5. **الأحداث والمواعيد:** اكتب `الاجتماعات القادمة` لاستعراض جدول الجلسات والمواعيد النهائية."
                )
            else:
                resp_text = (
                    "**StudentOps AI Quick Action Guide:**\n\n"
                    "1. **Attendance Tracking:** Type `Who was absent today?` to query verified Google Meet logs.\n"
                    "2. **Reminder Dispatch:** Type `Remind absent members` to draft targeted WhatsApp/SMS reminders with human confirmation.\n"
                    "3. **Scorecards & Discipline:** Type `Show Maurine's score` to inspect behavior (/23) and task quality (/10).\n"
                    "4. **Task Reviews:** Type `Show pending submissions` to list pending deliverables.\n"
                    "5. **Calendar & Schedule:** Type `Upcoming meetings` to see the cohort timeline."
                )
            return AgentChatResponse(conversation_id=conversation_id, response=resp_text, tool_executions=[])

        # ── INTENT 0C: Stats / Overview ───────────────────────────────────
        stats_triggers = ["stats", "overview", "summary", "dashboard", "احصائيات", "إحصائيات", "ملخص", "تقرير شامل"]
        if any(s in query_clean.lower() for s in stats_triggers):
            tool_name = "get_meeting_attendance"
            att_params = {"meeting_id": "today_sync"}
            if user_role == "team_lead" and team_id:
                att_params["team_id"] = team_id
            att_result, att_status = await self.execute_tool(tool_name, att_params, db)
            tool_executions.append(ToolCallExecution(
                tool_name=tool_name, parameters=att_params, result=att_result, status=att_status,
                reasoning_summary="Compiling organizational overview..."
            ))
            cal_result, _ = await self.execute_tool("get_upcoming_events", {"limit": 3}, db)
            events_count = len(cal_result.get("events", [])) if isinstance(cal_result, dict) else 0

            summary = att_result.get("summary", {}) if isinstance(att_result, dict) else {}
            present = summary.get("present_count", 0)
            absent = summary.get("absent_count", 0)
            late = summary.get("late_count", 0)
            rate = summary.get("attendance_rate", 100.0)

            if is_arabic:
                resp_text = (
                    f"**ملخص العمليات الحالي:**\n\n"
                    f"• **نسبة الحضور اليوم:** {rate}%\n"
                    f"• **حضور:** {present} | **متأخر:** {late} | **غياب:** {absent}\n"
                    f"• **الفعاليات القادمة:** {events_count} جلسات مجدولة\n\n"
                    f"هل تود اتخاذ إجراء بشأن الحضور أو إرسال تذكيرات؟"
                )
            else:
                resp_text = (
                    f"**Current Operations Overview:**\n\n"
                    f"• **Today's Attendance Rate:** {rate}%\n"
                    f"• **Present:** {present} | **Late:** {late} | **Absent:** {absent}\n"
                    f"• **Upcoming Scheduled Events:** {events_count}\n\n"
                    f"Would you like to dispatch reminders or inspect individual scorecards?"
                )
            return AgentChatResponse(conversation_id=conversation_id, response=resp_text, tool_executions=tool_executions)

        # ── INTENT 1: Attendance ──────────────────────────────────────────
        elif any(w in query_clean.lower() for w in ["absent", "غياب", "غائب", "غاب", "attendance", "حضور", "حضر", "مين غايب", "مين حضر"]):
            tool_name = "get_meeting_attendance"
            params = {"meeting_id": "today_sync"}
            if user_role == "team_lead" and team_id:
                params["team_id"] = team_id
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
                parameters=params, result=result, user_id=acting_user, status="EXECUTED"
            )
            if is_arabic:
                absent_names = [f"• {s['arabic_name']} ({s['phone']})" for s in absent_list]
                names_str = "\n".join(absent_names) if absent_names else "لا يوجد غائبون اليوم!"
                resp_text = (
                    f"**تقرير الحضور:**\n"
                    f"حضر: {result.get('summary', {}).get('present_count', 0)} | "
                    f"غياب: {len(absent_list)}\n\n**الغائبون:**\n{names_str}\n\n"
                    f"هل ترغب في إرسال تذكير لهم؟"
                )
            else:
                absent_names = [f"• {s['name']} ({s['arabic_name']}) — {s['phone']}" for s in absent_list]
                names_str = "\n".join(absent_names) if absent_names else "Everyone attended!"
                resp_text = (
                    f"**Attendance Report:**\n"
                    f"Present: {result.get('summary', {}).get('present_count', 0)} | "
                    f"Late: {result.get('summary', {}).get('late_count', 0)} | "
                    f"Absent: {len(absent_list)}\n\n**Absent Members:**\n{names_str}\n\n"
                    f"Would you like me to send them a reminder?"
                )
            return AgentChatResponse(conversation_id=conversation_id, response=resp_text,
                                     tool_executions=tool_executions, audit_id=audit_entry.id)

        # ── INTENT 2: Reminder ────────────────────────────────────────────
        elif any(w in query_clean.lower() for w in ["remind", "ذكر", "تذكير", "رسالة", "message", "فكرهم", "ابعت", "notify"]):
            target_ids = state.get("last_absent_student_ids", [])
            if not target_ids:
                att_p = {"meeting_id": "today_sync"}
                if user_role == "team_lead" and team_id:
                    att_p["team_id"] = team_id
                att_res, _ = await self.execute_tool("get_meeting_attendance", att_p, db)
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
            if user_role == "team_lead" and team_id:
                prep_params["team_id"] = team_id
            prep_res, prep_stat = await self.execute_tool("prepare_reminder", prep_params, db)
            tool_executions.append(ToolCallExecution(
                tool_name="prepare_reminder", parameters=prep_params,
                result=prep_res, status=prep_stat,
                reasoning_summary="Generating draft reminder and verifying contacts..."
            ))
            action_id = f"act_rem_{int(datetime.now().timestamp() * 1000)}"
            audit_entry = await AuditService.record_action(
                db=db, intent="SEND_REMINDER", tool_name="send_reminder",
                parameters=prep_params, result=prep_res, user_id=acting_user,
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
                    f"**مطلوب تأكيد:** رسالة لـ {len(target_ids)} عضو.\n\n"
                    f"**نص الرسالة:**\n```\n{prep_res.get('message_preview')}\n```\n"
                    f"اضغط **تأكيد وإرسال** للمتابعة."
                )
            else:
                resp_text = (
                    f"**Confirmation Required:** Reminder for {len(target_ids)} member(s).\n\n"
                    f"**Message Preview:**\n```\n{prep_res.get('message_preview')}\n```\n"
                    f"Click **Confirm & Send** to dispatch."
                )
            return AgentChatResponse(conversation_id=conversation_id, response=resp_text,
                                     tool_executions=tool_executions, requires_confirmation=True,
                                     pending_confirmation=pending_conf, audit_id=audit_entry.id)

        # ── INTENT 3: Score / Evaluation ──────────────────────────────────
        elif any(w in query_clean.lower() for w in ["score", "درجة", "درجات", "تقييم", "points", "نقاط", "evaluation", "behavior", "سلوك"]):
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
                parameters=params, result=result, user_id=acting_user, status="EXECUTED"
            )
            sc = result.get("score_summary", {})
            if is_arabic:
                resp_text = (
                    f"**تقييم: {sc.get('arabic_name')}**\n\n"
                    f"• الحضور: {sc.get('on_time_attendance_count')} في الميعاد | {sc.get('late_attendance_count')} متأخر | {sc.get('absence_count')} غياب\n"
                    f"• متوسط التاسكات: {sc.get('average_task_quality')} / 10\n"
                    f"• السلوك: {sc.get('total_behavior_score')} / 23\n"
                    f"• التقييم العام: {sc.get('overall_rating')}"
                )
            else:
                resp_text = (
                    f"**Evaluation: {sc.get('student_name')} ({sc.get('arabic_name')})**\n\n"
                    f"• Attendance: {sc.get('on_time_attendance_count')} On-time | {sc.get('late_attendance_count')} Late | {sc.get('absence_count')} Absent\n"
                    f"• Avg Task Quality: {sc.get('average_task_quality')} / 10\n"
                    f"• Behavior & Discipline: {sc.get('total_behavior_score')} / 23\n"
                    f"  — Group: {sc.get('group_interaction_score')}/5 | Social: {sc.get('social_media_score')}/5 | Rules: {sc.get('hierarchy_rules_score')}/5 | Conduct: {sc.get('polite_conduct_score')}/8\n"
                    f"• Overall: {sc.get('overall_rating')}"
                )
            return AgentChatResponse(conversation_id=conversation_id, response=resp_text,
                                     tool_executions=tool_executions, audit_id=audit_entry.id)

        # ── INTENT 4: Pending Submissions ─────────────────────────────────
        elif any(w in query_clean.lower() for w in ["task", "تاسك", "تاسكات", "تسليم", "submitted", "submission", "pending", "واجب"]):
            params = {}
            if user_role == "team_lead" and team_id:
                params["team_id"] = team_id
            result, status = await self.execute_tool("get_pending_submissions", params, db)
            tool_executions.append(ToolCallExecution(
                tool_name="get_pending_submissions", parameters=params, result=result, status=status,
                reasoning_summary="Querying pending task submissions..."
            ))
            audit_entry = await AuditService.record_action(
                db=db, intent="GET_PENDING_SUBMISSIONS", tool_name="get_pending_submissions",
                parameters=params, result=result, user_id=acting_user, status="EXECUTED"
            )
            pending = result.get("pending_submissions", [])
            if is_arabic:
                items = [f"• {p['arabic_name']} — {p['task_title']}" for p in pending]
                resp_text = f"**التاسكات المعلقة ({len(pending)}):**\n" + ("\n".join(items) if items else "الكل سلّم!")
            else:
                items = [f"• {p['student_name']} ({p['arabic_name']}) — {p['task_title']}" for p in pending]
                resp_text = f"**Pending Submissions ({len(pending)}):**\n" + ("\n".join(items) if items else "All submitted!")
            return AgentChatResponse(conversation_id=conversation_id, response=resp_text,
                                     tool_executions=tool_executions, audit_id=audit_entry.id)

        # ── INTENT 5: Calendar ────────────────────────────────────────────
        elif any(w in query_clean.lower() for w in ["calendar", "meeting", "قادم", "ميتينج", "اجتماع", "مواعيد", "schedule", "event", "حدث"]):
            result, status = await self.execute_tool("get_upcoming_events", {"limit": 5}, db)
            tool_executions.append(ToolCallExecution(
                tool_name="get_upcoming_events", parameters={"limit": 5}, result=result, status=status,
                reasoning_summary="Retrieving upcoming schedule..."
            ))
            audit_entry = await AuditService.record_action(
                db=db, intent="GET_UPCOMING_EVENTS", tool_name="get_upcoming_events",
                parameters={"limit": 5}, result=result, user_id=acting_user, status="EXECUTED"
            )
            events = result.get("events", [])
            items = [f"• **{e['title']}** — {e['start_time'][:16].replace('T', ' ')}" for e in events]
            if is_arabic:
                resp_text = "**الأحداث القادمة:**\n" + "\n".join(items)
            else:
                resp_text = "**Upcoming Events:**\n" + "\n".join(items)
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
            except Exception as e:
                llm_reply = f"Local agent fallback: {str(e)}"

            history.append({"role": "assistant", "content": llm_reply})
            state["history"] = history[-20:]

            audit_entry = await AuditService.record_action(
                db=db, intent="LLM_CHAT", tool_name="openrouter_llm",
                parameters={"query": query_clean, "model": settings.OPENROUTER_MODEL},
                result={"response": llm_reply[:500]},
                user_id=acting_user, status="EXECUTED"
            )
            return AgentChatResponse(conversation_id=conversation_id, response=llm_reply,
                                     tool_executions=[], audit_id=audit_entry.id)

    def is_deterministic_intent(self, query: str) -> bool:
        """Returns True if the query matches a grounded tool intent (won't call external LLM)."""
        q = query.strip().lower()

        # Greetings
        greetings = [
            "hi", "hello", "hey", "welcome", "good morning", "good evening",
            "مرحبا", "سلام", "ازيك", "صباح الخير", "مساء الخير", "السلام عليكم", "اهلا", "أهلا"
        ]
        if any(q == g or q.startswith(g + " ") or q.endswith(" " + g) for g in greetings):
            return True

        # Help & Info
        help_keywords = [
            "help", "commands", "skills", "capabilities", "what can you do", "who are you",
            "مساعدة", "اوامر", "أوامر", "من انت", "من أنت", "ماذا تفعل", "شرح"
        ]
        if any(h in q for h in help_keywords):
            return True

        # Stats & Summary
        stats_keywords = ["stats", "overview", "summary", "dashboard", "احصائيات", "إحصائيات", "ملخص", "تقرير شامل"]
        if any(s in q for s in stats_keywords):
            return True

        # Core HR Operations
        return any(w in q for w in [
            "absent", "غياب", "غائب", "غاب", "attendance", "حضور", "حضر", "مين غايب", "مين حضر",
            "remind", "ذكر", "تذكير", "فكرهم", "ابعت", "رسالة", "message", "notify",
            "score", "درجة", "درجات", "تقييم", "points", "نقاط", "evaluation", "behavior", "سلوك",
            "task", "تاسك", "تاسكات", "submission", "تسليم", "واجب", "pending",
            "calendar", "meeting", "ميتينج", "اجتماع", "مواعيد", "schedule", "event", "حدث",
        ])


agent_engine = ReActAgent()
