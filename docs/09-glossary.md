# 09 — Glossary

Terms in the order a new engineer meets them. Where the code and the domain vocabulary disagree, the code wins and the disagreement is noted.

## Organisation

**Committee** — A unit of the student organisation with its own members, HR staff, tasks, and meetings. In the database this is a row in `teams` (`team_media`, `team_eng`, `team_ops`, `team_tech`). Sometimes called a "team" in code and column names. **[VERIFIED]** `entities.py:41`

**Team scope** — The authorization boundary for almost every query: a user may only see rows whose `team_id` matches their own. The single most important concept in the permission model. **[VERIFIED]**

**Cohort** — The subset of a committee's members assigned to a specific HR member, tracked in `students.assigned_hr_id`. "Assign a cohort" (`POST /api/students/assign-cohort`) is the HR Leader's main structural tool. **[VERIFIED]**

**Region** — The level above committees, occupied by `region_hr_head`. A region head has no `team_id` and sees everything. **[VERIFIED]**

**Organization-wide** — Visibility granted to `region_hr_head` and `hr_admin`. Derived from the role string, not from a null `team_id`, in most handlers. **[VERIFIED]**

## Roles

**Regional HR Head** (`region_hr_head`) — The oversight tier. Reads aggregated reports, acknowledges committee reports, has read-only oversight of member feedback, and can see the whole organization. Cannot create tasks, cannot run attendance, cannot read task submissions. **[VERIFIED]**

**HR Administrator** (`hr_admin`) — A legacy system-administrator role. Cross-committee access, creates teams, changes user roles, reads audit logs. Treated as organization-wide alongside `region_hr_head`. **[VERIFIED]**

**Committee HR Leader** (`committee_hr_leader`) — Owns a committee's HR function. Views cohort scores, reviews and actions member feedback, assigns cohorts, submits reports upward, monitors escalations. Cannot write technical scores and cannot read task submissions. **[VERIFIED]**

**Committee Head** (`committee_head`, alias `team_lead`) — The technical tier. Creates tasks and meetings, reviews submissions, assigns technical scores out of 10. **Strictly read-only on behavior scores** and **strictly blocked from member feedback**. **[VERIFIED]**

**Committee HR Member** (`committee_hr_member`) — The operational HR tier. Processes attendance, corrects statuses, writes behavior scores out of 23, chats over WhatsApp with their assigned cohort, owns follow-up flags. Blocked from task submissions and from feedback about themselves. **[VERIFIED]**

**Committee Member** (`committee_member`, alias `member`) — A regular member. Submits task work, sees their own attendance and their own reminders, files feedback about HR, asks questions. **Cannot see any score** and **cannot use the agent**. **[VERIFIED]**

**Role equivalence** — `ROLE_EQUIVALENTS` makes `committee_head`/`team_lead` and `committee_member`/`member` interchangeable in every role check. It is a bidirectional alias map, not a hierarchy. **[VERIFIED]** `dependencies.py:106-115`

**HR chat privileges** — The `mode="chat"` branch of `verify_student_access`. Required to open a per-HR WhatsApp conversation. `committee_hr_member` needs explicit assignment; a regular member is refused. **[VERIFIED]**

## Members and identity

**Student** (`students` table) — A member record, distinct from a `users` login account. Holds name, student code, email, phone, committee, and assigned HR. A user account is linked to at most one student record via `users.student_id`. **[VERIFIED]**

**User** (`users` table) — A login account with a role and an optional committee. Exists for staff and for members who have claimed a profile via invitation token. **[VERIFIED]**

**Student code** — A human-facing identifier such as `ST-2026-A1B2C3` or `CORE-2026-001`. Auto-generated at creation when not supplied, unique, and the preferred way to disambiguate an identity request to the agent. **[VERIFIED]**

**Identity resolution** — The multi-tier process of turning a free-text query into a `student_id`: exact id or code, then exact email, then normalized Arabic/Latin name matching via `IdentityMatcher`, then an `ILIKE` substring fallback. Returns an explicit `ambiguous` list rather than guessing when several students match. **[VERIFIED]**

