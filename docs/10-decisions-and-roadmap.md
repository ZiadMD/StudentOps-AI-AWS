# 10 — Decisions and Roadmap

ADRs reconstructed from the code. Where the reasoning is not recoverable from the code, it is marked **[INFERRED]** or **[UNKNOWN]** rather than invented.

---

## ADR-001 — Deterministic policy engines, not LLM reasoning, for attendance and scoring

**Context.** Attendance and scores are HR decisions with financial and disciplinary consequences. An LLM that hallucinates an absence rate or a score is unacceptable.

**Decision.** Two pure-function engines compute the results: `AttendancePolicyEngine.evaluate_status` (70% / 50% / 10-minute rules) and `ScoringService` (behavior /23, rating bands). Both are threshold-driven and unit-tested.

**Trade-offs.** Rules are auditable and reproducible. Changing a policy means a code change and a redeploy. The `late_threshold_minutes` parameter is threaded through the engine but no endpoint exposes it, so per-meeting grace periods are not actually configurable.

**Evidence.** `attendance_service.py:evaluate_status`, `scoring_service.py`, `tests/unit/test_attendance_policy.py`, `tests/unit/test_scoring.py`. **[VERIFIED]**

---

## ADR-002 — The agent routes on keywords; the LLM never selects a tool

**Context.** LLM function-calling lets a model choose which tool to call, which is flexible and is the standard ReAct pattern. It is also the mechanism by which a prompt injection reaches a write action.

**Decision.** `ReActAgent.run_step` matches hard-coded English and Arabic keyword lists and calls a fixed tool set per intent. The LLM is invoked **only** when no keyword matches, and on that path no tool is ever executed. The system prompt explicitly forbids fabricating student data.

**Trade-offs.** Operational answers are exact, free, and injection-resistant. Novel phrasings silently fall through to the LLM, which cannot answer operational questions — so an unrecognised phrasing produces a non-answer rather than a wrong answer. That is the right failure direction, but the keyword lists are brittle and substring-based, so `"meeting"` inside an unrelated word matches. Adding a capability means editing a list, not writing a function.

**Evidence.** `react_agent.py:run_step`, `is_deterministic_intent`, `prompts.py`. **[VERIFIED]**

---

## ADR-003 — Three independent enforcement points for the HITL barrier

**Context.** A single confirmation check is one bug away from an unauthorized broadcast to real students.

**Decision.** Defence in depth at three layers: (1) `run_step` never calls `send_reminder`, only `prepare_reminder`; (2) `tool_send_reminder` itself refuses unless `is_confirmed`; (3) `/api/agent/confirm` re-verifies team scope on the stored `student_ids` before executing.

**Trade-offs.** More code, more state, but any single failure is contained. The cost is a `PENDING_CONFIRMATION` row that can be stranded if the process dies mid-send.

**Evidence.** `react_agent.py` INTENT 2, `tools.py:tool_send_reminder`, `routes_agent.py:167-262`, `tests/security/test_06_ai_agent_hitl.py`. **[VERIFIED]**

---

## ADR-004 — A "user-supplied role" is ignored; the server decides

**Context.** `UserRegisterRequest` accepts a `role` field, which invites the question of whether registration can self-assign privilege.

**Decision.** `register_user` hard-codes `role="member"` with a comment calling it "non-negotiable server-side enforcement". The submitted value is accepted by the schema and discarded. Elevation is only possible through `PATCH /api/auth/users/{id}/role`, which requires `hr_admin`, and which refuses to demote the last active admin.

**Trade-offs.** The schema field is a lie to anyone reading the OpenAPI document. Leaving it in keeps a placeholder for an admin-driven creation path that does not exist. The behaviour is correct; the contract is misleading.

**Evidence.** `routes_auth.py:170-176`, `schemas.py:461`, `tests/security/test_09_account_takeover.py`. **[VERIFIED]**

---

## ADR-005 — Student profiles are claimed by invitation token, never by email

**Context.** The natural implementation is "on registration, if the email matches a `students` row, link them." That is a textbook account-takeover vector: anyone who knows a member's email can claim their identity and, with it, their attendance and score history.

