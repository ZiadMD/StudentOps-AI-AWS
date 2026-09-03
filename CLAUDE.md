# CLAUDE.md — Instructions for Claude Code

This file provides project-specific context, commands, and rules for Claude Code interactions on the **StudentOps AI** repository.

---

## Quick Reference Commands

### Python Backend (`backend/`)
- **Package Manager**: Always use `uv`.
- **Install / Sync**: `cd backend && uv sync`
- **Run Backend**: `cd backend && uv run uvicorn app.main:app --reload --port 8000`
- **Run Seed Script**: `cd backend && uv run python -m app.seed.seed_data`
- **Run All Tests**: `cd backend && uv run pytest tests -v`
- **Run Single Test**: `cd backend && uv run pytest tests/unit/test_attendance_policy.py -v`

### Frontend (`frontend/`)
- **Framework**: React 19 + TypeScript + Vite + Tailwind CSS.
- **Install**: `cd frontend && npm install`
- **Dev Server**: `cd frontend && npm run dev`
- **Typecheck & Production Build**: `cd frontend && npm run build` (Strict: must compile with 0 errors)

---

## Codebase Structure

```
StudentOps AI/
├── backend/
│   ├── app/
│   │   ├── agent/          # ReAct engine, prompt templates, tool registry
│   │   ├── api/            # FastAPI routes (agent stream, attendance, tasks, scoreboard, etc.)
│   │   ├── core/           # Config (pydantic-settings), DB async engine, security
│   │   ├── models/         # SQLAlchemy entities & Pydantic schemas
│   │   ├── providers/      # Google Meet/Calendar, WhatsApp/Twilio, OpenRouter clients
│   │   ├── seed/           # Initial mock database seed data
│   │   └── services/       # Deterministic policy engines (Attendance, Scoring, Identity)
│   ├── tests/              # Unit, integration, and evaluation suites
│   ├── pyproject.toml      # Backend dependencies (managed via uv)
│   └── .env.example        # Environment variable template
├── frontend/
│   ├── src/
│   │   ├── api/            # Typed fetch client (proxy to /api)
│   │   ├── components/     # UI screens (AgentChat, Scoreboard, Tasks, Students, etc.)
│   │   │   ├── auth/       # LoginPage & RegisterPage
│   │   │   └── ui/         # Reusable primitives (Button, Card, Badge, ProgressBar)
│   │   ├── types/          # Shared TypeScript interfaces
│   │   ├── App.tsx         # Root auth state machine & tab router
│   │   └── index.css       # Tailwind base & layout styles
│   ├── package.json
│   └── tailwind.config.js
├── AGENTS.md               # Universal Agent instructions
├── CLAUDE.md               # Claude Code specific instructions
└── README.md
```

---

## Coding Guidelines and Rules

### 1. Python / Backend Rules
- **Python Version**: `>= 3.11`.
- **Typing**: Use comprehensive type annotations (`typing.Any`, `Optional`, `AsyncIterator`, Pydantic models).
- **Async First**: All database transactions and external HTTP calls must use `async`/`await` (`AsyncSession`, `httpx.AsyncClient`).
- **Safety**: Sensitive write actions (e.g. `send_reminder`) must yield `REQUIRES_CONFIRMATION` and log pending status to `AgentActionAudit`.
- **Environment**: Read configuration strictly via `app.core.config.settings`. Never hardcode API keys or secrets.

### 2. Frontend / React Rules
- **Strict TypeScript**: Never leave `any` untyped if avoidable. Ensure `npm run build` passes with zero errors before concluding.
- **Component Pattern**: Functional components with React 19 hooks. Use Lucide icons consistently.
- **Styling**: Tailwind CSS utility classes. Clean light mode palette (`#F8FAFC` background, `slate-900` text, `border-slate-200`).
- **Streaming**: For chat, use the native `fetch` + `ReadableStream` reader pointing to `/api/agent/stream`.

### 3. Anti-Slop and No Emoji Standard
- Do not use emojis in UI elements, headers, buttons, toast messages, AI agent chat responses, prompts, documentation, or commit messages.
- Use clean typography or Lucide icons instead.

### 4. Internationalization (Bilingual Arabic / English)
- Maintain dual-language support for names (`full_name` and `arabic_name`), chat responses, and notification templates.
- Preserve Arabic RTL typography using the `Cairo` font where specified.
