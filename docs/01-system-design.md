# 01 — System Design

> Confidence tags: **[VERIFIED]** read directly in the cited file/function · **[INFERRED]** deduced from structure · **[UNKNOWN]** could not be determined.

## 1. Purpose and scope

StudentOps AI is a bilingual (Arabic/English) operations and HR platform for student organizations. It manages committees, members, meetings with attendance capture, tasks and submissions, behavior/task scoring, calendar events, member Q&A, member feedback on HR staff, committee reports, scheduled reminders, and a WhatsApp channel. An AI agent answers natural-language operational questions and can dispatch reminders behind a human-in-the-loop confirmation gate.

**In scope:** the FastAPI backend, the React SPA, the deterministic policy engines, the ReAct agent, the WhatsApp/OpenWA channel, the background automation scheduler, and the persistence layer.

**Out of scope in this codebase:** a real Google Meet integration (stubbed), a real Google Calendar integration (stubbed), any AWS service usage (boto3 is declared but never imported), and the meaning of the `total_score` formula (explicitly deferred).

## 2. Users and primary journeys

Roles are the eight strings in `ROLE_EQUIVALENTS` (`backend/app/core/dependencies.py:106`). Journeys below are traced from route guards in `backend/app/api/routes_*.py`.

| Role | Primary journey | Entry points |
|---|---|---|
| `region_hr_head` | Monitor all committees, read aggregated reports, acknowledge reports, oversight WhatsApp threads, manage nothing operationally | `GET /api/reports`, `POST /api/reports/{id}/acknowledge`, `GET /api/whatsapp/threads?oversight=true` |
| `hr_admin` | System administration: create teams, change user roles, read audit logs, cross-committee override | `POST /api/auth/teams`, `PATCH /api/auth/users/{id}/role`, `GET /api/audit/logs` |
| `committee_hr_leader` | Own a committee: view cohort scores, review and action member feedback, assign cohorts, submit reports upward, read escalation list | `POST /api/students/assign-cohort`, `PATCH /api/feedback/{id}/status`, `POST /api/reports/submit-to-head` |
| `committee_head` / `team_lead` | Technical side: create tasks and meetings, review submissions, assign technical scores. **Read-only on behavior scores. Blocked from member feedback.** | `POST /api/tasks`, `PUT /api/tasks/submissions/{sid}/review`, `POST /api/attendance/meetings` |
| `committee_hr_member` | HR side: process attendance, correct statuses, write behavior scores /23, WhatsApp their assigned cohort, escalate | `POST /api/attendance/meetings/{id}/process`, `PUT /api/students/{id}/behavior-score` |
| `committee_member` / `member` | Submit tasks, view own attendance, submit feedback about HR, ask questions, read own reminders | `POST /api/tasks/{id}/submit`, `POST /api/feedback`, `POST /api/questions` |

**Blocked for committee members entirely:** `/api/students/scoreboard/all`, `/api/students/{id}/score`, `/api/tasks/{id}/scores`, `/api/tasks/submissions/{sid}/score`, and all of `/api/agent/*`. **[VERIFIED]** `routes_students.py:191`, `routes_students.py:245`, `routes_tasks.py:315`, `routes_tasks.py:534`, `routes_agent.py:30`.

## 3. High-level architecture

