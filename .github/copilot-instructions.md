# GitHub Copilot Instructions — StudentOps AI

## Architecture Guidelines
- **Backend Architecture**: FastAPI asynchronous application running on Python 3.11+. Dependencies are managed strictly with `uv`.
- **Frontend Architecture**: React 19 single-page application built with Vite, TypeScript, and Tailwind CSS.
- **Agent System**: ReAct pattern with deterministic domain tools for operational queries (attendance, scores, tasks, schedule) and OpenRouter streaming LLM fallback for conversational queries.
- **Human-in-the-Loop Barrier**: Sensitive actions (e.g. `send_reminder`) require user authorization via `ActionConfirmationRequest` before execution.

## Coding Conventions
1. **Python**: Follow PEP 8 with explicit type hints and Pydantic v2 schemas. Always use `uv run` for executing scripts.
2. **TypeScript**: Strict type checking. Never bypass type errors with `@ts-ignore` or untyped `any` unless strictly necessary for external untyped libraries.
3. **Database**: Always use async session patterns (`AsyncSession` from SQLAlchemy `asyncio`).
4. **Security**: Secrets and API keys must be loaded from environment variables through `app.core.config.settings`. Never hardcode keys in code.
5. **Design System & Anti-Slop**: Follow clean, modern light-mode SaaS aesthetics (Linear / Vercel style). Do NOT use emojis in UI, code, prompts, or agent outputs; use Lucide icons instead.
