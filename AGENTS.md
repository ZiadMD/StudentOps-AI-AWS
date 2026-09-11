# AGENTS.md — StudentOps AI Agent & Workspace Guide

StudentOps AI is an AI-driven operations and HR platform for student organizations and collegiate communities. It combines deterministic policy engines (attendance, scoring, identity matching) with an autonomous ReAct agent (SSE streaming, human-in-the-loop confirmations).

This guide codifies the exact standards, engineering workflow, and delivery protocols for all AI agents and contributors working across the codebase.

---

## 1. Quick Commands

### Backend (Python 3.11+, uv mandatory — never use raw pip/python)
```bash
cd backend
uv sync                                            # Install/sync dependencies
uv run python -m app.seed.seed_data                # Seed database
uv run uvicorn app.main:app --reload --port 8000   # Dev server (port 8000)
uv run pytest tests -v                             # Run all tests
uv run pytest tests/unit/test_students.py -v       # Single test file
```

### Frontend (React 19, TypeScript, Vite, Tailwind)
```bash
cd frontend
npm install                      # Install dependencies
npm run dev                      # Dev server (port 5173, proxies /api to :8000)
npm test -- --run                # Run all frontend tests (vitest)
npm run build                    # Typecheck + production build (must pass with 0 errors)
```

### One-Click Launch (PowerShell from repo root)
```powershell
& ".\start-dev.ps1"
```

---

## 2. System Architecture (5 Layers)

```
Frontend Shell (App.tsx)
  │
  ▼
FastAPI API & Routing (/api)
  │
  ▼
ReAct Intent & Agent Loop (/agent) ──[Requires Confirmation]──► HITL Gate (/agent/confirm)
  │
  ▼
Deterministic Policy Engines (/services)
  │
  ▼
Persistence Layer (Async SQLite / SQLAlchemy 2.0)
```

| Layer | Path | Responsibility |
|-------|------|----------------|
| 1. Frontend Shell | `frontend/src/App.tsx`, `components/` | Sidebar, auth state, responsive UI, SSE reader, modal dialogs |
| 2. API & Routing | `backend/app/api/` | REST endpoints, `/agent/stream` (SSE), `/agent/confirm` (HITL) |
| 3. ReAct Engine | `backend/app/agent/` | Intent router, tool registry (`tools.py`), LLM streaming |
| 4. Policy Engines | `backend/app/services/` | Attendance rules (70%/50%), Scoring (/23 behavior, /10 tasks), Identity matcher |
| 5. Persistence | `backend/app/core/database.py` | Async SQLAlchemy 2.0 + aiosqlite |

---

## 3. Agent Operating Protocol (The 5-Step Execution Loop)

All agents working on this codebase must follow this disciplined 5-step lifecycle to guarantee zero regressions, zero hallucinations, and zero half-baked features:

### Step 1: Research First (Read-Only Discovery)
- Never start writing code blindly.
- Audit all relevant layers:
  - Backend database models (`entities.py`) and Pydantic contracts (`schemas.py`).
  - FastAPI routers (`routes_*.py`) and dependencies/RBAC boundaries (`dependencies.py`).
  - Frontend API client (`client.ts`) and shared types (`types/index.ts`).
  - Frontend components, modals, and active views (`components/`).
  - Existing test suites in `backend/tests/` and `frontend/src/test/`.

### Step 2: Architecture & Alignment Plan
- Formulate an explicit plan before making non-trivial modifications.
- Define:
  - Exact API paths, HTTP methods, status codes, and request/response payloads.
  - Role-Based Access Control (RBAC) scoping rules.
  - Edge cases: duplicate handling (`409 Conflict`), missing references (`404 Not Found`), input validation (`422 Unprocessable Entity`).
  - UI mechanics: modal states, loading indicators, error banners, and post-action state synchronization.
- Obtain alignment on significant design decisions.

### Step 3: Vertical-Slice Implementation ("Make No Mistakes")
- Always build complete vertical slices: never leave loose ends.
  - If a UI button exists (e.g. "Add Member", "Create Session"), the corresponding modal, API client method, backend route, and validation guards must all exist and work.
  - Never drop fetched API data or render static mock placeholders when real endpoints exist.
- Ensure strict error containment:
  - When a backend action fails (e.g. duplicate email), show clear inline error feedback in the UI without closing the modal or clearing the user's input.
  - Disable submit buttons and display spinners during network operations to prevent duplicate submissions.