```mermaid
flowchart TB
    subgraph Client["Client Layer"]
        SPA["React 19 SPA<br/>Vite + TypeScript + Tailwind<br/>frontend/src/App.tsx"]
        SSE["AgentChat SSE Reader<br/>ReadableStream<br/>components/AgentChat.tsx"]
        WS["WhatsApp WebSocket Client<br/>hooks/useWhatsAppThreadSync.ts"]
    end

    subgraph Edge["Edge / Hosting"]
        VERCEL["Vercel Edge<br/>vercel.json rewrites<br/>/api/* to api/index.py"]
        OPENWA["OpenWA Headless Gateway<br/>Docker :2785<br/>WhatsApp Web.js"]
    end

    subgraph API["FastAPI Application - backend/app/main.py"]
        MW["SecurityHeadersMiddleware<br/>CORS + CSP + HSTS"]
        AUTH["Auth / JWT<br/>api/routes_auth.py"]
        RBAC["RBAC Dependencies<br/>core/dependencies.py<br/>require_roles + verify_student_access"]
        REST["Domain Routers<br/>students, tasks, attendance,<br/>whatsapp, feedback, questions,<br/>reports, automation, calendar, audit"]
        AGENT["Agent API<br/>api/routes_agent.py<br/>chat / stream / confirm"]
    end

    subgraph AgentCore["Agent Engine - backend/app/agent"]
        REACT["ReActAgent.run_step<br/>agent/react_agent.py"]
        TOOLS["Tool Registry<br/>agent/tools.py<br/>15 tools"]
        HITL["HITL Gate<br/>/agent/confirm<br/>AgentActionAudit"]
    end

    subgraph SVC["Policy Services - backend/app/services"]
        ATT["AttendanceService<br/>AttendancePolicyEngine<br/>70% / 50% rules"]
        SCO["ScoringService<br/>behavior /23, task /10"]
        AUT["AutomationEngine<br/>BackgroundScheduler 300s"]
        REM["ReminderService"]
        IDM["IdentityMatcher"]
        AUD["AuditService"]
        WAC["WhatsAppService"]
    end

    subgraph Providers["Providers - backend/app/providers"]
        MEET["GoogleMeetAttendanceProvider"]
        GCAL["GoogleCalendarProvider"]
        MSG["MessagingProvider<br/>mock | openwa"]
        OWAP["OpenWAProvider<br/>httpx + timeouts"]
    end

    subgraph Data["Persistence"]
        DB[("SQLAlchemy 2.0 async<br/>SQLite aiosqlite (dev)<br/>PostgreSQL asyncpg (prod)")]
    end

    subgraph LLM["External LLM"]
        GROQ["Groq API<br/>openai/gpt-oss-120b"]
        OR["OpenRouter API<br/>nemotron-3-super"]
    end

    SPA --> VERCEL
    SSE --> VERCEL
    WS --> VERCEL
    VERCEL --> MW
    MW --> AUTH
    MW --> RBAC
    MW --> REST
    MW --> AGENT
    AGENT --> REACT
    REACT --> TOOLS
    REACT --> HITL
    TOOLS --> ATT
    TOOLS --> SCO
    TOOLS --> REM
    TOOLS --> IDM
    REST --> AUT
    REST --> WAC
    REACT --> AUD
    TOOLS --> DB
    REST --> DB
    AUD --> DB
    HITL --> DB
    ATT --> MEET
    REM --> MSG
    WAC --> OWAP
    OWAP --> OPENWA
    REACT --> GROQ
    REACT --> OR

    classDef ext fill:#fff7ed,stroke:#c2410c,color:#7c2d12
    classDef data fill:#f1f5f9,stroke:#334155,color:#0f172a
    class OPENWA,GROQ,OR ext
    class DB data
```

*Shows every runtime component and its dependency direction. Use it to orient yourself before reading any specific module.*

Standalone source: [`diagrams/01-architecture.mmd`](diagrams/01-architecture.mmd) · rendered: [`rendered/01-architecture.svg`](diagrams/rendered/01-architecture.svg)

## 4. Component responsibilities

```mermaid
flowchart LR
    subgraph Core["core/"]
        C1["config.py<br/>Pydantic Settings<br/>validate_production_secrets"]
        C2["database.py<br/>engine + AsyncSessionLocal<br/>get_db / init_db"]
        C3["security.py<br/>bcrypt hash/verify<br/>JWT create/decode"]
        C4["dependencies.py<br/>get_current_user<br/>require_roles<br/>verify_student_access"]
        C5["rate_limiter.py<br/>SlidingWindowRateLimiter"]
    end

    subgraph Model["models/"]
        M1["entities.py<br/>24 SQLAlchemy tables"]
        M2["schemas.py<br/>Pydantic v2 contracts<br/>PermissionContext frozen"]
    end

    subgraph Agent["agent/"]
        A1["prompts.py<br/>SYSTEM_PROMPT"]
        A2["react_agent.py<br/>run_step + is_deterministic_intent<br/>BoundedConversationState"]
        A3["tools.py<br/>TOOL_DEFINITIONS<br/>TOOL_REGISTRY"]
    end

    subgraph Svc["services/"]
        S1["attendance_service.py<br/>AttendancePolicyEngine"]
        S2["scoring_service.py"]
        S3["automation_service.py<br/>run_cycle + scheduler"]
        S4["reminder_service.py"]
        S5["identity_matcher.py"]
        S6["audit_service.py"]
        S7["whatsapp_service.py"]
        S8["whatsapp_connection_manager.py"]
        S9["calendar_service.py"]
    end

    subgraph Prov["providers/"]
        P1["attendance_provider.py<br/>Google + Mock"]
        P2["calendar_provider.py<br/>Google + Mock"]
        P3["messaging_provider.py<br/>factory: mock|openwa"]
        P4["openwa_provider.py"]
    end

    subgraph Api["api/"]
        R1["routes_auth"]
        R2["routes_students"]
        R3["routes_tasks"]
        R4["routes_attendance"]
        R5["routes_whatsapp"]
        R6["routes_agent"]
        R7["routes_feedback"]
        R8["routes_questions"]
        R9["routes_reports"]
        R10["routes_automation"]
        R11["routes_dashboard"]
        R12["routes_calendar"]
        R13["routes_audit"]
    end

    Seed["seed/seed_data.py"]
    Mig["alembic/versions<br/>4 migrations"]

    R1 --> C3
    R1 --> C4
    R2 --> S2
    R2 --> C4
    R3 --> C4
    R4 --> S1
    R5 --> S7
    R6 --> A2
    R7 --> C4
    R8 --> C4
    R9 --> C4
    R10 --> S3
    R11 --> C4
    R12 --> S9
    R13 --> S6
    C4 --> C5
    C4 --> C1
    A2 --> A3
    A3 --> S1
    A3 --> S2
    A3 --> S4
    A3 --> S5
    S1 --> P1
    S4 --> P3
    S7 --> P4
    S9 --> P2
    A2 --> A1
    A2 --> M2
    R1 --> M2
    R2 --> M1
    C2 --> M1
    Seed --> M1
    Mig --> M1
    S3 --> C2
```