**IdentityMatcher** — The name-matching component. Normalizes Arabic (أ إ آ → ا, ى → ي, ة → ه), strips bracketed text, and scores by token-set overlap. Requires at least two matching tokens, or a full match on a short name, to avoid false positives such as "ali" inside "khalid". Returns a confidence and a `matched_by` of `EXACT_EMAIL`, `ARABIC_NAME`, `LATIN_NAME`, or `AMBIGUOUS`. **[VERIFIED]**

**Assigned HR** — The `students.assigned_hr_id` pointer. It defines who owns a member's follow-up, who may write their behavior scores, and whose WhatsApp thread carries the conversation. **[VERIFIED]**

**Bilingual name** — `full_name` (Latin) and `arabic_name` (Arabic), both required on `students`. The UI shows the Arabic as primary in Cairo font with the Latin and student code secondary. **[VERIFIED]**

## Attendance

**Meeting** — A scheduled session with a `meeting_code`, a `start_time`, and a `duration_minutes` that acts as the denominator for the attendance percentage. **[VERIFIED]**

**Session number** — `meetings.session_number`, the ordinal within a series ("Session 3"). **[VERIFIED]**

**Participant session** — A raw join/leave record from Google Meet, stored in `participant_sessions` before any policy is applied. One member joining twice produces two rows. **[VERIFIED]**

**Match confidence** — The `IdentityMatcher` score attached to a participant session, between 0.0 and 1.0. 1.0 means an exact email match. **[VERIFIED]**

**Attendance record** — The processed outcome in `attendance_records`, one per member per meeting. Idempotent: reprocessing updates in place. **[VERIFIED]**

**The 70% rule** — A member is `PRESENT` if they joined within the late threshold (10 minutes) **and** attended at least 70% of the meeting duration. **[VERIFIED]** `attendance_service.py:evaluate_status`

**The 50% rule** — A member who joined late but attended at least 50% is `LATE`. Below 50% is `UNEXCUSED_ABSENT`. **[VERIFIED]**

**Late threshold** — `ATTENDANCE_LATE_THRESHOLD_MINUTES`, default 10. The join delay beyond which a member is not `PRESENT`. **[VERIFIED]**

**Statuses:**

| Value | Meaning |
|---|---|
| `PRESENT` | On time and at least 70% duration |
| `LATE` | Late but at least 50% duration |
| `UNEXCUSED_ABSENT` | No session, or under 50% duration, with no excuse |
| `EXCUSED_ACCEPTED` | HR approved the excuse; fully excused |
| `EXCUSED_MODERATE` | HR partially accepted the excuse |
| `EXCUSED_REJECTED` | HR rejected the excuse; treated as absent |

**[VERIFIED]** `entities.py:170`, `attendance_service.py:evaluate_status`

**Excuse** — A member-supplied reason for absence, stored on `attendance_records.excuse_reason` with an HR-set `excuse_status`. The excuse is **preserved across reprocessing**, so re-running the policy engine does not overwrite a manual decision. **[VERIFIED]**

**Policy version** — `attendance_records.policy_version`, currently always `v1.0`. Exists so a future rule change can be attributed to the rows it produced. **[VERIFIED]**

**Reprocess** — `POST /api/attendance/meetings/{id}/process`. Deletes and recreates participant sessions, re-matches, re-evaluates, and creates follow-up flags. Safe to call repeatedly. **[VERIFIED]**

## Tasks and submissions

**Task** — A deliverable with a `deadline`, a `max_score` (default 10), and a `score_rule`. Created by a Committee Head. **[VERIFIED]**

**Task number** — A sequential human-facing ordinal, assigned as `MAX(task_number) + 1`. Not concurrency-safe. **[VERIFIED]**

**Assignment** — A `TaskAssignment` or `MeetingAssignment` row linking a member to a task or meeting. Assignments drive both the submit permission model and the reminder targeting. **[VERIFIED]**

**Fail-closed** — A task created by HR with no assignments produces **no reminder candidates**, even if every member is missing it. A seeded legacy task with no assignments falls back to all active students. The `created_by_user_id IS NOT NULL` test is what distinguishes them. **[VERIFIED]** `routes_tasks.py:47-59`