**Decision.** Registration links a student profile **only** with a valid `invitation_token` that is single-use, unexpired, and whose bound email matches the registering email exactly. Email equality alone is never sufficient. The same check guards `POST /api/auth/link-student`. The raw token is returned once; only its SHA-256 hash is stored.

**Trade-offs.** An HR member must issue an invitation before a member can claim their profile. That is friction by design. The alternative is unacceptable.

**Evidence.** `routes_auth.py:106-166`, `routes_auth.py:552-616`, `core/security.py:112-134`, `tests/security/test_09_account_takeover.py`, `tests/security/test_registration_account_takeover_prevention.py`. **[VERIFIED]** This is the best-executed security decision in the codebase.

---

## ADR-006 — Authorization is layered: role gate, then object gate, then row filter

**Context.** A single check is either too coarse (everyone in a role sees everything) or too fine (every handler reimplements role logic).

**Decision.** Three independent layers, each applied consistently: `require_roles([...])` as a route dependency for the coarse gate; `verify_student_access(student_id, user, db, mode)` or an inline `team_id` comparison for the object gate; a `WHERE` clause for the row gate. Null `team_id` fails closed to an empty result.

**Trade-offs.** Correct and testable, but the same rule is now expressed three ways in thirty places. Adding a role requires auditing every `require_roles` call by hand, because the hierarchy is not structural. Three different failure conventions exist for a scope violation (403, `[]`, and a 200 with a message) which is inconsistent but not unsafe.

**Evidence.** `dependencies.py`, and every `routes_*.py`. `tests/security/` — 20 files. **[VERIFIED]**

---

## ADR-007 — Scores and submissions are separated into mutually exclusive views

**Context.** HR cares about behaviour; the technical Committee Head cares about deliverables. Neither should see the other's raw material.

**Decision.** Two endpoints over the same `submissions` rows: `GET /api/tasks/{id}/scores` returns `TaskScoreItemSchema` (no `file_url`) and 403s every HR role. `GET /api/tasks/{id}/submissions` returns `SubmissionSchema` and 403s every HR role. Each role is explicitly blocked from the other's view. Behavior scores are written only by `committee_hr_member`; technical scores only by `committee_head`.

**Trade-offs.** A clean confidentiality boundary, verified by `test_10_hr_task_score.py` and `test_task_score_authorization.py`. The cost is that no single role can see a submission's complete grading, and the `TaskScoreItemSchema` docstring has to explain why `file_url` is absent.

**Evidence.** `routes_tasks.py:308-382` and `385-449`, `routes_students.py:261-268`, `schemas.py:169-176`. **[VERIFIED]**

---

## ADR-008 — Committee Head is read-only on behavior scores

**Context.** Your design notes specify this. The code agrees, and the docstring says so explicitly: "Committee Head is strictly read-only and cannot call this endpoint."

**Decision.** `PUT /api/students/{id}/behavior-score` is `require_roles(["committee_hr_member", "hr_admin"])`. No endpoint anywhere permits `committee_head` to write a behavior score.

**Trade-offs.** **[INFERRED]** The likely motivation is that behaviour assessment is an HR function and letting a technical leader write it would undermine the HR Leader's oversight of their own team. The cost is that the Committee Head cannot correct a behaviour score, only request one.

**Evidence.** `routes_students.py:261-268`. **[VERIFIED]** for the rule, **[INFERRED]** for the rationale.

---

## ADR-009 — Committee Head is blocked from member feedback

**Context.** Not in your design notes. The code excludes it.

**Decision.** `GET /api/feedback` raises 403 for `committee_head`/`team_lead` and for `committee_hr_member`. Only the HR Leader, the region head, the admin, and the feedback's own author can read it.

**Trade-offs.** **[INFERRED]** Feedback is a channel from members upward about HR staff. A technical leader between the member and the HR Leader is deliberately cut out, so a complaint cannot be quietly handled locally. The cost is that the Committee Head cannot see that a member had a problem, even informally.

**Evidence.** `routes_feedback.py:104-115`. **[VERIFIED]** for the rule, **[INFERRED]** for the rationale.

---

## ADR-010 — Reminders are queued as `PENDING_APPROVAL` and never auto-sent