*Module-level dependency map. Use it to find which file owns a behavior before changing it.*

Standalone source: [`diagrams/01-components.mmd`](diagrams/01-components.mmd)

| Component | File | Responsibility | Notable detail |
|---|---|---|---|
| Settings | `app/core/config.py` | All env config, `.env` loading, production secret guard | `validate_production_secrets` raises at import if `ENVIRONMENT=production` and `JWT_SECRET_KEY` is the dev default or `DATABASE_URL` contains `sqlite` **[VERIFIED]** |
| DB session | `app/core/database.py` | Async engine, `get_db()` dependency, `init_db()` | Relative SQLite paths anchored to `backend/`; pooled Postgres URLs disable prepared-statement caches **[VERIFIED]** `database.py:41-52` |
| Auth crypto | `app/core/security.py` | bcrypt (rounds=12), access/refresh JWT, invitation tokens | Refresh tokens carry a `jti`; invitations are SHA-256 hashed before storage **[VERIFIED]** |
| RBAC | `app/core/dependencies.py` | `get_current_user`, `get_current_active_user`, `require_roles`, `verify_student_access` | `verify_student_access` has a `mode` of `read` / `write` / `chat` with different rules per role **[VERIFIED]** `dependencies.py:163-253` |
| Rate limiter | `app/core/rate_limiter.py` | In-memory sliding-window log | Keyed on `request.client.host`; ignores `X-Forwarded-For` **[VERIFIED]** `get_client_ip` |
| Policy: attendance | `app/services/attendance_service.py` | Fetch raw logs, match identities, aggregate, classify | Idempotent: deletes `ParticipantSession` rows per meeting before reinsert; preserves existing `excuse_status` **[VERIFIED]** |
| Policy: scoring | `app/services/scoring_service.py` | Build `StudentScoreSummary` | `total_score` is hard-coded `None` with `total_score_status="PENDING_FORMULA_DEFINITION"` **[VERIFIED]** `scoring_service.py:68-70` |
| Identity | `app/services/identity_matcher.py` | Match Meet participants to students | Arabic normalization (أ/إ/آ→ا, ى/ي, ة→ه) then token-set Jaccard confidence **[VERIFIED]** |
| Automation | `app/services/automation_service.py` | 3 cycles + scheduler | Every message written with `status="PENDING_APPROVAL"`; the scheduler never transmits **[VERIFIED]** |
| Agent | `app/agent/react_agent.py` | Intent routing, tool execution, LLM fallback | Keyword intent matching, not LLM function-calling **[VERIFIED]** |
| Tools | `app/agent/tools.py` | 15 registered handlers, role allowlist, team scoping | `PermissionContext` is the only channel for authz into tools **[VERIFIED]** |
| Audit | `app/services/audit_service.py` | Write and read `AgentActionAudit` | Table protected by DB triggers against DELETE and critical-field UPDATE **[VERIFIED]** `entities.py:475-546` |

## 5. Tech stack

Versions from `backend/pyproject.toml` and the resolved `uv.lock` / `backend/requirements.txt`.

| Layer | Technology | Version constraint | Source |
|---|---|---|---|
| Language | Python | `>=3.11` (local venv on 3.14) | `pyproject.toml:5` |
| Web framework | FastAPI | `>=0.115.0` | `pyproject.toml:7` |
| ASGI server | Uvicorn (standard) | `>=0.32.0` | `pyproject.toml:8` |
| Validation | Pydantic v2 + pydantic-settings | `>=2.9.0` / `>=2.5.0` | `pyproject.toml:9-10` |
| ORM | SQLAlchemy (async) | `>=2.0.35` | `pyproject.toml:12` |
| DB drivers | `aiosqlite` (dev), `asyncpg` (prod) | `>=0.20.0` / `>=0.30.0` | `pyproject.toml:13,20` |
| Migrations | Alembic | `>=1.19.2` | `pyproject.toml:23` |
| Auth crypto | `pyjwt`, `bcrypt` | `>=2.8.0` / `>=4.0.0` | `pyproject.toml:18-19` |
| HTTP client | `httpx` | `>=0.27.2` | `pyproject.toml:17` |
| LLM HTTP | `httpx` direct (no SDK) | — | `agent/react_agent.py` |
| LLM providers | Groq, OpenRouter | REST `/chat/completions` | `core/config.py:48-58` |
| Frontend | React | 19 | `frontend/package.json` |
| Build | Vite + TypeScript strict | — | `frontend/package.json` |
| Styling | Tailwind CSS | — | `frontend/tailwind.config.js` |
| Icons | Lucide React | — | `frontend/package.json` |
| Hosting | Vercel serverless + static | `maxDuration: 60` | `vercel.json` |
| Messaging | OpenWA (`openwa/wa-automate`) via Docker | — | `docker-compose.yml` |
| CI | GitHub Actions | — | `.github/workflows/ci.yml` |