**Submission** — A member's deliverable, tracked as one `submissions` row per (task, member). Created as `PENDING` on assignment, then set to `ON_TIME` or `LATE` on submit. **[VERIFIED]**

**Statuses:**

| Value | Meaning |
|---|---|
| `PENDING` | Assigned but not submitted. Also the value the system never leaves. |
| `ON_TIME` | Submitted at or before the deadline |
| `LATE` | Submitted after the deadline |
| `MISSED` | **Documented but never written by any endpoint.** Every unsubmitted assignment stays `PENDING`. |

**[VERIFIED]** `entities.py:203`, `routes_tasks.py`

**Review** — `PUT /api/tasks/submissions/{id}/review`. The Committee Head sets `score` and `technical_score` (mirrored), `reviewer_notes`, `reviewed_at`, and `graded_by_user_id`, and flips `PENDING` to `ON_TIME`. Rejects a score above `task.max_score` with 400. **[VERIFIED]**

**Technical score** — The task score out of 10, owned by the Committee Head. **[VERIFIED]**

**Deliverable / `file_url`** — A free-text field holding whatever URL the member submits. There is no file upload, no object storage, and no validation. A bare string, not a managed asset. **[VERIFIED]**

## Scoring

**Behavior score** — The composite out of **23** that measures conduct, not output. Composed of four categories. **[VERIFIED]**

| Category | Max | Written by |
|---|---|---|
| `GROUP_INTERACTION` | 5 | `committee_hr_member` |
| `SOCIAL_MEDIA` | 5 | `committee_hr_member` |
| `HIERARCHY_RULES` | 5 | `committee_hr_member` |
| `POLITE_CONDUCT` | 8 | `committee_hr_member` |

`ScoringService` sums exactly these four into `total_behavior_score`. **[VERIFIED]** `scoring_service.py:60-64`

**Interaction score** — A fifth category, `INTERACTION`, max 5, written by the same endpoint and returned as `interaction_score`. **Excluded from the /23 total** and documented as "separate from behavior /23". A deliberate, slightly confusing split. **[VERIFIED]** `schemas.py:53`, `scoring_service.py:61`

**Bonus** — Points awarded by the HR Leader, category `BONUS`, capped at 10 total per member. Returned as `bonus_points` and **not** added to `total_behavior_score`. **[VERIFIED]** `routes_students.py:383-427`

**Score record** — One `score_records` row per (student, category, month). This is the atomic unit; the summary is computed, never stored. **[VERIFIED]**

**Average task quality** — The mean of `submission.score` across all graded submissions, out of 10. `0.0` when nothing is graded. **[VERIFIED]**

**Overall rating** — A qualitative band, not a number:

| Rating | Condition |
|---|---|
| `Outstanding` | quality ≥ 8.5 **and** behavior ≥ 20 **and** zero absences |
| `Good` | quality ≥ 6.0 **and** behavior ≥ 15 **and** ≤ 2 absences |
| `Needs Improvement` | otherwise |

**[VERIFIED]** `scoring_service.py:72-78`

**Total score** — **Intentionally undefined.** `total_score` is always `null` and `total_score_status` is always `"PENDING_FORMULA_DEFINITION"`. The code contains a comment explaining that authoritative components are kept separate and no arithmetic weights are invented. Do not "fix" this by adding weights without an authoritative source. **[VERIFIED]** `scoring_service.py:66-70`

**Scoreboard** — The list of every student's `StudentScoreSummary`. Blocked entirely for `committee_member`. **[VERIFIED]**

**Score collection** — The deliberate split between two views of the same submissions: `GET /api/tasks/{id}/scores` gives HR numbers without files, and `GET /api/tasks/{id}/submissions` gives the Committee Head files. Each role is 403 on the other's endpoint. **[VERIFIED]**

## Communication