### Step 4: Automated Verification Rigor
- Every new feature or endpoint must include automated test coverage:
  - **Backend**: Pytest unit tests in `backend/tests/unit/` covering success cases, unauthorized attempts (`403`), duplicate conflicts (`409`), missing entities (`404`), and validation failures.
  - **Frontend**: Vitest / Testing Library tests in `frontend/src/test/` verifying component rendering, user interactions, and API call payloads.
- Run local validation checks before committing:
  - `cd frontend && npm run build` (0 TypeScript / JSX errors).
  - `cd backend && uv run pytest tests -v` (100% passing).

### Step 5: Git Lifecycle, PR & CI Automation
- Strictly adhere to branch isolation and pull request workflow (detailed in Section 6).
- Never push or merge with pending or failing CI checks.

---

## 4. Backend Engineering & RBAC Scoping Rules

### 1. Role-Based Access Control (RBAC) Matrix
The platform enforces a 5-tier organizational role hierarchy defined in `backend/app/core/dependencies.py`:
- `region_hr_head` / `hr_admin`: Unrestricted organization-wide visibility and administrative authority across all committees and members.
- `committee_hr_leader` / `committee_head` / `team_lead`: Authoritative leadership within their specific committee (`team_id`). Strictly prohibited from accessing or modifying members, tasks, or sessions of other committees.
- `committee_hr_member`: HR member within a committee. Handles grading and communication for assigned cohorts or committee members.
- `committee_member` / `member`: General student member. Can only view their own profile, assigned tasks, and public meetings. Strictly forbidden from viewing scoreboards, other members' data, or administrative logs.

### 2. Scoping Enforcement in Endpoints
Every route modifying or reading data must verify organizational boundaries:
```python
# Leadership scoped to own team
if current_user.role in ("committee_head", "committee_hr_leader", "team_lead", "committee_hr_member"):
    if target_team_id and target_team_id != current_user.team_id:
        raise HTTPException(status_code=403, detail="Cannot access resources outside your assigned committee.")
    target_team_id = current_user.team_id
```

### 3. Duplicate Prevention & Entity IDs
- Enforce explicit duplicate checks on unique attributes (emails, student codes, titles) and return `HTTP 409 Conflict`.
- Use standard entity ID prefixes:
  - `stu_...` — Students
  - `usr_...` — Users / Accounts
  - `team_...` — Teams / Committees
  - `meet_...` — Meetings / Sessions
  - `task_...` — Tasks
  - `sub_...` — Submissions
  - `score_...` — Score records
  - `act_...` / `aud_...` — Audit logs

---

## 5. Frontend & Design System Standards

### 1. Light-Mode SaaS Aesthetic
- Background canvas: `#F8FAFC` (Slate-50).
- Surface cards: `bg-white border-slate-200 shadow-xs rounded-xl`.
- Typography: High-contrast Slate (`text-slate-900` titles, `text-slate-500` secondary text).
- Primary actions: `bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold`.

### 2. Dual-Mode Responsive Architecture (Zero Horizontal Scroll on Tables)
Never wrap wide tables in horizontal overflow containers on mobile. Always implement dual-mode responsive views:
- **Desktop (`hidden md:block`)**: Dense, tabular view with composite cells (e.g. primary Arabic name in Cairo font stacked with English name and student code).
- **Mobile (`block md:hidden`)**: Transform table rows into structured, high-utility **Data Cards** with stacked labels, status badges, and full-width touch-friendly actions.
- **Testing Note**: Because both desktop and mobile views render in the DOM, queries like `screen.getByText('Name')` in jsdom will find multiple matches. Always use `screen.getAllByText('Name')` or scope queries to the specific view container.

### 3. Modal Dialog Guidelines
- Always use the shared modal component: `frontend/src/components/ui/Modal.tsx`.
- Support Escape key dismissal, backdrop dismissal, and body scroll lock.
- Display in-modal error banners (`bg-rose-50 border-rose-200 text-rose-700`) for API errors so users retain their form inputs.
- Always provide accessible labels, clear Cancel / Submit actions, and submission loading spinners (`Loader2`).

### 4. Bilingual Typography & Identity
- Arabic text must use the Cairo font (`font-['Cairo']`) and right-to-left direction (`dir="rtl"`) on inputs.
- Display composite member identities: Arabic primary + Latin secondary + student code badge.