**Context.** An automated WhatsApp message to a real student is student-facing and unrecoverable if wrong.

**Decision.** The `AutomationEngine` writes `ReminderLog` and `TaskReminder` rows with `status = "PENDING_APPROVAL"` and **never calls a provider**. Actual transmission happens only through the agent HITL path after `/api/agent/confirm`, or through a direct HR action in the UI.

**Trade-offs.** Safe, but the automation layer produces a review queue rather than outcomes. Nothing in the codebase drains that queue automatically, so the practical value of the scheduler is the follow-up flag, not the message. **[INFERRED]** the intent was that a human reviews and sends.

**Evidence.** `automation_service.py:180,246,309,368` — every `msg_status = "PENDING_APPROVAL"`. **[VERIFIED]**

---

## ADR-011 — `get_meeting_attendance` is read-only on GET

**Context.** The detail endpoint once triggered attendance processing as a side effect, which meant a page load could mutate the database.

**Decision.** Processing was removed; `GET /api/attendance/meetings/{id}` is now pure read, and processing requires an explicit `POST .../process`.

**Trade-offs.** Two calls instead of one, but the endpoint is safe to retry, to cache, and to hit from a monitoring probe. The comment `ISSUE-13` marks it as a deliberate fix.

**Evidence.** `routes_attendance.py:169` with the comment "Removed automatic processing to ensure GET is read-only (ISSUE-13)". **[VERIFIED]**

---

## ADR-012 — Task reminders fail closed when no assignment exists

**Context.** "Remind everyone who has not submitted" is dangerous when "everyone" is computed from a query that returned nothing due to a bug.

**Decision.** `get_task_reminder_candidates` returns `[]` when an HR-created task has no `TaskAssignment` rows. Only a seeded legacy task with no assignments falls back to all active students, distinguished by `created_by_user_id IS NULL`.

**Trade-offs.** A task created without assignments silently sends no reminders rather than reminding the whole committee. That is the correct direction for a failure, but it is silent — nothing warns the creator. **[INFERRED]** the asymmetry between HR-created and seeded tasks is a pragmatic accommodation for seed data rather than a designed rule.

**Evidence.** `routes_tasks.py:28-70`, `tests/unit/test_task_fail_closed.py`. **[VERIFIED]**

---

## ADR-013 — SQLite in development, Supabase Postgres in production, with the secret guard

**Context.** A student-project team needs zero-setup local development and a real production database.

**Decision.** `DATABASE_URL` selects the engine. `get_normalized_database_url` rewrites `postgres://` and `postgresql://` to `+asyncpg` and anchors relative SQLite paths to `backend/`. `validate_production_secrets` raises at import if `ENVIRONMENT=production` and the JWT key is the dev default or the URL contains `sqlite`. Pooled URLs get prepared-statement caches disabled.

**Trade-offs.** A misconfigured production deploy fails fast at import rather than serving a broken app. Good. The guard covers two settings; there is no equivalent check for an unset `OPENWA_WEBHOOK_SECRET` or a defaulted `OPENWA_API_KEY`.

**Evidence.** `core/config.py:107-120`, `core/database.py:14-33,41-52`. **[VERIFIED]**

---

## ADR-014 — `create_all` at startup rather than Alembic

**Context.** Alembic exists with four revisions, but the app does not run it.

**Decision.** `init_db()` calls `Base.metadata.create_all`. Seeding runs only when `ENVIRONMENT=development` and the URL is SQLite.

**Trade-offs.** Fast, zero-configuration startup, and a fresh database always matches the models. The cost is significant: `create_all` creates missing tables but **never alters** an existing one, so a new column is silently absent until someone runs `alembic upgrade head` by hand. No CI step compares the ORM to the migration head, and production startup never migrates. This is the most likely cause of a "works locally, missing column in production" incident.

**Evidence.** `core/database.py:87-91`, `main.py:34-45`, `alembic/versions/`. **[VERIFIED]**

---

## ADR-015 — Audit logs are immutable at the database level

**Context.** An audit trail that the application can rewrite is not an audit trail.