**Correction to the design notes:** `boto3>=1.35.0` is declared in `pyproject.toml:15` and pinned to `1.43.80` in `requirements.txt:19`, but a repository-wide search of `backend/app/` and `api/` finds **zero** `import boto3`. The AWS SDK is not used by the running application. **[VERIFIED]**

## 6. Key flows

### 6.1 Task submission and review

```mermaid
sequenceDiagram
    autonumber
    actor Member as Committee Member
    participant SPA as React SPA
    participant API as FastAPI /api/tasks
    participant Head as Committee Head
    participant DB as Database

    Member->>SPA: Open task detail
    SPA->>API: POST /api/tasks/{task_id}/submit
    API->>API: require_roles(["committee_member","member"])
    API->>DB: SELECT Task WHERE id = task_id
    API->>DB: SELECT Submission WHERE task_id AND student_id
    alt No existing submission
        API->>DB: INSERT Submission(status = ON_TIME | LATE)
    else Existing PENDING submission
        API->>DB: UPDATE Submission SET status, submitted_at, file_url
    end
    API-->>SPA: 200 SubmissionSchema (scores redacted to null)
    SPA-->>Member: "Submitted"

    Note over Head,DB: Committee Head reviews the deliverable
    Head->>API: PUT /api/tasks/submissions/{submission_id}/review
    API->>API: require_roles(["committee_head","team_lead","hr_admin"])
    API->>DB: SELECT Submission JOIN Student JOIN Task
    API->>API: Check student.team_id == caller.team_id
    alt Cross-committee
        API-->>Head: 403 Forbidden
    else Same committee
        API->>API: Reject score > task.max_score
        API->>DB: UPDATE Submission SET score, technical_score,<br/>reviewer_notes, reviewed_at, graded_by_user_id
        API->>DB: AuditService.record_action(REVIEW_TASK_SUBMISSION)
        API-->>Head: 200 SubmissionSchema
    end

    Note over Head,DB: HR reads scores only, never deliverables
    Head->>API: GET /api/tasks/{task_id}/scores
    API->>API: Reject committee_member / member with 403
    API->>DB: SELECT Submission JOIN Student (team scoped)
    API-->>Head: 200 [TaskScoreItemSchema] (no file_url)
```

*The submit → review → score-collection split across three roles. Use it to understand why HR cannot see deliverables.*

Standalone source: [`diagrams/01-flow-task-submission.mmd`](diagrams/01-flow-task-submission.mmd)

The deliberate separation: `committee_hr_member` writes **behavior** scores (`/23`) but is **forbidden** (`403`) from `GET /api/tasks/{task_id}/submissions` and `GET /api/tasks/submissions/{sid}`; `committee_head` writes **technical** scores (`/10`) but is **forbidden** from `PUT /api/students/{id}/behavior-score`. **[VERIFIED]** `routes_tasks.py:394-399`, `routes_students.py:266`.

### 6.2 Attendance capture

```mermaid
sequenceDiagram
    autonumber
    actor HR as Committee HR Member
    participant API as FastAPI /api/attendance
    participant Eng as AttendancePolicyEngine
    participant Prov as GoogleMeetAttendanceProvider
    actor GMeet as Google Meet
    participant IDM as IdentityMatcher
    participant DB as Database

    HR->>API: POST /api/attendance/meetings/{meeting_id}/process
    API->>API: require_roles(["committee_hr_member","hr_admin"])
    API->>DB: SELECT Meeting
    alt Other committee's meeting
        API-->>HR: 403 Forbidden
    end
    API->>Eng: process_meeting_attendance(meeting_id, db)

    Eng->>DB: SELECT assigned students (MeetingAssignment, else team_id)
    Eng->>Prov: get_raw_meeting_attendance(meeting_code)
    Prov->>GMeet: Fetch conference record participants
    GMeet-->>Prov: display_name, email, join_time, leave_time, duration
    Prov-->>Eng: RawMeetingAttendance.sessions

    Eng->>DB: DELETE ParticipantSession WHERE meeting_id (idempotency reset)

    loop For each raw participant session
        Eng->>IDM: match_participant(display_name, email, students)
        IDM-->>Eng: MatchResult(student_id, confidence, matched_by)
        IDM->>IDM: Tier 1 exact email (1.0)<br/>Tier 2 Arabic name<br/>Tier 3 Latin name
        Eng->>DB: INSERT ParticipantSession
    end

    loop For each assigned student
        Eng->>Eng: first_join = MIN(join_time)<br/>total_duration = SUM(seconds)/60
        alt No session
            Eng->>Eng: status = UNEXCUSED_ABSENT
        else Has session
            Eng->>Eng: delay = first_join - meeting_start<br/>pct = duration / meeting_duration * 100
            alt delay <= 10m AND pct >= 70
                Eng->>Eng: status = PRESENT
            else pct >= 50
                Eng->>Eng: status = LATE
            else
                Eng->>Eng: status = UNEXCUSED_ABSENT
            end
        end
        alt status == UNEXCUSED_ABSENT
            Eng->>DB: INSERT MemberFollowupStatus(flagged_reason = ABSENT_{code}, status = PENDING)
        end
    end

    Eng->>DB: COMMIT
    Eng-->>API: [AttendanceRecord]
    API-->>HR: 200 { success, processed_count }
```

