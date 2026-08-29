# AGENTS.md — StudentOps AI Workspace Guide

StudentOps AI is an AI-driven operations/HR platform for student organizations. Combines deterministic policy engines (attendance, scoring, identity matching) with an autonomous ReAct agent (SSE streaming, human-in-the-loop confirmations).

## Quick Commands

### Backend (Python 3.11+, uv mandatory — never use raw pip/python)
```bash
cd backend
uv sync                          # Install/sync dependencies
uv run python -m app.seed.seed_data   # Seed database
uv run uvicorn app.main:app --reload --port 8000   # Dev server (port 8000)
uv run pytest tests -v           # Run all tests
uv run pytest tests/unit/test_attendance_policy.py -v  # Single test
```

### Frontend (React 19, TypeScript, Vite, Tailwind)
```bash
cd frontend
npm install                      # Install dependencies
npm run dev                      # Dev server (port 5173, proxies /api to :8000)
npm run build                    # Typecheck + production build (must pass with 0 errors)
```

### One-Click Launch (PowerShell from repo root)
```powershell
& ".\start-dev.ps1"
```

## Architecture (5 Layers)

```
Frontend (App.tsx) → FastAPI (/api) → ReAct Agent (/agent) → Policy Engines (/services) → Async SQLite
```

| Layer | Path | Responsibility |
|-------|------|----------------|
| 1. Frontend Shell | `frontend/src/App.tsx` | Sidebar, auth state machine, SSE reader |
| 2. API & Routing | `backend/app/api/` | `/agent/stream` (SSE), `/agent/confirm` (HITL), REST endpoints |
| 3. ReAct Engine | `backend/app/agent/` | Intent router, tool registry (`tools.py`), OpenRouter streaming |
| 4. Policy Engines | `backend/app/services/` | Attendance (70%/50%), Scoring (/23 behavior, /10 tasks), Identity matcher, Audit log |
| 5. Persistence | `backend/app/core/database.py` | Async SQLAlchemy + aiosqlite |

## Critical Rules

1. **LLM never touches DB/API directly** — all access via typed tools in `app/agent/tools.py`
2. **Human-in-the-loop required** for sensitive actions (`send_reminder`, mass messaging) — tool returns `REQUIRES_CONFIRMATION`, frontend calls `/api/agent/confirm`
3. **Deterministic first** — operational queries (attendance, scores, tasks) resolved via policy engines, not LLM
4. **Zero exposed secrets** — `.env` gitignored; read only via `app.core.config.settings`; `.env.example` maintained with placeholders

## Key Conventions

- **No emojis** anywhere (UI, agent responses, docs, commits) — use Lucide icons/typography
- **Light-mode SaaS aesthetic** — `#F8FAFC` canvas, `bg-white border-slate-200` cards, `text-slate-500` muted headers
- **Bilingual** — English + Arabic (`arabic_name`, Cairo font)
- **Strict TypeScript** — `npm run build` must pass with 0 errors
- **Async everywhere** — DB (AsyncSession), HTTP (httpx.AsyncClient)

## Verification Checklist (before commit)

- [ ] `cd frontend && npm run build` — 0 TypeScript/JSX errors
- [ ] `cd backend && uv run pytest tests -v` — all tests pass
- [ ] No hardcoded secrets in source
- [ ] No emoji slop in new code
- [ ] Bilingual strings preserved

## Reference Files

- `README.md` — full project overview, setup, model options
- `CLAUDE.md` — Claude Code specific instructions
- `.cursorrules` — Cursor IDE rules
- `.github/workflows/ci.yml` — CI pipeline (backend tests + frontend build + secret scan)