**Decision.** `agents_action_audits` carries four triggers — SQLite `BEFORE DELETE` / `BEFORE UPDATE`, and a PostgreSQL `prevent_audit_mutation()` function with two triggers. `DELETE` always raises. `UPDATE` raises if `id`, `action_id`, `intent`, `tool_name`, or `parameters` would change, which permits exactly the status and result transitions the HITL flow needs.

**Trade-offs.** Correct and dialect-aware. The bypass is "update `status` and `result`", which is what makes `EXECUTING_CONFIRMATION → EXECUTED` legal. A failure mid-send therefore strands a row (there is no `FAILED` write on the exception path), and nothing ever reaps these rows.

**Evidence.** `entities.py:475-546`. **[VERIFIED]**

---

## ADR-016 — Mock providers as the default, selected at import time

**Context.** Live Google Meet and WhatsApp integrations make demos and tests non-deterministic and network-dependent.

**Decision.** `use_live_providers = ENVIRONMENT == "production" or MESSAGING_PROVIDER == "openwa"`. Mocks supply hard-coded meetings, events, and a recording message provider.

**Trade-offs.** Tests and demos are offline and deterministic. Two problems: the selection is evaluated at import time so changing the setting needs a restart, and it couples the Google providers to an unrelated messaging variable, so setting `MESSAGING_PROVIDER=openwa` silently switches Google to live. More seriously, in production the live Meet provider is a **stub returning `None`**, so every reprocess marks every student `UNEXCUSED_ABSENT`.

**Evidence.** `tools.py:37-38`, `providers/attendance_provider.py:40-48`. **[VERIFIED]**

---

## ADR-017 — Explicit sensitive-delivery modelling in the WhatsApp provider

**Context.** A timeout on send does not tell you whether the message arrived. A naive retry double-sends to a real student.

**Decision.** `MessageDeliveryResult` carries `delivery_status` (`DELIVERED` / `UNKNOWN_PENDING` / `CONFIRMED_FAILED`) and `is_uncertain`. On an ambiguous outcome, `POST /whatsapp/send-official` returns **HTTP 200 with `is_uncertain: true`** rather than 5xx, specifically to defeat client retry logic. `ReminderService` records `UNKNOWN_PENDING`. Outbound sends are throttled to one per 1 s ± 0.5 s. Ten `httpx` calls carry explicit 3–15 s timeouts.

**Trade-offs.** More states to handle in the UI, and a 200 that means "unknown". In exchange, no duplicate messages to students. This is a well-reasoned decision and is tested.

**Evidence.** `providers/messaging_provider.py:19-28`, `routes_whatsapp.py:140-174`, `tests/unit/test_openwa_timeout_safety.py`. **[VERIFIED]**

---

## ADR-018 — The `total_score` formula is deliberately left undefined

**Context.** A single number would be convenient for ranking.

**Decision.** `total_score` is always `None` and `total_score_status` is always `"PENDING_FORMULA_DEFINITION"`, with a comment: "Authoritative score components are kept separate. No arbitrary weights or attendance point values are invented."

**Trade-offs.** No sortable leaderboard and no overall figure. The team declined to invent weights without an authoritative source. **Do not add a formula without one** — the `8.xlsx` standard the code references is the missing input.

**Evidence.** `scoring_service.py:66-70`, `schemas.py:55-57`. **[VERIFIED]**

---

## ADR-019 — SSE over WebSocket for the agent, WebSocket only for WhatsApp

**Context.** The agent needs one-way streaming; WhatsApp needs bidirectional push.

**Decision.** The agent streams over `text/event-stream` from `POST /api/agent/stream` with `Cache-Control: no-cache`, `X-Accel-Buffering: no`, and `Connection: keep-alive`. The client uses `fetch` plus `ReadableStream`. WhatsApp uses a dedicated WebSocket at `/api/whatsapp/ws` with a `ping`/`pong` keepalive.

**Trade-offs.** SSE works over plain HTTP, survives proxies, and needs no protocol upgrade. The client re-implements framing and buffering (with a 40 ms flush timer) instead of using `EventSource`, which cannot POST. The `error` event type is documented but never emitted, and there are no heartbeat frames, so a proxy idle timeout can silently cut a long turn.