### 5. Anti-AI-Slop Design Standards
Permanently adhere to `.agents/skills/anti-ai-slop-design/SKILL.md`:
- **No emojis anywhere**: Never use emojis in UI buttons, titles, cards, or commit messages. Use Lucide icons.
- **No fake trends or phantom deltas**: Never render `+12% from last week` unless backed by real historical calculation.
- **No ghost shortcuts**: Never display shortcut badges like `⌘K` or `Ctrl+Enter` unless bound to functional keyboard listeners.
- **No sci-fi or DevOps jargon**: Use grounded operational vocabulary ("Operations Overview", "Member Registry", "Session Roster" — never "mission control", "cockpit", "telemetry matrix").
- **No duplicate header icon boxes**: Keep page titles purely typographic without repeating sidebar icons in colorful square badges next to headings.

---

## 6. Team Git & Collaboration Workflow (5-Person Model)

To prevent merge conflicts, broken builds, and duplicate work in a multi-developer team:

### 1. Branching & Lifecycle
- **`main` is protected** — never push or commit directly to `main`.
- **Branch naming**: `<type>/<scope>-<short-description>`
  - `feat/` — new feature or endpoint (e.g. `feat/students-add-member`, `feat/attendance-export`)
  - `fix/` — bug fixes (e.g. `fix/auth-expiry`, `fix/table-alignment`)
  - `refactor/` — code cleanup without behavior change
  - `test/` — test suite additions or fixture updates
  - `docs/` or `chore/` — documentation, configuration, dependencies
- **Small batch size**: Keep branches focused and short-lived (< 300–400 lines diff).
- **Task isolation**: 1 task = 1 branch = 1 person.

### 2. Conventional Commits (Strict No Emojis)
Format: `<type>(<scope>): <imperative summary>`
- `feat(students): implement end-to-end add member workflow and modal`
- `fix(attendance): handle grace period on late threshold`
- `test(students): add unit tests for scoping and duplicate guards`
- `docs(agents): update collaboration workflow and execution guide`

### 3. PR, CI & Merge Runbook
Follow this exact command sequence for every task:

1. **Create and switch to feature branch**:
   ```bash
   git checkout -b <type>/<scope>-<short-description>
   ```

2. **Implement and verify locally**:
   ```bash
   cd frontend && npm run build
   npm test -- --run
   cd ../backend && uv run pytest tests -v
   ```

3. **Stage and commit**:
   ```bash
   git add <modified_files>
   git commit -m "<type>(<scope>): <imperative summary>"
   ```

4. **Push branch to origin**:
   ```bash
   git push -u origin <branch-name>
   ```

5. **Create pull request**:
   ```bash
   gh pr create --base main --head <branch-name> --title "<commit-title>" --body "<description>"
   ```

6. **Monitor CI checks until 100% green**:
   ```bash
   gh pr checks <pr-number>
   # or query JSON status:
   gh pr view <pr-number> --json mergeable,statusCheckRollup
   ```
   Do not merge if any check is failing or pending. If a check fails, fix the issue locally, commit, push to the branch, and re-verify.

7. **Squash and merge**:
   ```bash
   gh pr merge <pr-number> --squash --delete-branch
   ```

8. **Sync local environment**:
   ```bash
   git checkout main
   git pull origin main
   ```

---

## 7. Pre-Commit Verification Checklist

Before opening or merging any PR, ensure every item is checked:

- [ ] `cd frontend && npm run build` — 0 TypeScript/JSX compilation errors.
- [ ] `cd frontend && npm test -- --run` — all frontend tests pass.
- [ ] `cd backend && uv run pytest tests -v` — all backend tests pass.
- [ ] No hardcoded secrets in source code (`.env` gitignored).
- [ ] Zero emojis across UI, docs, commit messages, and agent outputs.
- [ ] Bilingual strings preserved with Cairo font for Arabic text.
- [ ] Dual-mode responsive layout verified (no horizontal scrolling on mobile).
- [ ] RBAC boundaries and organizational scoping verified.
- [ ] Anti-AI-slop design heuristics satisfied.

---

## 8. Reference Documentation

- `README.md` — project overview, setup, and model configuration
- `CLAUDE.md` — Claude Code environment and conventions
- `.cursorrules` — Cursor IDE rules
- `.github/workflows/ci.yml` — CI pipeline configuration
- `.agents/skills/anti-ai-slop-design/SKILL.md` — Anti-AI-slop design standards and checklist