**Member feedback** (`member_feedbacks`) — A member's structured complaint or comment about an HR member, flowing **upward** to the HR Leader. Categories: `HR_INTERACTION`, `COMMUNICATION`, `ATTENDANCE_SUPPORT`, `BEHAVIOR_EVALUATION`, `CONDUCT`, `GENERAL_HR`. Statuses: `SUBMITTED` → `REVIEWED` → `ACTIONED`. **[VERIFIED]**

**Q&A** (`member_questions`) — A member's question to the Committee Head, with a single `answer` field. Statuses: `OPEN`, `ANSWERED`. **[VERIFIED]**

**Committee report** (`committee_reports`) — A formal upward submission from the HR Leader to the Regional HR Head. Contains a JSON **snapshot** of `get_committee_summary` at submission time, not a live link. **[VERIFIED]**

**Official channel** — The organisation's shared WhatsApp number, session `ops_official`. Used for broadcasts by `region_hr_head` and `hr_admin`. **[VERIFIED]**

**Per-HR session** — A separate WhatsApp session per HR member, `hr_{user.id}`. Keeps individual member conversations separate from the official channel. **[VERIFIED]**

**`wa.me` deep link** — A zero-trust alternative used by HR members from their personal phones: the server returns a pre-filled `wa.me` URL and no personal credentials touch the server. **[VERIFIED]** `routes_whatsapp.py:176-258`

**Acknowledgement status** — WhatsApp's delivery receipts, mapped to `ack_status`: 0 pending, 1 sent, 2 delivered, 3 read. **[VERIFIED]**

**Uncertain delivery** — `delivery_status = "UNKNOWN_PENDING"` with `is_uncertain: true`, returned as HTTP 200 so a retry loop does not double-send. A considered design choice. **[VERIFIED]**

## Reminders and automation

**Reminder** — A queued notification to a member about an absence, a task, or a meeting. **[VERIFIED]**

**Reminder log** (`reminder_logs`) — The record of a queued or sent reminder, including the full message body and the recipient phone. The **idempotency key** is `trigger_source`. **[VERIFIED]**

**`PENDING_APPROVAL`** — The `reminder_logs.status` used by the scheduler. It means "queued for human review". The scheduler **never transmits**; it only writes rows with this status. **[VERIFIED]**

**Trigger source** — How a reminder came about: `AI_AGENT`, `MANUAL`, `EVENTBRIDGE`, or `AUTOMATION_ATTENDANCE_{meeting_id}` / `AUTOMATION_TASK_PRE_{task_id}` / `AUTOMATION_TASK_POST_{task_id}` / `AUTOMATION_PRE_MEETING_{meeting_id}`. The automatic ones double as deduplication keys. **[VERIFIED]**

**Task reminder** (`task_reminders`) — The task-specific tracking row, distinct from the general `reminder_logs` entry. **[VERIFIED]**

**Stage 1 / Stage 2** — The two task reminder phases: stage 1 is the automated pre-deadline nudge (`task_pre_hours` before, default 24 h); stage 2 is the post-deadline escalation (`task_post_delay_hours` after, default 2 h). **[VERIFIED]**

**Automation settings** (`automation_settings`) — Per-HR-member configuration for the three automation cycles. One row per user, unique on `user_id`. Falls back to synthesized system defaults when absent. **[VERIFIED]**

**Template whitelist** — `render_template` only substitutes `{name}`, `{task_name}`, `{deadline}`, `{session_name}`, and `{meeting_time}`. No `eval`, no arbitrary format strings. **[VERIFIED]** `automation_service.py:41-66`

## Follow-up and escalation

**Follow-up flag** (`member_followup_statuses`) — A record that an HR member must contact a member about an absence or an overdue task. Created automatically by the attendance processor and the task cycle. **[VERIFIED]**

**Flagged reason** — `ABSENT_{meeting_code}` or `OVERDUE_TASK`. Constructs the attendance case in a form that can be cleared with a `LIKE '%ABSENT_{code}%'` check. **[VERIFIED]**

**Flagged at / last contacted at** — When the flag was raised, and when the HR member last used `generate-link` to reach out. **[VERIFIED]**