**Evidence.** `routes_agent.py:44-166`, `components/AgentChat.tsx:73-175`. **[VERIFIED]**

---

## ADR-020 — The role string in the JWT is not trusted

**Context.** A JWT with `role` in its claims could be read as authoritative.

**Decision.** `create_access_token` embeds `role` and `team_id`, but `get_current_user` reads only `sub` and `type` and then loads the `User` row from the database with `selectinload(User.team)`.

**Trade-offs.** One extra indexed query per request. In exchange, a demotion or a team reassignment takes effect immediately instead of at the next token refresh, and a forged claim is irrelevant.

**Evidence.** `dependencies.py:68-96`, `core/security.py:60-78`. **[VERIFIED]** An excellent, easily-missed decision.

---

## Technical debt

### Critical

| # | Item | Location | Impact |
|---|---|---|---|
| 1 | The Google Meet provider is a stub returning `None`, and production selects it. Every reprocess marks every student `UNEXCUSED_ABSENT` and creates a follow-up flag. | `providers/attendance_provider.py:40-48` | Silent org-wide data corruption on the first production reprocess |
| 2 | The background scheduler cannot run on Vercel (`maxDuration: 60`, 300 s loop). | `main.py:39`, `vercel.json` | All automation is dead in production |
| 3 | Rate limits key on `request.client.host`, which behind Vercel or any proxy is a single shared IP. | `rate_limiter.py:96-104` | 60/min login is effectively a global lockout an unauthenticated attacker can trigger |
| 4 | `docker-compose.yml` defaults the OpenWA `AUTH_KEY` to `dev_openwa_key_change_in_prod`. | `docker-compose.yml:12` | An open WhatsApp gateway on a production compose run |
| 5 | `create_all` instead of Alembic, with no drift check in CI. | `core/database.py:87-91` | Schema drift in production |

### High

| # | Item | Location |
|---|---|---|
| 6 | `ScoringService.get_all_summaries` is 3N+1 on the scoreboard and agent hot path. | `scoring_service.py:95-106` |
| 7 | No escalation notification when a follow-up breaches the 3-day SLA. The model is read-only. | `routes_whatsapp.py:295-320` |
| 8 | `status` never reaches `ESCALATED`; `is_escalated` is never persisted; `RESOLVED` is unreachable. | `entities.py:305-311` |
| 9 | The frontend discards `refresh_token` and never refreshes, so every session hard-expires. | `client.ts:104-116` |
| 10 | No token or cost budget on the agent. | `react_agent.py` |
| 11 | `/api/agent/confirm` does not verify the confirmer is the requester. | `routes_agent.py:186-201` |
| 12 | `get_meeting` is in `TOOL_REGISTRY` but not `TOOL_DEFINITIONS`, so it skips the role allowlist. | `tools.py:1000-1077` |
| 13 | Media stored as base64 in a `Text` column with no size limit. | `routes_whatsapp.py:401-408` |

### Medium