*The deterministic attendance pipeline. Use it when debugging why a member was or was not marked absent.*

Standalone source: [`diagrams/01-flow-attendance.mmd`](diagrams/01-flow-attendance.mmd)

Policy thresholds come from settings, not literals: `ATTENDANCE_LATE_THRESHOLD_MINUTES=10`, `ATTENDANCE_MIN_PRESENT_PERCENT=70.0`, `ATTENDANCE_MIN_LATE_PERCENT=50.0`. **[VERIFIED]** `core/config.py:82-84`. A per-call `late_threshold_minutes` override exists on `AttendancePolicyEngine.evaluate_status` and `process_meeting_attendance` but no REST endpoint passes it — it is always `None` in the current API. **[VERIFIED]**

### 6.3 Score assignment

```mermaid
sequenceDiagram
    autonumber
    actor HRM as Committee HR Member
    participant API as FastAPI /api/students
    participant Dep as verify_student_access
    participant Svc as ScoringService
    participant DB as Database

    HRM->>API: PUT /api/students/{student_id}/behavior-score
    API->>API: require_roles(["committee_hr_member","hr_admin"])
    API->>Dep: verify_student_access(student_id, user, db)
    alt role == committee_hr_member AND not assigned
        Dep-->>API: 403 "you are not assigned to this member"
    end
    Dep-->>API: Student

    API->>API: Validate ranges:<br/>group_interaction 0-5, social_media 0-5,<br/>hierarchy_rules 0-5, polite_conduct 0-8, interaction 0-5
    loop For each of 5 categories
        API->>DB: SELECT ScoreRecord WHERE student_id, category[, month]
        alt Record exists
            API->>DB: UPDATE points, notes, graded_by_user_id, updated_by
        else New
            API->>DB: INSERT ScoreRecord(max_points per category)
        end
    end
    API->>DB: COMMIT
    API->>Svc: get_student_score_summary(student_id, db)
    Svc->>DB: SELECT AttendanceRecord, Submission, ScoreRecord
    Svc->>Svc: behavior = group + social + hierarchy + polite
    Svc->>Svc: rating: Outstanding if quality>=8.5 and behavior>=20 and absence==0<br/>Good if quality>=6.0 and behavior>=15 and absence<=2<br/>else Needs Improvement
    Svc-->>API: StudentScoreSummary
    API-->>HRM: 200 StudentScoreSummary

    Note over API,DB: Committee Head is read-only. No endpoint in routes_students.py<br/>allows committee_head to write behavior scores.
```

*Behavior-score upsert across five categories and the rating rule. Use it when changing the /23 rubric.*

Standalone source: [`diagrams/01-flow-score-assignment.mmd`](diagrams/01-flow-score-assignment.mmd)

The `INTERACTION` category (max 5) is written by this endpoint and returned as `interaction_score`, but it is **excluded** from `total_behavior_score` (which sums only group + social + hierarchy + polite = 5+5+5+8 = 23). **[VERIFIED]** `scoring_service.py:60-64`.

### 6.4 Reminder job

