# StudentOps AI — Documentation

Developer documentation for StudentOps AI, an AI-driven operations and HR platform for student organizations.

**Every claim in these documents is traced to the code.** Confidence markers are used throughout:

| Marker | Meaning |
|---|---|
| **[VERIFIED]** | Read directly in the cited file and function |
| **[INFERRED]** | Deduced from code structure, not stated explicitly |
| **[UNKNOWN]** | Could not be determined from the repository |

Where the code and the original design notes disagree, the **code wins** and the disagreement is called out. Four such corrections are listed in [Corrections to the brief](#corrections-to-the-brief).

---

## Start here

| I want to… | Read |
|---|---|
| Understand the whole system in 10 minutes | This page, then [01 — System Design](01-system-design.md) |
| Call an API | [02 — API Reference](02-api.md), then `openapi.yaml` in Swagger |
| Work on the AI agent | [03 — AI Agent](03-ai-agent.md) |
| Understand who can see what | [04 — Authorization](04-authorization.md) |
| Change the schema | [05 — Database](05-database.md) §5 **first** |
| Build a UI feature | [06 — Frontend](06-frontend.md) |
| Add an external service | [07 — Integrations](07-integrations.md) |
| Get it running | [08 — Setup and Operations](08-setup-and-operations.md) |
| Learn the vocabulary | [09 — Glossary](09-glossary.md) |
| Know what to fix next | [10 — Decisions and Roadmap](10-decisions-and-roadmap.md) |
| See every diagram at once | [`diagrams/index.html`](diagrams/index.html) |

---

## Documents

| # | Document | Contents | Diagrams |
|---|---|---|---|
| 01 | [System Design](01-system-design.md) | Purpose, journeys, architecture, components, stack, 5 key flows, deployment, non-functional characteristics | 8 |
| 02 | [API Reference](02-api.md) | All 64 endpoints, conventions, SSE protocol, error catalog, rate limits, idempotency, `curl` examples | 5 |
| 03 | [AI Agent](03-ai-agent.md) | Intent routing, 15-tool catalog, role scoping, HITL, failure and cost handling, safety, 10 test scenarios | 3 |
| 04 | [Authorization](04-authorization.md) | Auth flow, role hierarchy, full permission matrix, who-sees-what, enforcement points, escalation, 20-item security review, 60-assertion test checklist | 5 |
| 05 | [Database](05-database.md) | Engine, 24-table data dictionary, enums, migrations, PII inventory, query hot-spots, data ownership, 4 lifecycles | 6 |
| 06 | [Frontend](06-frontend.md) | Structure, routing, guards, state, API client, SSE consumer, i18n and RTL, tests | 1 |
| 07 | [Integrations](07-integrations.md) | Every external integration, auth method, data exchanged, failure behavior, rate limits | 1 |
| 08 | [Setup and Operations](08-setup-and-operations.md) | Step-by-step setup, **all** environment variables, commands, CI/CD, deployment, logging, troubleshooting, runbook | — |
| 09 | [Glossary](09-glossary.md) | ~120 domain terms plus Arabic vocabulary used in the code | — |
| 10 | [Decisions and Roadmap](10-decisions-and-roadmap.md) | 20 ADRs, 36-item technical debt register, 6-phase sequenced roadmap | — |

**Generated artifacts:** [`openapi.yaml`](openapi.yaml) · [`openapi.json`](openapi.json) · [`diagrams/index.html`](diagrams/index.html) · 29 `.mmd` sources in [`diagrams/`](diagrams/) · 29 pre-rendered SVGs in [`diagrams/rendered/`](diagrams/rendered/)

---

## 10-minute quick start

Requires Python 3.11+, `uv`, Node 20+, and npm. `uv` is mandatory for the backend — do not use `pip`.

```bash
# Terminal 1 — backend on :8000
cd backend
uv sync
cp .env.example .env          # defaults work offline; MESSAGING_PROVIDER=mock
uv run python -m app.seed.seed_data
uv run uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal 2 — frontend on :5173
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The database is created and seeded automatically on first boot, so the explicit seed command is only needed if you want to reseed.

### Sign in

| Role | Email | Password | What to look at |
|---|---|---|---|
| Regional HR Head | `region.head@studentops.org` | `head123` | Reports, oversight WhatsApp threads |
| HR Admin | `admin@studentops.org` | `admin123` | Audit logs, role management, team creation |
| Committee HR Leader | `hr.leader@studentops.org` | `leader123` | Cohort scores, member feedback, escalation list |
| Committee Head | `media.head@studentops.org` | `lead123` | Task review, technical scoring, Q&A answering |
| Committee HR Member | `hr.member@studentops.org` | `hrmember123` | Attendance processing, behavior scores, WhatsApp inbox |
| Committee Member | `member@studentops.org` | `member123` | Own attendance, task submission, feedback, questions |

A bare username also works — `region.head` resolves to `region.head@studentops.org`.

### Verify the install

```bash
cd backend && uv run pytest tests -v      # 248 tests
cd frontend && npm run build              # must be 0 TypeScript errors
cd frontend && npm test -- --run          # 9 Vitest files
```

Health check: `curl http://127.0.0.1:8000/` returns `{"status": "healthy", "database": "healthy", ...}`.
Interactive API docs: **http://127.0.0.1:8000/docs**

### Try the agent

As `committee_hr_leader`, open **Agent Chat** and try:

| Query | Expected |
|---|---|
| `Who was absent from today's meeting?` | Deterministic answer from the database, no LLM call |
| `تقييم محمد علي` | Scorecard in Arabic |
| `Send a reminder to the absentees` | Draft preview + **Confirm and Send** button — nothing is sent until clicked |
| `What's the capital of France?` | Falls through to the LLM (proves the intent router missed) |

### Five things to know before you change anything

1. **`init_db()` uses `create_all`, not Alembic.** A new column is *silently absent* from an existing database. Run `uv run alembic upgrade head`. ([05](05-database.md) §5)
2. **Authorization is three layers**: `require_roles` → `verify_student_access` → query `WHERE` clause. Miss one and you have an IDOR. ([04](04-authorization.md) §3)
3. **Committee Head is read-only on behavior scores, and HR roles are blocked from task submissions.** This is deliberate, enforced, and tested. ([04](04-authorization.md) §4)
4. **The LLM never calls a tool.** Tools are selected by Python keyword matching. Do not add LLM tool-calling without redoing the security analysis. ([03](03-ai-agent.md) §8)
5. **`total_score` is deliberately `null`.** The formula is undefined on purpose. Do not invent weights. ([09](09-glossary.md))

---

## Corrections to the brief

The design notes contained four claims the code does not support.

| # | Brief says | Code says |
|---|---|---|
| 1 | "The project uses the AWS SDK (boto3)" | `boto3` is declared in `pyproject.toml:15` and `requirements.txt:19` but **is never imported anywhere** in `backend/app/` or `api/`. There is no AWS SDK usage. |
| 2 | "Google Meet API" as an integration | `GoogleMeetAttendanceProvider.get_raw_meeting_attendance` has a `pass` body and always returns `None`. No HTTP call is ever made. Worse, production *selects* this stub — see risk R1. |
| 3 | "HR leaders monitor HR members rather than individual committee members" | Partially true. `committee_hr_leader` sees the whole committee's cohort scores (`GET /api/students/scoreboard/all`), not individual HR members' caseloads. There is no per-HR-member performance view anywhere. |
| 4 | "Committee Head is view-only on HR/behavior scores" | **Confirmed.** `PUT /api/students/{id}/behavior-score` is `require_roles(["committee_hr_member", "hr_admin"])` and no endpoint lets `committee_head` write one. |

Additional undocumented behaviours worth knowing:

- **`hr_admin` is not in your listed roles** but exists and has organization-wide access, team creation, and role management.
- **`team_lead` and `member` are legacy aliases** of `committee_head` and `committee_member`.
- **`total_score` is permanently `null`** with status `PENDING_FORMULA_DEFINITION`. The `8.xlsx` formula is the missing input.
- **No escalation notifications exist.** The 3-day SLA is computed at read time and changes a response field; it sends nothing.
- **`MISSED` and `RESOLVED` and `ESCALATED` are never written** — three documented states that no code path reaches.

---

## Top 5 risks

Ranked by severity × likelihood. Full register in [Gaps & Open Questions](#gaps--open-questions).

### R1 — Every member is silently marked absent in production · **Critical**

`ENVIRONMENT=production` selects the live providers (`tools.py:37`). The live Meet provider is a stub returning `None`. `process_meeting_attendance` then finds zero sessions, marks **every assigned student** `UNEXCUSED_ABSENT`, and creates a follow-up flag for each. One `POST /api/attendance/meetings/{id}/process` corrupts the attendance record for the whole organization, and the follow-up flags then feed the report aggregates.

Fix: raise from the stub when live mode is on without real credentials. One file, a few lines.

### R2 — Rate limiting collapses to a single global bucket · **High**

`get_client_ip` returns `request.client.host` and deliberately ignores `X-Forwarded-For`. Behind Vercel or any proxy that is one shared IP, so the 60/min login limit applies **org-wide**. An unauthenticated attacker can lock out every user with 60 requests. The limiter is also in-memory per process, so limits multiply with workers and reset on restart.

Fix: key on the authenticated `user_id` where available, and read the forwarded header only from a trusted-proxy allowlist.

### R3 — Schema drift is invisible · **High**

`init_db()` calls `Base.metadata.create_all`, which creates missing tables but **never alters** an existing one. Alembic exists with four revisions but is never run at startup or in CI. Adding a column to `entities.py` and redeploying produces a database without that column and no error.

Fix: run `alembic upgrade head` on startup outside development, or fail startup when the head is behind the models. Add a drift check to CI.

### R4 — The background automation never runs in production · **High**

`BackgroundScheduler` runs a 300-second loop started in the FastAPI lifespan. Vercel sets `maxDuration: 60` and freezes or tears down the function long before that. All three automation cycles are dead on the current deployment. Related: the OpenWA gateway on `localhost:2785` is unreachable from a Vercel function, so WhatsApp is dead there too without a tunnel.

Fix: split the deployment — static frontend on the CDN, API on a long-lived host, OpenWA beside it.

### R5 — Unbounded growth with no pagination or retention · **Medium-High**

- `GET /api/students/scoreboard/all` is **3N+1** — three queries per student.
- `GET /api/tasks` is **3M+1** and fetches the assignment count twice.
- No list endpoint paginates. `students`, `scoreboard/all`, and `automation/reminders` return unbounded arrays.
- `whatsapp_chat_messages.media_url` stores **base64 blobs in a `Text` column** with no upload size limit.
- `agent_action_audits`, `reminder_logs`, and `whatsapp_chat_messages` grow forever, and the audit table contains phone numbers and full message bodies.

Fix: three grouped queries instead of N+1, add `LIMIT`/`OFFSET`, move media to object storage, add a retention policy.

---

## Gaps & Open Questions

Consolidated from all ten documents, deduplicated, **security gaps first**, then functional, then data, then operational, then design. Severity: **Critical** → **High** → **Medium** → **Low**.

### Critical and High — security and data integrity

| # | Gap | Where | Doc |
|---|---|---|---|
| 1 | Live Meet provider is a stub that returns `None`; production selects it, mass-flagging everyone absent | `providers/attendance_provider.py:40` | [01](01-system-design.md) §9, [07](07-integrations.md) §10 |
| 2 | Rate limits key on `request.client.host`; global bucket behind a proxy | `core/rate_limiter.py:96` | [04](04-authorization.md) §8 |
| 3 | Rate limits are in-memory and per-process; multiply with workers, reset on restart | `core/rate_limiter.py:78` | [04](04-authorization.md) §8 |
| 4 | `create_all` instead of Alembic; column changes silently absent in existing DBs | `core/database.py:87` | [05](05-database.md) §5 |
| 5 | `docker-compose.yml` defaults the OpenWA `AUTH_KEY` to a dev string | `docker-compose.yml:12` | [07](07-integrations.md) §4 |
| 6 | WebSocket authenticates via `?token=`, putting access tokens in URLs and access logs | `api/routes_whatsapp.py:531` | [04](04-authorization.md) §8 |
| 7 | `/api/agent/confirm` does not verify the confirmer is the requester | `api/routes_agent.py:186` | [03](03-ai-agent.md) §6, [04](04-authorization.md) §8 |
| 8 | `get_meeting` is in `TOOL_REGISTRY` but not `TOOL_DEFINITIONS`, so it skips the role allowlist | `agent/tools.py:1000` | [03](03-ai-agent.md) §10 |
| 9 | `PENDING_CONFIRMATION` rows never expire; a leaked `action_id` stays confirmable | `models/entities.py:271` | [03](03-ai-agent.md) §6 |
| 10 | No token or cost budget on the agent; 25 full-context LLM turns per minute, unbounded | `agent/react_agent.py` | [03](03-ai-agent.md) §7 |
| 11 | Access tokens are not revocable; logout only revokes the refresh token | `api/routes_auth.py:627` | [04](04-authorization.md) §1 |
| 12 | `students.phone` has no unique constraint despite duplicate checks in two handlers | `models/entities.py:92` | [05](05-database.md) §3 |
| 13 | Media stored as base64 in a `Text` column with no upload size limit | `api/routes_whatsapp.py:401` | [02](02-api.md) §9, [07](07-integrations.md) §4 |
| 14 | Registration returns a distinct 400 for a taken email, enabling account enumeration | `api/routes_auth.py:92` | [04](04-authorization.md) §1 |
| 15 | Frontend stores tokens in `localStorage` with no CSRF token | `api/client.ts:33` | [06](06-frontend.md) §6 |

### High — functional gaps versus the design

| # | Gap | Where | Doc |
|---|---|---|---|
| 16 | The background scheduler cannot run on Vercel (`maxDuration: 60` vs a 300 s loop) | `main.py:39`, `vercel.json` | [01](01-system-design.md) §7, [08](08-setup-and-operations.md) §6 |
| 17 | No escalation notification when a follow-up breaches the 3-day SLA — the model is read-only | `api/routes_whatsapp.py:295` | [04](04-authorization.md) §7 |
| 18 | `status` never reaches `ESCALATED`; `is_escalated` is never persisted; `RESOLVED` is unreachable | `models/entities.py:305` | [04](04-authorization.md) §7, [05](05-database.md) §4 |
| 19 | `days_open` measures from `flagged_at`, not `last_contacted_at`, so a re-contacted member still escalates on the original clock | `api/routes_whatsapp.py:298` | [04](04-authorization.md) §7 |
| 20 | `submissions.status = MISSED` is documented but no endpoint writes it | `models/entities.py:203` | [05](05-database.md) §4 |
| 21 | The `PENDING_APPROVAL` reminder queue is written but never drained by anything | `services/automation_service.py:180` | [01](01-system-design.md) §6.4 |
| 22 | Frontend discards `refresh_token` and never refreshes, so every session hard-expires | `api/client.ts:104` | [06](06-frontend.md) §6, [08](08-setup-and-operations.md) §10 |
| 23 | Google Calendar provider is a stub; `create_event` silently does nothing to Google | `providers/calendar_provider.py:35` | [07](07-integrations.md) §6 |
| 24 | `total_score` formula undefined; no sortable overall ranking exists | `services/scoring_service.py:66` | [09](09-glossary.md) |
| 25 | **Arabic `قادم` ("upcoming") is missing from `is_deterministic_intent`**, so `الاجتماعات القادمة` bypasses the deterministic path and gets an LLM answer with no data — the agent's own help text advertises this exact example | `agent/react_agent.py` | [03](03-ai-agent.md) §2, §10 |
| 26 | Intent trigger lists are duplicated between `run_step` and `is_deterministic_intent` with no shared source — the root cause of 25 | `agent/react_agent.py` | [03](03-ai-agent.md) §2, §10 |

### Medium — data, performance, and information disclosure

| # | Gap | Where | Doc |
|---|---|---|---|
| 25 | `ScoringService.get_all_summaries` is 3N+1 on the scoreboard and agent hot path | `services/scoring_service.py:95` | [05](05-database.md) §7 |
| 26 | `routes_tasks.list_tasks` is 3M+1 and fetches the assignment count twice | `api/routes_tasks.py:96` | [05](05-database.md) §7 |
| 27 | `process_meeting_attendance` matches every raw session against every student, unscoped by team | `services/attendance_service.py:88` | [05](05-database.md) §7 |
| 28 | No pagination on any list endpoint | every list route | [02](02-api.md) §1 |
| 29 | `score_records` unique constraint defeated by a nullable `month`; `scalar_one_or_none()` can raise | `models/entities.py:207` | [05](05-database.md) §3 |
| 30 | No unique constraint on `attendance_records(meeting_id, student_id)` or `submissions(task_id, student_id)` | `models/entities.py` | [05](05-database.md) §3 |
| 31 | `reminder_logs.trigger_source` and `member_followup_statuses.flagged_reason` unindexed, used in full-scan idempotency checks | `models/entities.py` | [05](05-database.md) §7 |
| 32 | `TaskReminder` idempotency has no unique constraint | `models/entities.py` | [05](05-database.md) §3 |
| 33 | `openwa_message_id` indexed but not unique; webhook dedup races | `models/entities.py` | [07](07-integrations.md) §4 |
| 34 | `Task.task_number` uses `MAX+1`, racing under concurrent creates | `api/routes_tasks.py:148` | [05](05-database.md) §7 |
| 35 | `events.id` is `ev_{epoch_seconds}`; same-second collisions | `services/calendar_service.py:58` | [05](05-database.md) §3 |
| 36 | No retention policy on `agent_action_audits`, `reminder_logs`, or `whatsapp_chat_messages`; all contain PII | `models/entities.py` | [05](05-database.md) §6 |
| 37 | No encryption at rest, no PII masking, no audit-log redaction | — | [05](05-database.md) §6 |
| 38 | `GET /api/agent/tools` is gated on authentication only, disclosing the tool catalog to any member | `api/routes_agent.py:268` | [02](02-api.md) §9, [04](04-authorization.md) §8 |
| 39 | `GET /api/auth/teams` is unauthenticated, leaking team names, codes, and headcounts | `api/routes_auth.py:422` | [02](02-api.md) §9 |
| 40 | `call_openrouter` and `execute_tool` return raw exception text to the user | `agent/react_agent.py:272,410` | [03](03-ai-agent.md) §10 |
| 41 | No logging configuration; `automation_service` info logs are silently discarded | `main.py` | [08](08-setup-and-operations.md) §7 |
| 42 | No request IDs, metrics, or error tracking | — | [08](08-setup-and-operations.md) §7 |
| 43 | 25 of 60 suggested role-matrix assertions are missing from the test suite | `tests/security/` | [04](04-authorization.md) §9 |
| 44 | `AgentChat.tsx` SSE consumption is untested | `frontend/src/test/` | [06](06-frontend.md) §10 |
| 45 | RTL layout is untested | `frontend/src/test/` | [06](06-frontend.md) §8 |
| 46 | No React error boundary; one view crash unmounts the app | `App.tsx` | [06](06-frontend.md) §10 |

### Low — design debt and hygiene

| # | Gap | Where |
|---|---|---|
| 47 | `boto3` declared, never imported | `pyproject.toml:15` |
| 48 | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL` declared and never read | `core/config.py:30` |
| 49 | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_ID` declared and never read | `core/config.py:61` |
| 50 | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` declared; the Twilio path is a stub | `core/config.py:70` |
| 51 | `ToolCategory.WRITE` declared and never used | `agent/tools.py:27` |
| 52 | `get_optional_user` declared and never used | `core/dependencies.py:153` |
| 53 | `RATE_LIMIT_GENERAL_PER_MINUTE` declared and never wired | `core/config.py:102` |
| 54 | `UserRole` enum class defined but never applied to the `users.role` column | `models/entities.py:19` |
| 55 | `HR_LEAD` means "region-level" in `run_step` but "committee_hr_leader" in `ROLE_EQUIVALENTS` | `react_agent.py` vs `dependencies.py:112` |
| 56 | Three different failure conventions for a scope violation: 403, `[]`, and a 200 with a message | `dependencies.py` and handlers |
| 57 | `committee_head` is in `require_roles` for `/api/whatsapp/threads` but silently gets `[]` | `api/routes_whatsapp.py:330` |
| 58 | `NAV_ITEMS.roles` for `qna` omits `committee_hr_member` while the API includes them | `components/Sidebar.tsx:123` |
| 59 | The role hierarchy is not structural; adding a role requires auditing every route by hand | `dependencies.py` |
| 60 | 404 vs 403 reveals ID existence | `dependencies.py:180` |
| 61 | `assigned_count` in `assign-cohort` over-reports when students are skipped | `api/routes_students.py:352` |
| 62 | `POST /api/tasks/{id}/submit` does not verify `TaskAssignment` | `api/routes_tasks.py:663` |
| 63 | `PUT /api/attendance/.../status` accepts an arbitrary `status` string | `api/routes_attendance.py:259` |
| 64 | Provider selection at import time; the Google providers are coupled to `MESSAGING_PROVIDER` | `agent/tools.py:37` |
| 65 | No retry, backoff, or circuit breaker for any external call | multiple |
| 66 | The SSE `error` event is documented but never emitted; no heartbeat frames | `api/routes_agent.py:54` |
| 67 | In-process agent conversation state is lost on restart or across replicas | `react_agent.py:22` |
| 68 | No API version prefix | `vercel.json` |
| 69 | No ESLint or Ruff configured despite `AGENTS.md` conventions; no lint step in CI | `.github/workflows/ci.yml` |
| 70 | `start-dev.ps1` is Windows-only | repo root |
| 71 | No backup or restore procedure in the repository | **[UNKNOWN]** whether Supabase managed backups are enabled |
| 72 | No health check in CI or any uptime monitor | `main.py:132` |
| 73 | Dead code in `refresh`: a discarded `SELECT` with the comment "Just logic outline" | `api/routes_auth.py:362` |
| 74 | `openwa_provider.py` is 746 lines mixing transport parsing, phone normalization, throttling, and response shaping | `providers/openwa_provider.py` |
| 75 | No React.lazy; all 19 views and the 2,800-line mascot engine load in the initial bundle | `App.tsx` |
| 76 | `extract_student_query` is defined twice in `ReActAgent`; the first is dead code and edits to it are silently discarded | `agent/react_agent.py:344,530` |

### Open questions requiring a human decision

These cannot be resolved from the code and need a product or policy answer.

| # | Question |
|---|---|
| Q1 | **What is the `8.xlsx` scoring formula?** `total_score` has been `PENDING_FORMULA_DEFINITION` since inception. Without it there is no overall ranking. |
| Q2 | **Should `region_hr_head` see raw member-level records or only aggregates?** The design notes say aggregated. The code lets it see everything a `hr_admin` sees, including phones, scorecards, and chat content. |
| Q3 | **Should `hr_admin` be able to action member feedback?** It can read everything but `PATCH /api/feedback/{id}/status` is `committee_hr_leader` only. Intentional or an oversight? |
| Q4 | **May any HR-eligible user confirm another user's pending agent action?** Currently yes, subject to team scope. This should be an explicit decision, then locked in a test. |
| Q5 | **Is `GET /api/auth/teams` intentionally public?** It exposes team names, codes, and member counts to unauthenticated callers. |
| Q6 | **Should registration confirm or deny account existence?** Login correctly denies; registration confirms. Pick one. |
| Q7 | **What is the retention policy for chat messages and audit logs?** Both contain PII and grow without bound. |
| Q8 | **Are Supabase managed backups enabled and verified for this project?** Not determinable from the repository. |
| Q9 | **Where should the backend run in production?** The current Vercel deployment cannot run the scheduler or reach OpenWA. |

---

## Diagrams

29 diagrams, all Mermaid, all validated with `mermaid-cli@11` on Node 24 and confirmed rendering live in [`diagrams/index.html`](diagrams/index.html).

| Section | Diagrams |
|---|---|
| [01 — System Design](01-system-design.md) | architecture, components, task-submission flow, attendance flow, score-assignment flow, reminder job, agent chat flow, deployment |
| [02 — API](02-api.md) | resource map, per-request auth, HITL reminder flow, SSE streaming, WhatsApp webhook |
| [03 — AI Agent](03-ai-agent.md) | intent routing, three execution paths, tool-to-resource map |
| [04 — Authorization](04-authorization.md) | token lifecycle, role hierarchy, authorization decision, who-sees-what, escalation flow |
| [05 — Database](05-database.md) | ER diagram (23 tables), migrations, submission / attendance / agent-action / follow-up lifecycles |
| [06 — Frontend](06-frontend.md) | module and flow map |
| [07 — Integrations](07-integrations.md) | integration map |

Each `.mmd` file is embedded in its document, linked from the document, and rendered to SVG in `diagrams/rendered/`. Regenerate:

```bash
cd docs/diagrams
for f in *.mmd; do
  npx -y @mermaid-js/mermaid-cli@11 -i "$f" -o "rendered/${f%.mmd}.svg" -q
done
```

---

## Documentation conventions

- **File paths are always relative to the repository root.** Click any path to jump to the source.
- **Confidence markers are mandatory** for any claim not read directly in code.
- **Prefer a table** over prose whenever comparing more than two things.
- **No diagrams that fail to render.** Every `.mmd` is validated by `mmdc` before it lands here.
- **Corrections are recorded, not silently applied.** Where the code and the brief disagree, both are stated.
- **Security gaps are ranked first** in every gaps list.

---

## Related repository documents

| File | Purpose |
|---|---|
| `AGENTS.md` | Agent execution protocol, RBAC rules, branch and PR workflow, pre-commit checklist |
| `CLAUDE.md` | Claude Code environment, commands, coding guidelines |
| `.github/copilot-instructions.md` | Copilot architecture and coding conventions |
| `README.md` | Project overview and setup |
| `DESIGN.md` | Design system |