| # | Item | Location |
|---|---|---|
| 14 | `routes_tasks.list_tasks` is 3M+1 and fetches the assignment count twice. | `routes_tasks.py:96-121` |
| 15 | `process_meeting_attendance` matches every raw session against every student, unscoped by team. | `attendance_service.py:88-140` |
| 16 | `students.phone` has no unique constraint despite two duplicate checks. | `entities.py:92` |
| 17 | `score_records` unique constraint defeated by a nullable `month`. | `entities.py:207-210` |
| 18 | No pagination anywhere. | every list endpoint |
| 19 | `call_openrouter` and `execute_tool` return raw exception text to the user. | `react_agent.py:272,410` |
| 20 | WebSocket token in the query string. | `routes_whatsapp.py:531` |
| 21 | Registration enumerates accounts. | `routes_auth.py:92` |
| 22 | `GET /api/agent/tools` discloses the tool catalog to any authenticated user. | `routes_agent.py:268` |
| 23 | `GET /api/auth/teams` is unauthenticated. | `routes_auth.py:422` |
| 24 | No logging configuration; `automation_service` info logs are discarded. | `main.py` |
| 25 | No request IDs, metrics, or error tracking. | — |
| 26 | `Task.task_number` uses `MAX+1`, racing under concurrency. | `routes_tasks.py:148` |
| 27 | `events.id` is `ev_{epoch_seconds}`. | `calendar_service.py:58` |
| 28 | Provider selection at import time; the Google providers are coupled to `MESSAGING_PROVIDER`. | `tools.py:37` |
| 29 | `HR_LEAD` means "region-level" in `run_step` but "committee_hr_leader" in `ROLE_EQUIVALENTS`. | `react_agent.py` vs `dependencies.py:112` |
| 30 | `RATE_LIMIT_GENERAL_PER_MINUTE`, `ToolCategory.WRITE`, `get_optional_user`, and the `UserRole` enum are all declared and unused. | multiple |
| 31 | `boto3`, `SUPABASE_*`, `GOOGLE_*`, `TWILIO_*` declared and unused. | `pyproject.toml`, `config.py` |
| 32 | No error boundary in React. | `App.tsx` |
| 33 | `AgentChat.tsx` SSE consumption is untested. | `frontend/src/test/` |
| 34 | **`قادم` ("upcoming") missing from `is_deterministic_intent`,** so Arabic "upcoming meetings" queries bypass the deterministic tool path and return an LLM answer with no data. | `react_agent.py` |
| 35 | Intent trigger lists are duplicated between `run_step` and `is_deterministic_intent` with no shared source — the root cause of 34. | `react_agent.py` |
| 36 | `extract_student_query` is defined twice in `ReActAgent`; the first is dead code. | `react_agent.py:344,530` |

---

## Roadmap

Sequenced by dependency and risk, not by wish list. Each item names the files it touches so it can be scoped and reviewed as a small PR per `AGENTS.md`.

### Phase 0 — stop the bleeding (1–2 days, no new features)

These are correctness and security defects, not enhancements.

| # | Action | Files | Why first |
|---|---|---|---|
| 0.1 | Make the Meet stub fail loudly: raise a clear `NotImplementedError` when `use_live_providers` is true and no real credentials are configured, instead of returning `None` | `providers/attendance_provider.py` | Prevents silent org-wide absence flagging. Smallest possible fix with the largest blast radius. |
| 0.2 | Add `alembic upgrade head` to startup when `ENVIRONMENT != development`, or fail startup if the head is behind the models | `main.py` | Closes the schema-drift class entirely |
| 0.3 | Key rate limits on the authenticated `user_id` when present, falling back to IP, and read `X-Forwarded-For` only from a trusted-proxy allowlist | `core/rate_limiter.py` | Fixes the global login lockout |
| 0.4 | Remove the `AUTH_KEY` default from `docker-compose.yml`; fail the container if `OPENWA_API_KEY` is unset | `docker-compose.yml` | Closes the open-gateway risk |
| 0.5 | Add `logging.basicConfig` and a request ID filter | `main.py` | Everything below is easier to verify with logs |

### Phase 1 — correctness (1–2 weeks)

| # | Action | Files | Notes |
|---|---|---|---|
| 1.1 | Fix `ScoringService.get_all_summaries`: three grouped queries, then assemble in memory. Turns 3N+1 into 4. | `services/scoring_service.py` | Biggest single perf win |
| 1.2 | Fix `list_tasks`: hoist the assignment count, use a single grouped submissions query | `api/routes_tasks.py` | 3M+1 → 2 queries |
| 1.3 | Add a composite index set: `reminder_logs(trigger_source)`, `task_reminders(task_id, student_id, stage)` unique, `member_followup_statuses(student_id, status)`, `whatsapp_chat_messages(student_id, created_at)`, `attendance_records(meeting_id, status)` | new Alembic revision | Backs the idempotency checks and the hot queries |
| 1.4 | Add a unique constraint on `students.phone` after a de-dupe migration | new Alembic revision | Closes the race in two handlers |
| 1.5 | Make `score_records.month` `NOT NULL` with a `'global'` sentinel, so the unique constraint applies | new Alembic revision | Fixes the `MultipleResultsFound` path |
| 1.6 | Replace `MAX(task_number)+1` with a per-team sequence or a retry on unique violation | `api/routes_tasks.py` | Concurrency |
| 1.7 | Bound `reminder_logs`, `whatsapp_chat_messages`, and `agent_action_audits` with an explicit retention policy and a reaper | new job | Unbounded growth, and `agent_action_audits` contains PII |
| 1.8 | Add `LIMIT`/`OFFSET` or cursors to the list endpoints, starting with `/students` and `/students/scoreboard/all` | `api/routes_students.py` | The scale ceiling is real |