```mermaid
sequenceDiagram
    autonumber
    participant Life as FastAPI lifespan
    participant Sch as BackgroundScheduler<br/>interval 300s
    participant Eng as AutomationEngine
    participant DB as Database
    actor HR as HR Leader

    Life->>Sch: scheduler.start()
    loop Every 300 seconds
        Sch->>Eng: run_cycle(session)
        Eng->>Eng: run_attendance_cycle()
        Eng->>DB: SELECT Meetings in last 48h
        loop Each meeting past end + grace
            Eng->>DB: SELECT AttendanceRecord status = UNEXCUSED_ABSENT
            Eng->>DB: SELECT existing ReminderLog by trigger_source
            alt Not already sent (idempotency key AUTOMATION_ATTENDANCE_{meeting_id})
                Eng->>Eng: render_template(whitelist: name, session_name, meeting_time)
                Eng->>DB: INSERT ReminderLog(status = PENDING_APPROVAL)
            end
        end
        Eng->>Eng: run_task_cycle()
        loop Each task with deadline >= now - 7 days
            alt Pre-deadline window (task_pre_hours)
                Eng->>DB: get_task_reminder_candidates(pre_deadline=True)
                Eng->>DB: INSERT TaskReminder(stage=1) + ReminderLog
            end
            alt Past post_trigger_time (deadline + task_post_delay_hours)
                Eng->>DB: get_task_reminder_candidates(pre_deadline=False)
                Eng->>DB: INSERT TaskReminder(stage=2) + ReminderLog
                alt student.assigned_hr_id present
                    Eng->>DB: INSERT MemberFollowupStatus(OVERDUE_TASK, PENDING)
                end
            end
        end
        Eng->>Eng: run_pre_meeting_cycle()
        loop Each meeting in next 24h
            Eng->>DB: SELECT students via MeetingAssignment
            Eng->>DB: INSERT ReminderLog(trigger_source = AUTOMATION_PRE_MEETING_{id})
        end
        Eng->>DB: COMMIT
    end
    Note over Eng,DB: Every queued message is PENDING_APPROVAL. Nothing is transmitted<br/>by the scheduler. Human approval is required downstream.

    HR->>Sch: POST /api/automation/trigger-run
    HR->>Eng: require_roles(["region_hr_head","committee_hr_leader","hr_admin"])
    Eng-->>HR: 200 { status, triggered_by, results }
    HR->>DB: GET /api/automation/reminders (review queue)
```

*Scheduler lifecycle, the three cycles, and idempotency keys. Use it when adding or debugging an automated notification.*

Standalone source: [`diagrams/01-flow-reminder-job.mmd`](diagrams/01-flow-reminder-job.mmd)

| Property | Value | Source |
|---|---|---|
| Schedule | `asyncio` task, `interval_seconds = 300` | `automation_service.py:459` |
| Trigger | Started in the FastAPI `lifespan` handler; stopped on shutdown | `main.py:39,45` |
| Idempotency | `ReminderLog.trigger_source` = `AUTOMATION_ATTENDANCE_{meeting.id}` / `AUTOMATION_TASK_PRE_{task.id}` / `AUTOMATION_TASK_POST_{task.id}` / `AUTOMATION_PRE_MEETING_{meeting.id}`; also `TaskReminder(task_id, student_id, stage)` uniqueness check | `automation_service.py:152-160,232-241,296-305` |
| Multi-instance | None. The scheduler starts per process. Two workers would double-run, but the `trigger_source` pre-fetch prevents duplicate `ReminderLog` rows within a run. **[INFERRED]** | `automation_service.py:441-459` |
| Failure handling | The whole cycle is wrapped in `try/except`; a failure logs and the loop sleeps, so it never crashes the app | `automation_service.py:447-450` |
| Template safety | `render_template` replaces only `{name}`, `{task_name}`, `{deadline}`, `{session_name}`, `{meeting_time}` — no `eval`, no format-string injection | `automation_service.py:41-66` |
| Actual sending | Never. All rows are written with `status="PENDING_APPROVAL"`. Only the agent HITL path (`tool_send_reminder` after `/api/agent/confirm`) actually calls `provider.send_batch` | `automation_service.py:180,246,309,368` |

### 6.5 Agent chat request

```mermaid
sequenceDiagram
    autonumber
    actor HR as HR Leader (browser)
    participant SPA as AgentChat.tsx
    participant API as POST /api/agent/stream
    participant ReAct as ReActAgent
    participant Tools as TOOL_REGISTRY
    participant DB as Database
    participant LLM as Groq / OpenRouter

    HR->>SPA: "Who was absent from today's meeting?"
    SPA->>API: POST /api/agent/stream (Bearer token)
    API->>API: rate_limit_agent (25/min per IP)
    API->>API: require_roles([...6 HR/lead roles])

    API->>ReAct: is_deterministic_intent(query)
    ReAct-->>API: true (matched "absent"/"attendance")

    API->>ReAct: run_step(query, conversation_id, user_role, team_id, user_id)
    ReAct->>ReAct: Build PermissionContext(user_id, role, team_id,<br/>is_admin_override, is_confirmed_action=False)
    ReAct->>ReAct: state key = "{user_id}:{conversation_id}"

    ReAct->>Tools: execute_tool("get_meeting_attendance", {meeting_id:"latest"})
    Tools->>Tools: Check TOOL_DEFINITIONS.required_roles vs context.role
    alt Role not permitted
        Tools-->>ReAct: { error: "Unauthorized..." }, FAILED
    else Permitted
        Tools->>Tools: Apply team scope (Student.team_id == context.team_id)
        Tools->>DB: SELECT AttendanceRecord JOIN Student
        Tools-->>ReAct: { summary, present_students, absent_students }, SUCCESS
    end

    ReAct->>DB: AuditService.record_action(QUERY_ATTENDANCE)
    ReAct-->>API: AgentChatResponse(response, tool_executions, audit_id)

    API-->>SPA: SSE event type=tool (tool_name, status, result)
    loop Word by word
        API-->>SPA: SSE event type=token (content)
    end
    API-->>SPA: SSE event type=done (requires_confirmation=false, audit_id)

    Note over SPA,DB: Fallback path when is_deterministic_intent is false
    API->>DB: CONVERSATION_STATE["{user_id}:{conversation_id}"].history
    API->>LLM: stream_groq (tier 1) -> OpenRouter (tier 2)
    LLM-->>API: SSE data: chunks
    API-->>SPA: SSE event type=token
    API->>DB: AuditService.record_action(LLM_STREAM_CHAT, response truncated to 500 chars)
    API-->>SPA: SSE event type=done
```