**SLA** — The three-day follow-up window. `days_open = (utcnow - flagged_at).days`; at 3 days or more, with `status != RESOLVED`, the response reports `is_escalated: true`. **[VERIFIED]** `routes_whatsapp.py:295-320`

**Escalation** — The escalation *flag* in the response. It is **computed at read time** and never persisted. The `is_escalated` column exists but is never written to `true` by application code. **[VERIFIED]**

**Statuses (as written, not as documented):**

| Value | Ever written? |
|---|---|
| `PENDING` | Yes — on flag creation |
| `CONTACTED` | Yes — by `POST /api/whatsapp/generate-link` |
| `RESOLVED` | **No.** No code path writes it. |
| `ESCALATED` | **No.** No code path writes it. |

**[VERIFIED]** by exhaustive grep of `backend/app/`

**Escalation notification** — **Does not exist.** Breaching the SLA changes a response field; it sends nothing. HR must poll `GET /api/whatsapp/escalations`. **[VERIFIED]**

## The agent

**ReAct agent** — The conversational assistant. Named for the Reasoning-and-Acting pattern, but implemented as a **keyword intent router with an LLM fallback**, not an iterative Thought/Action/Observation loop. **[VERIFIED]**

**Deterministic intent** — A query matching a hard-coded English or Arabic keyword list that is answered from the database with no LLM involvement. Operational answers are therefore exact and free. **[VERIFIED]**

**Tool** — A registered handler the agent can call. Fifteen exist; fourteen are read-only and one sends messages. **[VERIFIED]**

**Tool category** — `READ_ONLY` (13), `EXTERNAL_ACTION` (1: `send_reminder`), or `WRITE`. **`ToolCategory.WRITE` is declared but never used.** **[VERIFIED]**

**Permission context** — The frozen Pydantic model carrying `user_id`, `role`, `team_id`, and `is_admin_override` into every tool. The only channel for authorization into agent code, and immutable once constructed. **[VERIFIED]** `schemas.py:336-346`

**Admin override** — `is_admin_override`, true for `region_hr_head` and `hr_admin`. Grants unscoped access to every tool. **[VERIFIED]**

**Team scope in tools** — Every read tool filters `Student.team_id == context.team_id` and returns an explicit "Unauthorized: Missing team scope" message when `team_id` is absent. **[VERIFIED]**

**Human-in-the-loop (HITL)** — The confirmation barrier. The agent drafts, a human approves, the action executes. Enforced at three independent points. **[VERIFIED]**

**Pending confirmation** — The `AgentActionAudit` row with `status = PENDING_CONFIRMATION` that holds the drafted action until a human decides. **[VERIFIED]**

**Action ID** — `act_{epoch_milliseconds}`. The handle a client uses to confirm or reject a pending action. **[VERIFIED]**

**Agent action audit** (`agent_action_audits`) — The immutable record of every agent turn, tool call, and confirmation decision. Protected by database triggers: `DELETE` always raises, and `UPDATE` raises if `id`, `action_id`, `intent`, `tool_name`, or `parameters` would change. Only the status and result fields are mutable. **[VERIFIED]** `entities.py:475-546`

**Conversation state** — The in-memory message history, bounded to 1000 conversations with a 24-hour TTL, keyed `{user_id}:{conversation_id}` so two users sharing a conversation ID do not share history. Lost on restart. **[VERIFIED]**

**Intent 0A / 0B / 0C** — The greeting, help, and statistics intents handled before any operational logic. They return static or lightly-computed bilingual text. **[VERIFIED]**

## Security and infrastructure terms

**Access token** — A 30-minute HS256 JWT carrying `sub`, `email`, `role`, `team_id`, `type: "access"`. Stateless and not revocable. **[VERIFIED]**

**Refresh token** — A 30-day HS256 JWT carrying the same claims plus a `jti`. Only the `jti` is stored, in `refresh_sessions`, which is what makes revocation possible. **[VERIFIED]**

**Token rotation** — On every refresh, the old session is revoked and a new pair is issued. A replayed revoked token is treated as theft and revokes **every** session for that user. **[VERIFIED]**

**Token reuse detection** — That all-session revoke. Deliberate, and tested. **[VERIFIED]**