### Phase 2 — close the authorization gaps (1–2 weeks)

| # | Action | Files | Addresses |
|---|---|---|---|
| 2.1 | Move the rate limiter to a shared store (Redis, or Postgres) so it works across workers | `core/rate_limiter.py` | Finding 1, 2 |
| 2.2 | Bind `AgentActionAudit` to its creator: reject confirmation from a different user, and add an expiry to `PENDING_CONFIRMATION` | `api/routes_agent.py`, `agent/react_agent.py` | Agent findings 3, 4 |
| 2.3 | Move the WebSocket token from the query string to a first-frame message or an `Sec-WebSocket-Protocol` header | `api/routes_whatsapp.py`, `hooks/useWhatsAppThreadSync.ts` | Authz finding 3 |
| 2.4 | Gate `GET /api/auth/teams` and `GET /api/agent/tools` behind an HR role check | `api/routes_auth.py`, `api/routes_agent.py` | Authz findings 4, 5 |
| 2.5 | Return 404 rather than 403 for out-of-scope resources, and normalise the three failure conventions to one | `core/dependencies.py` and handlers | Authz finding 15 |
| 2.6 | Remove `committee_head` from `require_roles` on `/api/whatsapp/threads`, or add a branch to `get_authorized_threads` | `api/routes_whatsapp.py` | Misleading guard |
| 2.7 | Add the 25 missing role-matrix assertions listed in [04-authorization.md §9](04-authorization.md) | `tests/security/` | Coverage |
| 2.8 | Declare an upload size limit and reject oversize media before reading it into memory | `api/routes_whatsapp.py` | Authz finding 12 |

### Phase 3 — make the escalation loop real (1 week)

This is the feature your design notes imply and the code only half-implements.

| # | Action | Files | Notes |
|---|---|---|---|
| 3.1 | Add endpoints to transition a follow-up flag to `RESOLVED` and to acknowledge escalation, writing `is_escalated` and `status = ESCALATED` for real | new `api/routes_escalations.py` | Closes Authz findings 12, 13 |
| 3.2 | Emit a notification when a flag breaches the SLA — an in-app item, a WebSocket push, and optionally a WhatsApp message to the HR Leader | `services/automation_service.py`, `services/whatsapp_connection_manager.py` | The feature the design implies |
| 3.3 | Reset `flagged_at` when a flag is re-raised after contact, so `days_open` measures from the latest contact rather than the original flag | `api/routes_whatsapp.py` | Fixes the stale-clock problem |
| 3.4 | Make the `PENDING_APPROVAL` reminder queue actionable: a review screen, per-row approve and send, and a bulk approve with a preview | `components/NotificationsPage.tsx`, `api/routes_automation.py` | The scheduler currently produces a queue nobody drains |

### Phase 4 — frontend session and real-time quality (1 week)

| # | Action | Files | Notes |
|---|---|---|---|
| 4.1 | Store `refresh_token`, add a proactive refresh ~2 minutes before expiry, and a single-flight queue for concurrent 401s | `api/client.ts` | Fixes the hard session expiry |
| 4.2 | Move tokens to httpOnly cookies with CSRF, or accept the localStorage trade-off explicitly and document it | `api/client.ts` | Needs a backend change too |
| 4.3 | Add an error boundary and wrap each view | `App.tsx` | One view crash currently unmounts the app |
| 4.4 | Add tests for `AgentChat` SSE consumption, including a partial-frame split and a mid-stream 401 | `src/test/` | The most complex client code is untested |
| 4.5 | Add RTL test coverage; assert `dir` and `lang` after a language toggle | `src/test/` | Untested direction |
| 4.6 | `React.lazy` the 19 views and split `bloub-engine` out of the initial bundle | `App.tsx` | ~2,800 lines of decorative code |
| 4.7 | Reconcile `NAV_ITEMS.roles` for `qna` with the API, which includes `committee_hr_member` | `components/Sidebar.tsx` | Small divergence |