*One full agent turn, deterministic branch and LLM fallback. Use it when debugging why the agent called the LLM when it should not have.*

Standalone source: [`diagrams/01-flow-agent-chat.mmd`](diagrams/01-flow-agent-chat.mmd)

## 7. Deployment and infrastructure

```mermaid
flowchart TB
    subgraph Prod["Production - Vercel Serverless"]
        V1["Vercel Edge Network<br/>TLS termination, HSTS"]
        V2["Static Assets<br/>frontend/dist SPA"]
        V3["Serverless Function<br/>api/index.py<br/>maxDuration 60s"]
        V4["Vercel Env Vars<br/>injected at runtime"]
    end

    subgraph App["Application"]
        A1["FastAPI ASGI app<br/>app.main:app"]
        A2["SecurityHeadersMiddleware<br/>nosniff, DENY, CSP, HSTS"]
        A3["Uvicorn (local dev)"]
    end

    subgraph DataTier["Data Tier"]
        D1[("Supabase PostgreSQL<br/>PgBouncer transaction pooler<br/>port 6543")]
        D2[("SQLite aiosqlite<br/>local dev only")]
    end

    subgraph SelfHosted["Self-hosted Sidecar - never on Vercel"]
        S1["OpenWA Container<br/>openwa/wa-automate:latest<br/>port 2785"]
        S2["WhatsApp Web.js session<br/>volume openwa_data"]
        S3["Cloudflare Tunnel<br/>cloudflared tunnel run"]
    end

    subgraph Third["Third-party APIs"]
        T1["Google Meet / Calendar API"]
        T2["Groq API"]
        T3["OpenRouter API"]
    end

    V1 --> V2
    V1 --> V3
    V3 --> A1
    A1 --> A2
    V4 -.-> A1
    A3 --> A1
    A1 --> D1
    A1 -.dev only.-> D2
    A1 --> S1
    S1 --> S2
    S3 --> S1
    A1 --> T1
    A1 --> T2
    A1 --> T3

    note1["A1 cannot reach S1 from Vercel serverless.<br/>Self-hosted OpenWA must be exposed via<br/>the Cloudflare Tunnel, and OPENWA_API_URL<br/>must point at that public URL."]
    A1 -.-> note1
```

*Where each piece runs and what can reach what. Use it to reason about network reachability and the serverless constraint.*

Standalone source: [`diagrams/01-deployment.mmd`](diagrams/01-deployment.mmd)

| Environment | Definition | Behavior |
|---|---|---|
| Local dev | `ENVIRONMENT=development`, `DATABASE_URL=sqlite+aiosqlite:///./studentops.db` | `init_db()` creates tables, `seed_all()` runs automatically on startup, mock providers are selected, `DEBUG=true` leaks exception text in 500 responses | 
| Production | `ENVIRONMENT=production` | `config.py` refuses to start on the default `JWT_SECRET_KEY` or a SQLite `DATABASE_URL`; HSTS header added; `DEBUG` defaults `False` in the code path used by the exception handler; **seeding is skipped**; live providers selected |

**Secrets handling.** All secrets come from environment variables via `pydantic-settings` (`Settings` in `app/core/config.py`), loaded from `backend/.env` with `override=False` so real env vars win. `backend/.env.example` is the template. CI fails the build if `backend/.env` is tracked in git and runs a TruffleHog `--only-verified` scan. **[VERIFIED]** `.github/workflows/ci.yml:52-68`.

**Notable deployment constraint:** `BackgroundScheduler.start()` runs in the FastAPI lifespan. On Vercel serverless that means the 300-second automation loop never fires (a function is torn down well before 300 s of continuous execution, and `maxDuration` is 60 s). `POST /api/automation/trigger-run` is therefore the only working path on Vercel. **[INFERRED]** from `vercel.json` `maxDuration: 60` and `main.py:39`.

## 8. Non-functional characteristics

### Error handling

