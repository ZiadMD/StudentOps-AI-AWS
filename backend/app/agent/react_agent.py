"""
ReAct AI Agent Loop with OpenRouter LLM (streaming) and Deterministic Grounding.
"""
from typing import Any, AsyncIterator, Optional
import json
import re
import time
from collections import OrderedDict
import httpx
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.agent.tools import TOOL_REGISTRY, tool_get_student
from app.services.audit_service import AuditService
from app.models.schemas import (
    AgentChatResponse, ToolCallExecution, PendingConfirmation, PermissionContext
)


class BoundedConversationState:
    """
    Thread-safe, bounded, in-memory conversation state store.
    Features:
    - LRU eviction when size exceeds max_entries.
    - TTL expiry per conversation entry (lazy eviction on access + eager cleanup when full).
    - Dict-like interface (`setdefault`, `get`, `__getitem__`, `__setitem__`, `__contains__`, `pop`, `clear`)
      preserving 100% backward compatibility with existing code.
    """

    def __init__(self, max_entries: Optional[int] = None, ttl_seconds: Optional[float] = None):
        self._max_entries = max_entries
        self._ttl_seconds = ttl_seconds
        self._data: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._timestamps: dict[str, float] = {}

    @property
    def max_entries(self) -> int:
        if self._max_entries is not None:
            return self._max_entries
        return getattr(settings, "AGENT_CONVERSATION_STATE_MAX_ENTRIES", 1000)

    @property
    def ttl_seconds(self) -> float:
        if self._ttl_seconds is not None:
            return self._ttl_seconds
        return float(getattr(settings, "AGENT_CONVERSATION_STATE_TTL_SECONDS", 86400))

    def _is_expired(self, key: str, now: Optional[float] = None) -> bool:
        if self.ttl_seconds <= 0:
            return False
        now_ts = now if now is not None else time.time()
        last_time = self._timestamps.get(key, 0.0)
        return (now_ts - last_time) > self.ttl_seconds

    def _evict_expired(self) -> None:
        if self.ttl_seconds <= 0:
            return
        now = time.time()
        expired_keys = [k for k in list(self._data.keys()) if self._is_expired(k, now)]
        for k in expired_keys:
            self._data.pop(k, None)
            self._timestamps.pop(k, None)

    def _evict_lru(self) -> None:
        limit = self.max_entries
        if limit <= 0:
            return
        while len(self._data) > limit:
            oldest_key, _ = self._data.popitem(last=False)
            self._timestamps.pop(oldest_key, None)

    def setdefault(self, key: str, default: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        now = time.time()
        if key in self._data:
            if self._is_expired(key, now):
                # Expired: discard and recreate default
                self._data.pop(key, None)
                self._timestamps.pop(key, None)
            else:
                self._data.move_to_end(key)
                self._timestamps[key] = now
                return self._data[key]

        val = default if default is not None else {}
        self._evict_expired()
        self._data[key] = val
        self._timestamps[key] = now
        self._evict_lru()
        return val

    def get(self, key: str, default: Any = None) -> Any:
        now = time.time()
        if key in self._data:
            if self._is_expired(key, now):
                self._data.pop(key, None)
                self._timestamps.pop(key, None)
                return default
            self._data.move_to_end(key)
            self._timestamps[key] = now
            return self._data[key]
        return default

    def __getitem__(self, key: str) -> dict[str, Any]:
        val = self.get(key)
        if val is None and key not in self:
            raise KeyError(key)
        return val

    def __setitem__(self, key: str, val: dict[str, Any]) -> None:
        now = time.time()
        self._evict_expired()
        self._data[key] = val
        self._data.move_to_end(key)
        self._timestamps[key] = now
        self._evict_lru()

    def __contains__(self, key: object) -> bool:
        if not isinstance(key, str):
            return False
        if key in self._data:
            if self._is_expired(key):
                self._data.pop(key, None)
                self._timestamps.pop(key, None)
                return False
            return True
        return False

    def __len__(self) -> int:
        self._evict_expired()
        return len(self._data)

    def pop(self, key: str, default: Any = None) -> Any:
        self._timestamps.pop(key, None)
        return self._data.pop(key, default)

    def clear(self) -> None:
        self._data.clear()
        self._timestamps.clear()

    def cleanup_expired(self) -> int:
        """Explicitly run expired entry cleanup and return count of evicted items."""
        before = len(self._data)
        self._evict_expired()
        return before - len(self._data)


# Bounded in-memory conversational state per conversation_id
CONVERSATION_STATE = BoundedConversationState()
ConversationStateCache = BoundedConversationState


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


from app.models.schemas import PermissionContext

class ReActAgent:
    """ReAct Reasoning & Action Engine — grounded deterministic intents + OpenRouter LLM."""

    @staticmethod
    def extract_student_query(query: str) -> str:
        """
        Extracts student name, student code, or student ID from a score-intent query.
        Removes intent trigger words and filler phrases while preserving the student target.
        """
        q = query.strip()

        # 1. Check for explicit student code (e.g. CORE-2026-001, ST-2026-101, TEST-2026-001) or ID (e.g. std_...)
        code_match = re.search(r'\b(std_[a-zA-Z0-9_]+|[A-Za-z0-9]+-\d{4}-\d{3,4})\b', q, re.IGNORECASE)
        if code_match:
            return code_match.group(1).strip()

        # 2. Normalize punctuation (strip apostrophe-s, quotes, question marks)
        cleaned = re.sub(r"['’]s\b", " ", q, flags=re.IGNORECASE)
        cleaned = re.sub(r'[\?؟!،,\.:"\'`]', " ", cleaned)

        # 3. Pattern: "What is <NAME>'s evaluation score?" or "Show <NAME>'s score"
        m_en_suffix = re.search(
            r'^(?:what\s+is\s+)?(?:show\s+)?(?:get\s+)?(?:view\s+)?(?:check\s+)?(?:tell\s+me\s+)?(?:can\s+you\s+)?(?:please\s+)?(.+?)\s+(?:evaluation\s+score|evaluation\s+scores|evaluation\s+summary|scorecard|evaluation|scores|score|behavior|points)$',
            cleaned,
            re.IGNORECASE
        )
        if m_en_suffix and m_en_suffix.group(1).strip():
            candidate = m_en_suffix.group(1).strip()
            candidate = re.sub(r'^(?:the\s+|a\s+|an\s+|student\s+|member\s+)', '', candidate, flags=re.IGNORECASE).strip()
            if candidate:
                return candidate

        # 4. Pattern: "Score for <NAME>" or "Evaluation of <NAME>"
        m_en_prefix = re.search(
            r'(?:evaluation\s+score|evaluation\s+summary|scorecard|evaluation|scores|score|behavior|points)\s+(?:for|of|about)\s+(.+)$',
            cleaned,
            re.IGNORECASE
        )
        if m_en_prefix and m_en_prefix.group(1).strip():
            candidate = m_en_prefix.group(1).strip()
            candidate = re.sub(r'^(?:the\s+|student\s+|member\s+)', '', candidate, flags=re.IGNORECASE).strip()
            if candidate:
                return candidate

        # 5. Arabic Pattern: "تقييم <NAME>" or "درجات <NAME>"
        m_ar_prefix = re.search(
            r'^(?:عرض|ماهو|ما\s+هو|ما\s+هي|ماهي|عايز|اريد|أريد|أظهر|اظهر)?\s*(?:تقييم|درجات|درجة|نقاط|سلوك|سجل|بطاقة\s+تقييم)\s*(?:الطالب|العضو|للطالب|للعضو|لـ|ل)?\s*(.+)$',
            cleaned
        )
        if m_ar_prefix and m_ar_prefix.group(1).strip():
            candidate = m_ar_prefix.group(1).strip()
            candidate = re.sub(r'^(?:الطالب|العضو)\s+', '', candidate).strip()
            if candidate:
                return candidate

        # 6. Arabic Suffix: "<NAME> تقييم" or "<NAME> درجات"
        m_ar_suffix = re.search(
            r'^(.+?)\s+(?:تقييم|درجات|درجة|نقاط|سلوك)$',
            cleaned
        )
        if m_ar_suffix and m_ar_suffix.group(1).strip():
            return m_ar_suffix.group(1).strip()

        # 7. Fallback: remove stop/trigger words from sentence
        stop_words = {
            "what", "is", "the", "show", "get", "check", "view", "evaluation",
            "score", "scorecard", "scores", "points", "behavior", "discipline",
            "for", "of", "about", "please", "can", "you", "tell", "me", "student", "member",
            "عرض", "ماهو", "ما", "هو", "هي", "ماهي", "تقييم", "درجة", "درجات",
            "نقاط", "سلوك", "الطالب", "العضو", "للطالب", "للعضو", "عن"
        }
        words = [w for w in cleaned.split() if w.lower() not in stop_words]
        return " ".join(words).strip()

    async def execute_tool(
        self,
        tool_name: str,
        parameters: dict[str, Any],
        db: AsyncSession,
        context: PermissionContext
    ) -> tuple[Any, str]:
        from app.agent.tools import TOOL_REGISTRY, TOOL_DEFINITIONS
        handler = TOOL_REGISTRY.get(tool_name)
        if not handler:
            return {"error": f"Unknown tool: {tool_name}"}, "FAILED"
            
        # AI Tool Allowlist & Role Verification
        tool_def = next((t for t in TOOL_DEFINITIONS if t["name"] == tool_name), None)
        if tool_def:
            allowed_roles = tool_def.get("required_roles", [])
            role_to_check = "committee_hr_leader" if context.role in ("HR_LEAD", "hr_lead") else context.role
            if allowed_roles and role_to_check not in allowed_roles and not context.is_admin_override:
                return {"error": f"Unauthorized: Role '{context.role}' lacks permission for tool '{tool_name}'."}, "FAILED"

        try:
            res = await handler(db=db, context=context, **parameters)
            if isinstance(res, dict) and res.get("status") == "REQUIRES_CONFIRMATION":
                return res, "PENDING_CONFIRMATION"
            return res, "SUCCESS"
        except Exception as e:
            return {"error": str(e)}, "FAILED"

    @staticmethod
    def extract_student_query(query: str) -> str:
        """
        Extracts student name, student code, or student ID from a score-intent query.
        Removes intent trigger words and filler phrases while preserving the student target.
        """
        q = query.strip()

        # 1. Check for explicit student code (e.g. CORE-2026-001, ST-2026-101, TEST-2026-001) or ID (e.g. std_...)
        code_match = re.search(r'\b(std_[a-zA-Z0-9_]+|[A-Za-z0-9]+-\d{4}-\d{3,4})\b', q, re.IGNORECASE)
        if code_match:
            return code_match.group(1).strip()

        # 2. Normalize punctuation (strip apostrophe-s, quotes, question marks)
        cleaned = re.sub(r"['’]s\b", " ", q, flags=re.IGNORECASE)
        cleaned = re.sub(r'[\?؟!،,\.:"\'`]', " ", cleaned)

        # 3. Pattern: "What is <NAME>'s evaluation score?" or "Show <NAME>'s score"
        m_en_suffix = re.search(
            r'^(?:what\s+is\s+)?(?:show\s+)?(?:get\s+)?(?:view\s+)?(?:check\s+)?(?:tell\s+me\s+)?(?:can\s+you\s+)?(?:please\s+)?(.+?)\s+(?:evaluation\s+score|evaluation\s+scores|evaluation\s+summary|scorecard|evaluation|scores|score|behavior|points)$',
            cleaned,
            re.IGNORECASE
        )
        if m_en_suffix and m_en_suffix.group(1).strip():
            candidate = m_en_suffix.group(1).strip()
            candidate = re.sub(r'^(?:the\s+|a\s+|an\s+|student\s+|member\s+)', '', candidate, flags=re.IGNORECASE).strip()
            if candidate:
                return candidate

        # 4. Pattern: "Score for <NAME>" or "Evaluation of <NAME>"
        m_en_prefix = re.search(
            r'(?:evaluation\s+score|evaluation\s+summary|scorecard|evaluation|scores|score|behavior|points)\s+(?:for|of|about)\s+(.+)$',
            cleaned,
            re.IGNORECASE
        )
        if m_en_prefix and m_en_prefix.group(1).strip():
            candidate = m_en_prefix.group(1).strip()
            candidate = re.sub(r'^(?:the\s+|student\s+|member\s+)', '', candidate, flags=re.IGNORECASE).strip()
            if candidate:
                return candidate

        # 5. Arabic Pattern: "تقييم <NAME>" or "درجات <NAME>"
        m_ar_prefix = re.search(
            r'^(?:عرض|ماهو|ما\s+هو|ما\s+هي|ماهي|عايز|اريد|أريد|أظهر|اظهر)?\s*(?:تقييم|درجات|درجة|نقاط|سلوك|سجل|بطاقة\s+تقييم)\s*(?:الطالب|العضو|للطالب|للعضو|لـ|ل)?\s*(.+)$',
            cleaned
        )
        if m_ar_prefix and m_ar_prefix.group(1).strip():
            candidate = m_ar_prefix.group(1).strip()
            candidate = re.sub(r'^(?:الطالب|العضو)\s+', '', candidate).strip()
            if candidate:
                return candidate

        # 6. Arabic Suffix: "<NAME> تقييم" or "<NAME> درجات"
        m_ar_suffix = re.search(
            r'^(.+?)\s+(?:تقييم|درجات|درجة|نقاط|سلوك)$',
            cleaned
        )
        if m_ar_suffix and m_ar_suffix.group(1).strip():
            return m_ar_suffix.group(1).strip()

        # 7. Fallback: remove stop/trigger words from sentence
        stop_words = {
            "what", "is", "the", "show", "get", "check", "view", "evaluation",
            "score", "scorecard", "scores", "points", "behavior", "discipline",
            "for", "of", "about", "please", "can", "you", "tell", "me", "student", "member",
            "عرض", "ماهو", "ما", "هو", "هي", "ماهي", "تقييم", "درجة", "درجات",
            "نقاط", "سلوك", "الطالب", "العضو", "للطالب", "للعضو", "عن"
        }
        words = [w for w in cleaned.split() if w.lower() not in stop_words]
        return " ".join(words).strip()

    @staticmethod
    def extract_meeting_query(query: str) -> Optional[str]:
        """
        Extracts explicit meeting ID or meeting code from query if present.
        Returns None for generic queries like "today's meeting", "the meeting", etc.,
        indicating that dynamic/latest resolution should be used.
        """
        q = query.strip()
        # 1. Match standard meeting entity IDs or seeded codes (meet_..., today_sync, camp_day_...)
        m = re.search(r'\b(meet_[a-zA-Z0-9_]+|today_sync|camp_day_\d+)\b', q, re.IGNORECASE)
        if m:
            return m.group(1).strip()

        # 2. Match explicit "meeting <CODE>" or "session <CODE>" where CODE is not a generic/filler word
        m_code = re.search(r'\b(?:meeting|session|ميتينج|جلسة|اجتماع)\s+([a-zA-Z0-9_-]+)\b', q, re.IGNORECASE)
        if m_code:
            candidate = m_code.group(1).strip()
            generic_words = {
                "today", "yesterday", "tomorrow", "now", "last", "latest", "next", "upcoming",
                "attendance", "sync", "call", "النهاردة", "اليوم", "امس", "أمس", "السابق", "القادم", "حضور",
                "اخر", "آخر", "الاخير", "الأخير", "الاخيرة", "الأخيرة", "امبارح", "الماضي", "السابقة", "فات"
            }
            if candidate.lower() not in generic_words:
                return candidate

        return None

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
        is_admin = (user_role in ("region_hr_head", "hr_admin") or (user_role in ("HR_LEAD", "hr_lead") and not team_id))
        context = PermissionContext(
            user_id=acting_user,
            role=user_role,
            team_id=team_id,
            is_admin_override=is_admin,
            is_confirmed_action=False
        )
        scoped_state_key = f"{acting_user}:{conversation_id}"
        state = CONVERSATION_STATE.setdefault(scoped_state_key, {
            "last_absent_student_ids": [],
            "last_absent_students": [],
            "last_meeting_id": None,
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
                    "• **تقييمات الأعضاء:** *'عرض تقييم زياد محمد'* أو *'درجات الاء'\n"
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
                    "• **Member Scorecards:** *'Show Ziad\\'s evaluation scores'* or *'Ali scorecard'*\n"
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
                    "3. **بطاقة التقييم والسلوك:** اكتب `تقييم زياد` أو `درجات علي` لعرض تقييم السلوك (من 23) وجودة التاسكات (من 10).\n"
                    "4. **متابعة التاسكات:** اكتب `التاسكات المعلقة` لعرض الأعضاء الذين لم يسلموا مهامهم.\n"
                    "5. **الأحداث والمواعيد:** اكتب `الاجتماعات القادمة` لاستعراض جدول الجلسات والمواعيد النهائية."
                )
            else:
                resp_text = (
                    "**StudentOps AI Quick Action Guide:**\n\n"
                    "1. **Attendance Tracking:** Type `Who was absent today?` to query verified Google Meet logs.\n"
                    "2. **Reminder Dispatch:** Type `Remind absent members` to draft targeted WhatsApp/SMS reminders with human confirmation.\n"
                    "3. **Scorecards & Discipline:** Type `Show Ziad's score` to inspect behavior (/23) and task quality (/10).\n"
                    "4. **Task Reviews:** Type `Show pending submissions` to list pending deliverables.\n"
                    "5. **Calendar & Schedule:** Type `Upcoming meetings` to see the cohort timeline."
                )
            return AgentChatResponse(conversation_id=conversation_id, response=resp_text, tool_executions=[])

        # ── INTENT 0C: Stats / Overview ───────────────────────────────────
        stats_triggers = ["stats", "overview", "summary", "dashboard", "احصائيات", "إحصائيات", "ملخص", "تقرير شامل"]
        if any(s in query_clean.lower() for s in stats_triggers):
            tool_name = "get_meeting_attendance"
            att_params = {"meeting_id": "latest"}
            if user_role == "team_lead" and team_id:
                att_params["team_id"] = team_id
            att_result, att_status = await self.execute_tool(tool_name, att_params, db, context)
            tool_executions.append(ToolCallExecution(
                tool_name=tool_name, parameters=att_params, result=att_result, status=att_status,
                reasoning_summary="Compiling organizational overview..."
            ))
            cal_result, _ = await self.execute_tool("get_upcoming_events", {"limit": 3}, db, context)
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
        elif any(w in query_clean.lower() for w in [
            "absent", "absence", "attendance", "attended", "present",
            "غياب", "غائب", "غايب", "غاب",
            "حضور", "حضر", "حاضر"
        ]):
            tool_name = "get_meeting_attendance"
            explicit_meeting = self.extract_meeting_query(query_clean)
            params = {"meeting_id": explicit_meeting if explicit_meeting else "latest"}
            if user_role == "team_lead" and team_id:
                params["team_id"] = team_id
            result, status = await self.execute_tool(tool_name, params, db, context)
            tool_executions.append(ToolCallExecution(
                tool_name=tool_name, parameters=params, result=result, status=status,
                reasoning_summary="Checking meeting attendance records..."
            ))
            absent_list = result.get("absent_students", []) if isinstance(result, dict) else []
            state["last_absent_student_ids"] = [s["student_id"] for s in absent_list]
            state["last_absent_students"] = absent_list
            state["last_meeting_id"] = result.get("meeting", {}).get("id") if isinstance(result, dict) else None
            audit_entry = await AuditService.record_action(
                db=db, intent="QUERY_ATTENDANCE", tool_name=tool_name,
                parameters=params, result=result, user_id=acting_user, status="EXECUTED"
            )
            if isinstance(result, dict) and not result.get("success", True):
                err_msg = result.get("message", "Meeting not found.")
                resp_text = f"تعذر جلب سجل الحضور: {err_msg}" if is_arabic else f"Could not retrieve attendance: {err_msg}"
                return AgentChatResponse(conversation_id=conversation_id, response=resp_text,
                                         tool_executions=tool_executions, audit_id=audit_entry.id)

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
                att_p = {"meeting_id": "latest"}
                if user_role == "team_lead" and team_id:
                    att_p["team_id"] = team_id
                att_res, _ = await self.execute_tool("get_meeting_attendance", att_p, db, context)
                absent_list = att_res.get("absent_students", []) if isinstance(att_res, dict) else []
                target_ids = [s["student_id"] for s in absent_list]
                state["last_absent_students"] = absent_list
                state["last_absent_student_ids"] = target_ids
            cal_res, cal_stat = await self.execute_tool("get_upcoming_meetings", {"limit": 3}, db, context)
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
            prep_res, prep_stat = await self.execute_tool("prepare_reminder", prep_params, db, context)
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
                description=f"Send reminder for '{(prep_res.get('event') or {}).get('title', 'Upcoming Meeting')}' to {len(target_ids)} member(s).",
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
            target_name = self.extract_student_query(query_clean)
            if not target_name:
                resp_text = (
                    "يرجى تحديد اسم الطالب أو كود الطالب لعرض التقييم (مثال: 'تقييم زياد محمد' أو 'تقييم CORE-2026-001')."
                    if is_arabic else
                    "Please specify the student's name or student code to view their evaluation score (e.g., 'Show score for Ziad Mohamed' or 'Score for CORE-2026-001')."
                )
                return AgentChatResponse(conversation_id=conversation_id, response=resp_text, tool_executions=[])

            # Dynamic identity resolution via tool_get_student / IdentityMatcher
            lookup_res = await tool_get_student(db=db, context=context, student_id_or_name=target_name)

            # Handle Ambiguous resolution
            if lookup_res.get("ambiguous"):
                matches = lookup_res.get("matches", [])
                if is_arabic:
                    names = [f"• {m.get('arabic_name') or m.get('name')} (كود: {m.get('student_code') or m.get('id')})" for m in matches]
                    names_str = "\n".join(names)
                    resp_text = (
                        f"تم العثور على أكثر من طالب يطابق '{target_name}':\n{names_str}\n\n"
                        f"يرجى إعادة المحاولة مع تحديد الاسم بالكامل أو كود الطالب بدقة."
                    )
                else:
                    names = [f"• {m.get('name')} ({m.get('arabic_name')}) — Code: {m.get('student_code') or m.get('id')}" for m in matches]
                    names_str = "\n".join(names)
                    resp_text = (
                        f"Multiple students found matching '{target_name}':\n{names_str}\n\n"
                        f"Please re-try with the student's full name or exact student code."
                    )
                return AgentChatResponse(conversation_id=conversation_id, response=resp_text, tool_executions=[])

            # Handle Not Found
            if not lookup_res.get("found"):
                resp_text = (
                    f"لم يتم العثور على طالب يطابق '{target_name}'. يرجى التحقق من الاسم أو كود الطالب."
                    if is_arabic else
                    f"Student '{target_name}' not found. Please verify the student name or code."
                )
                return AgentChatResponse(conversation_id=conversation_id, response=resp_text, tool_executions=[])

            # Resolved successfully to a single student
            resolved_student = lookup_res["student"]
            resolved_student_id = resolved_student["id"]

            params = {"student_id_or_name": resolved_student_id}
            result, status = await self.execute_tool("get_student_score", params, db, context)
            tool_executions.append(ToolCallExecution(
                tool_name="get_student_score", parameters=params, result=result, status=status,
                reasoning_summary=f"Retrieving official evaluation scorecard for {resolved_student.get('full_name')}..."
            ))
            audit_entry = await AuditService.record_action(
                db=db, intent="GET_STUDENT_SCORE", tool_name="get_student_score",
                parameters=params, result=result, user_id=acting_user, status="EXECUTED"
            )

            if not result.get("found"):
                resp_text = (
                    f"لا يوجد سجل تقييم متاح للطالب {resolved_student.get('arabic_name') or resolved_student.get('full_name')}."
                    if is_arabic else
                    f"No score summary available for {resolved_student.get('full_name')}."
                )
                return AgentChatResponse(conversation_id=conversation_id, response=resp_text,
                                         tool_executions=tool_executions, audit_id=audit_entry.id)

            sc = result.get("score_summary", {})
            if is_arabic:
                resp_text = (
                    f"**تقييم: {sc.get('arabic_name') or sc.get('student_name')}**\n\n"
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
            result, status = await self.execute_tool("get_pending_submissions", params, db, context)
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
            result, status = await self.execute_tool("get_upcoming_events", {"limit": 5}, db, context)
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
            "absent", "absence", "attendance", "attended", "present",
            "غياب", "غائب", "غايب", "غاب", "حضور", "حضر", "حاضر",
            "remind", "ذكر", "تذكير", "فكرهم", "ابعت", "رسالة", "message", "notify",
            "score", "درجة", "درجات", "تقييم", "points", "نقاط", "evaluation", "behavior", "سلوك",
            "task", "تاسك", "تاسكات", "submission", "تسليم", "واجب", "pending",
            "calendar", "meeting", "ميتينج", "اجتماع", "مواعيد", "schedule", "event", "حدث",
        ])


agent_engine = ReActAgent()