### Phase 5 — agent maturity (2 weeks)

| # | Action | Files | Notes |
|---|---|---|---|
| 5.1 | Add `max_tokens`, a per-user daily quota, and a token-usage record to `AgentActionAudit` | `agent/react_agent.py`, `services/audit_service.py` | Closes the unbounded cost exposure |
| 5.2 | Build a regression corpus: ~100 `(query, expected_intent, expected_params)` pairs in both languages, run as a test | new `tests/eval/` | Turns intent routing from folklore into a contract |
| 5.3 | Add the 10 evaluation scenarios from [03-ai-agent.md §9](03-ai-agent.md) | `tests/security/`, `tests/eval/` | Prompt injection, replay, cross-user confirm, fabrication |
| 5.4 | Stop returning raw exception text: sanitise tool errors and `call_openrouter` failures | `agent/react_agent.py` | Two info-leak paths |
| 5.5 | Add `get_meeting` to `TOOL_DEFINITIONS`, or remove it from the registry | `agent/tools.py` | Closes the allowlist bypass |
| 5.6 | Extract `PermissionContext` construction into one factory so the `is_admin_override` derivation lives in one place, and resolve the `HR_LEAD` inconsistency | `agent/react_agent.py` | Two meanings for one role string |
| 5.7 | Add a `type: "error"` SSE event and heartbeat frames | `api/routes_agent.py` | Proxies currently cut long turns |
| 5.8 | Persist conversation state, or document in-process loss as a known limitation | `agent/react_agent.py` | Restart loses context |

### Phase 6 — platform (ongoing)

| # | Action | Notes |
|---|---|---|
| 6.1 | Split the deployment: static frontend on the CDN, the API on a long-lived host, OpenWA beside it. Removes the scheduler constraint and the tunnel requirement. | The single highest-leverage infrastructure change |
| 6.2 | Implement the real Google Meet conference-records client with service-account credentials, and populate `GOOGLE_CLIENT_ID` / `SECRET` | Completes ADR-016 |
| 6.3 | Move `file_url` to object storage with signed URLs | Removes base64-in-Text |
| 6.4 | Add Alembic drift detection and a schema-diff step to CI | Closes the ADR-014 debt permanently |
| 6.5 | Add ESLint and Ruff; wire them into CI | `AGENTS.md` expects them |
| 6.6 | Add OpenTelemetry with traces, RED metrics, and Sentry | With 0.5 in place this is straightforward |
| 6.7 | Define the `8.xlsx` scoring formula, or retire `total_score` entirely | Closes ADR-018 |
| 6.8 | Remove the dead declarations: `boto3`, `SUPABASE_*`, `GOOGLE_*`, `TWILIO_*`, `ToolCategory.WRITE`, `get_optional_user`, `RATE_LIMIT_GENERAL_PER_MINUTE`, the `UserRole` enum | Clarifies the real configuration surface |
| 6.9 | Add API versioning (`/api/v1`) | There is no version segment today |

---

## Closing note

The security architecture is genuinely well thought out. Three-layer authorization, deterministic policy engines, a keyword-routed agent that cannot be steered into a tool call, a three-enforcement-point HITL barrier, database-enforced audit immutability, and twenty dedicated security test files are more than most projects of this size have.

The gaps are concentrated in three places: **infrastructure that does not match the deployment** (the scheduler, the stubbed Meet provider, Alembic, OpenWA reachability), **unbounded growth** (no pagination, no retention, N+1 queries, base64 media), and **incomplete state machines** (`ESCALATED` and `RESOLVED` are never written, `MISSED` is never written, the `PENDING_APPROVAL` queue is never drained). The third is the most interesting: the domain model was designed in full and then only partially wired up. Phase 3 is where the code catches up to the design.

Start with Phase 0. It is about two days of work and it prevents the single worst failure mode in the system: silently marking every member of the organization absent.