- A global `@app.exception_handler(Exception)` in `main.py:96` returns a generic message in production and the exception text only when `DEBUG and ENVIRONMENT == "development"`.
- Domain handlers raise `HTTPException` with explicit codes. Validation errors are Pydantic v2 (422).
- **Leaked `str(e)` in one production path:** `AttendanceService.process_meeting_attendance` raises `ValueError(f"Meeting with ID/code '{meeting_id}' not found.")`, which `POST /api/attendance/meetings/{id}/process` converts to a 404 body containing that text. Low severity — it echoes back the caller's own input. **[VERIFIED]** `routes_attendance.py:236-237`
- `global_exception_handler` logs `exc_info=True`, so tracebacks go to the server log but not the response in production.

### Logging

- `logging.getLogger("studentops.security")` for the app and `logging.getLogger("studentops.automation")` for the scheduler. No structured logging, no request IDs, no correlation IDs. **No logging configuration is set up** — the default `logging` behaviour applies (WARNING to stderr for the root logger; `logger.info` calls in `automation_service.py` will not be emitted unless the app configures logging). **[VERIFIED]**

### Rate limits

| Key | Limit | Window | Applied to |
|---|---|---|---|
| `rate_limit_login` | 60 | 60 s | `POST /api/auth/login`, `POST /api/auth/token` |
| `rate_limit_register` | 5 | 60 s | `POST /api/auth/register` |
| `rate_limit_refresh` | 30 | 60 s | `POST /api/auth/refresh` |
| `rate_limit_agent` | 25 | 60 s | `POST /api/agent/chat`, `POST /api/agent/stream` |
| `rate_limit_webhook` | 120 (hard-coded) | 60 s | `POST /api/whatsapp/webhook` |

`RATE_LIMIT_GENERAL_PER_MINUTE = 120` is **declared in `config.py:102` but never used** — no general dependency is created. **[VERIFIED]**

### Security headers

Set by `SecurityHeadersMiddleware` (`main.py:52-77`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, a CSP with `frame-ancestors 'none'`, and HSTS when `ENVIRONMENT=production`.

### Scalability limits

- **Rate limiting is per-process and in-memory.** With more than one worker, effective limits multiply. **[VERIFIED]**
- **Agent conversation state is in-memory** (`BoundedConversationState`, LRU 1000, TTL 24 h). It is lost on restart and not shared between instances, so a chat cannot span a cold start or a second replica. **[VERIFIED]** `react_agent.py:22-146`
- **Provider selection happens at import time** (`tools.py:37-38`). Changing `MESSAGING_PROVIDER` requires a process restart. **[VERIFIED]**
- `ScoringService.get_all_summaries` runs 3 queries per student in a Python loop — an N+1 that grows linearly with member count. Called by `GET /api/students/scoreboard/all` and `tool_get_scores`. **[VERIFIED]** `scoring_service.py:95-106`
- `routes_tasks.py:list_tasks` issues 3 queries per task in a loop (assignment count, submissions, assignment count again). **[VERIFIED]**

### Known trade-offs

1. **Deterministic-first agent.** Keyword intent matching before any LLM call keeps operational answers exact and free, at the cost of brittleness on novel phrasings. A miss silently falls through to the LLM, which is instructed not to answer operational questions.
2. **Score/submission separation.** A clean confidentiality boundary, but it means no single role can see the full picture of a submission's grading.
3. **`create_all` over Alembic at startup.** Convenient for a demo; it makes the migration history non-authoritative. See [05-database.md](05-database.md) §5.
4. **Mock providers as the default.** Demos and tests are deterministic and offline; a production deployment must set `ENVIRONMENT=production` or `MESSAGING_PROVIDER=openwa` or it will silently run on fakes.

## 9. Gaps and open questions

| # | Item | Severity |
|---|---|---|
| 1 | `boto3` is a declared dependency with no usage. Either remove it or the AWS integration is unfinished. | Low |
| 2 | `GoogleMeetAttendanceProvider` and `GoogleCalendarProvider` are stubs. Attendance in any non-mock environment returns an empty session list, which makes every student `UNEXCUSED_ABSENT`. | **High (functional)** |
| 3 | The background scheduler cannot run on Vercel serverless (`maxDuration: 60`). Automation is effectively dead in production unless a long-lived host is used. | **High (functional)** |
| 4 | No logging configuration. `automation_service` `logger.info` calls are silently dropped. | Medium |
| 5 | `RATE_LIMIT_GENERAL_PER_MINUTE` is dead config. | Low |
| 6 | The ReAct loop has no max-step cap because it is a single-pass intent router, not an iterative loop. If a true iterative ReAct loop is intended, a step limit and token budget do not exist yet. | Medium (design) |
| 7 | `openwa_provider.py` is 746 lines in a single module, mixing transport parsing, phone normalization, throttling, and response shaping. | Low (maintainability) |
| 8 | `route` handlers mix authorization, business logic, and response construction; there is no service layer between `api/` and `services/` for most domains. | Low (maintainability) |