**Invitation token** — A single-use, expiring, SHA-256-hashed token binding a `students` row to a new `users` account. The raw token is shown once and never stored. Registration without one **never** links a student profile, even if the email matches. **[VERIFIED]**

**Account takeover prevention** — The invariant that knowing a member's email is never enough to claim their profile. Enforced by invitation-token binding, single use, and email equality against the student record. **[VERIFIED]**

**Rate limit** — An in-memory sliding-window log keyed on client IP. Per-process, so multiple workers multiply the effective limit, and it collapses to a single bucket behind a proxy. **[VERIFIED]**

**Fail closed** — When scope is uncertain, return nothing rather than everything. The consistent pattern across list handlers, tools, and `verify_student_access`. **[VERIFIED]**

**Redaction vs. filtering** — The distinction the codebase maintains: *filtering* omits rows a role may not see; *redaction* returns a row with sensitive fields set to `null`. A member receives their own submission with `score: null`, not a 403. **[VERIFIED]**

**IDOR** — Insecure Direct Object Reference: reading or writing an object by guessing its id. The dominant class of vulnerability in this system, and the target of `tests/security/test_05_idor_sweep.py` and 11 other security files. **[VERIFIED]**

**OpenWA** — An open-source headless WhatsApp gateway (`openwa/wa-automate`, WhatsApp Web.js) run as a Docker container. The project's only fully implemented third-party integration. **[VERIFIED]**

**Mock provider** — A deterministic in-memory stand-in for a live integration, selected when the environment is not production and messaging is not openwa. Keeps demos and tests offline. **[VERIFIED]**

**`create_all`** — SQLAlchemy's `Base.metadata.create_all`, which creates missing tables but **never alters** an existing one. What `init_db()` actually calls, in place of Alembic. The source of the most common deployment surprise. **[VERIFIED]** `database.py:87-91`

**PgBouncer transaction pooler** — Supabase's connection pooler on port 6543. Transaction pooling breaks prepared statements, so the driver caches are explicitly disabled for pooled URLs. **[VERIFIED]**

## Arabic terms appearing in the codebase

| Arabic | Transliteration | Meaning in context |
|---|---|---|
| الموارد البشرية | al-mawarid al-bashariyyah | Human resources (HR) |
| رئيس الموارد البشرية | ra'is al-mawarid al-bashariyyah | Head of HR |
| لجنة | lagna | Committee |
| لجنة السوشيال ميديا | lagnat al-sushial midya | Social Media Committee |
| رئيس اللجنة | ra'is al-lagna | Committee Head |
| عضو | udun | Member |
| عضو الموارد البشرية | udun al-mawarid al-bashariyyah | HR Member |
| تقييم | ta'qim | Evaluation / scorecard |
| درجات | darajat | Grades / scores |
| درجة | daraja | Score |
| نقاط | nuqat | Points |
| سلوك | suluk | Behaviour / conduct |
| حضور | hudur | Attendance (present) |
| غياب | ghiyab | Absence |
| غائب | gha'ib | Absent (person) |
| غايب | gha'ib (colloquial) | Absent |
| متأخر | muta'akhkhir | Late |
| حاضر | hadir | Present (person) |
| تذكير | tadhkir | Reminder |
| تاسكات | tasakat | Tasks (colloquial, transliterated) |
| تاسك | tasak | Task (singular, colloquial) |
| تسليمة | tasleemeh | Submission / deliverable |
| ميتينج | mitiing | Meeting (colloquial) |
| اجتماع | ijtimai' | Meeting / session (formal) |
| مواعيد | mawa'id | Appointments, schedule |
| بطاقة تقييم | baytat ta'qim | Scorecard |
| سجل حضور | sijul hudur | Attendance record |

**Note on register:** agent responses use Modern Standard Arabic with colloquial keywords accepted as triggers. Reminder templates in `automation_service.py` and `wa.me` links in `routes_whatsapp.py` are MSA with English appended for bilingual members. The greeting and help texts are fully bilingual with both scripts side by side. **[VERIFIED]**
