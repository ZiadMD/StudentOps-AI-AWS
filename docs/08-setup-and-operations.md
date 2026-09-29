# 08 — Setup and Operations

> Commands verified against `backend/pyproject.toml`, `frontend/package.json`, `.github/workflows/ci.yml`, and `vercel.json`. No real secrets appear in this document.

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Python | 3.11+ (local venv is 3.14) | `requires-python = ">=3.11"` |
| `uv` | latest | Mandatory package manager. **Do not use `pip`.** |
| Node.js | 20+ (CI pins 20) | Vite build |
| npm | 9+ | — |
| Docker + Compose | any | Only for the OpenWA gateway |
| PostgreSQL | 14+ | Optional; SQLite is the dev default |

## 2. Local setup

```bash
# 1. Backend dependencies
cd backend
uv sync

# 2. Environment
cp .env.example .env
# Edit .env. For a pure offline demo, leave MESSAGING_PROVIDER=mock
# and leave the LLM keys empty.

# 3. Database — created and seeded automatically on first boot,
#    or explicitly:
uv run python -m app.seed.seed_data

# 4. Run the API on :8000
uv run uvicorn app.main:app --reload --port 8000
```

```bash
# Frontend, in a second terminal
cd frontend
npm install
npm run dev          # :5173, proxies /api to :8000
```

Open `http://localhost:5173`. Because the backend is on `:8000` and the frontend on `:5173`, the CORS allowlist in `config.py:36-46` already includes both.

### One-click (PowerShell, Windows)

`& ".\start-dev.ps1"` from the repo root. **No equivalent script exists for Linux or macOS** — run the two commands above in separate terminals.

### Sign in

| Role | Email | Password |
|---|---|---|
| Regional HR Head | `region.head@studentops.org` | `head123` |
| HR Admin | `admin@studentops.org` | `admin123` |
| Committee HR Leader | `hr.leader@studentops.org` | `leader123` |
| Committee Head | `media.head@studentops.org` | `lead123` |
| Committee HR Member | `hr.member@studentops.org` | `hrmember123` |
| Committee Member | `member@studentops.org` | `member123` |

Login also accepts a bare username: `region.head` resolves to `region.head@studentops.org` via the implicit-domain lookup in `routes_auth.py:246-248`.

## 3. Environment variables

All loaded through `pydantic-settings` from `backend/.env` with `override=False`, so real environment variables always win. `backend/.env` is gitignored; CI fails the build if it is ever tracked.

### Application

| Name | Type | Default | Required | Purpose | Example |
|---|---|---|---|---|---|
| `ENVIRONMENT` | str | `development` | Yes | Selects secret validation, seeding, HSTS, and provider mode | `production` |
| `DEBUG` | bool | `True` | No | Leaks exception text in 500 responses when `ENVIRONMENT=development` | `false` |
| `PROJECT_NAME` | str | `StudentOps AI` | No | FastAPI title | — |
| `VERSION` | str | `1.0.0` | No | FastAPI version | — |

### Database

| Name | Type | Default | Required | Purpose | Example |
|---|---|---|---|---|---|
| `DATABASE_URL` | str | `sqlite+aiosqlite:///./studentops.db` | **Yes in prod** | SQLAlchemy async URL. `postgres://` and `postgresql://` are auto-rewritten to `+asyncpg` | `postgresql+asyncpg://postgres.PROJ:PW@aws-1-eu-west-1.pooler.supabase.com:6543/postgres` |

**Production refuses to start if `DATABASE_URL` contains `sqlite`.** `validate_production_secrets` raises at import. **[VERIFIED]**

### Supabase (declared, never read)

| Name | Required | Purpose | Example |
|---|---|---|---|
| `SUPABASE_URL` | No | **Unused.** The app reaches Supabase through `DATABASE_URL` only. | `https://PROJ.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | No | Unused. | `sb_publishable_...` |
| `SUPABASE_SECRET_KEY` | No | Unused. A server-side secret — do not populate if not needed. | `sb_secret_...` |
| `SUPABASE_JWKS_URL` | No | Unused. | `https://PROJ.supabase.co/auth/v1/.well-known/jwks.json` |

### JWT

| Name | Type | Default | Required | Purpose | Example |
|---|---|---|---|---|---|
| `JWT_SECRET_KEY` | str | a dev placeholder | **Yes in prod** | HS256 signing key. **Production refuses to boot on the default.** | `<32+ random bytes>` |
| `JWT_ALGORITHM` | str | `HS256` | No | Signing algorithm | — |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | int | `30` | No | Access token lifetime. `.env.example` ships `1440` | `60` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | int | `30` | No | Refresh token lifetime | `7` |

### LLM

| Name | Type | Default | Required | Purpose | Example |
|---|---|---|---|---|---|
| `GROQ_API_KEY` | str | `None` | No | Primary LLM. Unset → the cascade starts at OpenRouter | `gsk_...` |
| `GROQ_MODEL` | str | `openai/gpt-oss-120b` | No | | |
| `GROQ_BASE_URL` | str | `https://api.groq.com/openai/v1` | No | | |
| `OPENROUTER_API_KEY` | str | `None` | No | Secondary LLM | `sk-or-v1-...` |
| `OPENROUTER_MODEL` | str | `nvidia/nemotron-3-super-120b-a12b:free` | No | | |
| `OPENROUTER_BASE_URL` | str | `https://openrouter.ai/api/v1` | No | | |

**Both unset is a valid configuration.** The agent still works for every deterministic intent; only the LLM fallback degrades to a fixed local message.

### Google (declared, never read — both providers are stubs)

| Name | Required | Purpose | Example |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | No | Unused | `...apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | No | Unused | — |
| `GOOGLE_CALENDAR_ID` | No | Unused. Default `primary`. | — |

### Messaging

| Name | Type | Default | Required | Purpose | Example |
|---|---|---|---|---|---|
| `MESSAGING_PROVIDER` | str | `mock` | **Yes for real WhatsApp** | `mock` or `openwa`. Any other value makes the factory raise. Setting `openwa` also switches the Google providers to live. | `openwa` |
| `OPENWA_API_URL` | str | `http://localhost:2785` | **Yes for real WhatsApp** | Gateway base URL | `https://tunnel.example.com` |
| `OPENWA_API_KEY` | str | `None` | **Yes for real WhatsApp** | Outbound auth. Also becomes the container `AUTH_KEY` in compose. | `<random>` |
| `OPENWA_WEBHOOK_SECRET` | str | `None` | **Yes for inbound** | Compared against `X-Webhook-Secret`. Unset → every webhook request gets 401. | `<random>` |
| `OPENWA_SESSION_ID` | str | `ops_official` | No | Official session name | — |
| `OPENWA_OFFICIAL_PHONE` | str | `+201000000000` | No | Fallback display number | — |
| `TWILIO_ACCOUNT_SID` | str | `None` | No | Declared. The Twilio path is not implemented — `WhatsAppProvider` is a stub. | — |
| `TWILIO_AUTH_TOKEN` | str | `None` | No | Same | — |
| `TWILIO_PHONE_NUMBER` | str | `None` | No | Same | — |

### Agent

| Name | Type | Default | Purpose |
|---|---|---|---|
| `AGENT_CONVERSATION_STATE_MAX_ENTRIES` | int | `1000` | LRU bound on in-memory conversation state |
| `AGENT_CONVERSATION_STATE_TTL_SECONDS` | int | `86400` | 24 h TTL |

### Policy thresholds

| Name | Default | Purpose |
|---|---|---|
| `ATTENDANCE_LATE_THRESHOLD_MINUTES` | `10` | Join delay above which a member is not `PRESENT` |
| `ATTENDANCE_MIN_PRESENT_PERCENT` | `70.0` | Duration percentage required for `PRESENT` |
| `ATTENDANCE_MIN_LATE_PERCENT` | `50.0` | Duration percentage required for `LATE` |
| `BEHAVIOR_MAX_SCORE` | `23` | Documented behaviour ceiling (not read by any calculation) |
| `TASK_MAX_SCORE` | `10` | Same |

### Rate limits (requests per 60 s, keyed on client IP)

| Name | Default | Applied to |
|---|---|---|
| `RATE_LIMIT_LOGIN_PER_MINUTE` | `60` | login, token |
| `RATE_LIMIT_REGISTER_PER_MINUTE` | `5` | register |
| `RATE_LIMIT_REFRESH_PER_MINUTE` | `30` | refresh |
| `RATE_LIMIT_AGENT_PER_MINUTE` | `25` | agent chat, agent stream |
| `RATE_LIMIT_GENERAL_PER_MINUTE` | `120` | **Never used** |
| webhook limit | `120`, hard-coded | `POST /api/whatsapp/webhook` |

### CORS

`BACKEND_CORS_ORIGINS` is a JSON list in `.env`. The default covers `localhost:3000/5173/5174/5175/8000`, the `127.0.0.1` equivalents, and `https://studentops-ai.vercel.app`. `allow_origin_regex` additionally permits any `localhost`, `127.0.0.1`, `192.168.x.x`, `10.x.x.x`, or `172.16-31.x.x` origin — for LAN development.

### Docker Compose

| Name | Purpose |
|---|---|
| `OPENWA_API_KEY` | Becomes the container `AUTH_KEY`. **Defaults to `dev_openwa_key_change_in_prod` if unset.** |
| `CLOUDFLARE_TUNNEL_TOKEN` | Authenticates the `cloudflared` tunnel |

## 4. Commands

### Backend

```bash
cd backend
uv sync                                        # install / sync
uv run python -m app.seed.seed_data            # seed (idempotent)
uv run uvicorn app.main:app --reload --port 8000
uv run pytest tests -v                         # all 248 tests
uv run pytest tests/unit/test_rbac.py -v       # one file
uv run pytest tests/security -v                # 20 security files
uv run pytest tests -v --durations=10          # slowest tests
```

### Frontend

```bash
cd frontend
npm install
npm run dev            # :5173
npm run build          # typecheck + production build — must be 0 errors
npm test -- --run      # 9 Vitest files
```

### Database migrations

```bash
cd backend
uv run alembic upgrade head          # apply migrations
uv run alembic revision --autogenerate -m "describe change"
```

**These are not wired into startup or CI.** `init_db()` calls `create_all`. Run `alembic upgrade head` manually whenever you change a column on an existing database.

### Mermaid diagrams

```bash
cd docs/diagrams
npx -y @mermaid-js/mermaid-cli@11 -i 01-architecture.mmd \
  -o rendered/01-architecture.svg
```

To rebuild every diagram in one pass:

```bash
cd docs/diagrams
for f in *.mmd; do
  npx -y @mermaid-js/mermaid-cli@11 -i "$f" -o "rendered/${f%.mmd}.svg" -q
done
```

All 29 diagrams in this directory currently render successfully with mermaid-cli 11 on Node 24. The `rendered/` SVGs are committed, so a documentation-only change still requires re-rendering if a `.mmd` changed.

### OpenAPI

```bash
cd backend && DATABASE_URL="sqlite+aiosqlite:///:memory:" uv run python -c "
import json; from app.main import app
open('../docs/openapi.json','w').write(json.dumps(app.openapi(), indent=2))"
```

Or read it live at `http://127.0.0.1:8000/openapi.json`.

## 5. CI/CD

`.github/workflows/ci.yml`, triggered on push and PR to `main`, `master`, `develop`. Three parallel jobs:

| Job | Steps |
|---|---|
| `backend-test` | `actions/checkout@v4` → `astral-sh/setup-uv@v5` (cached on `backend/pyproject.toml`) → `actions/setup-python@v5` → `uv sync` → `uv run python -m app.seed.seed_data` → `uv run pytest tests -v --durations=10` |
| `frontend-build` | `actions/checkout@v4` → `actions/setup-node@v4` (Node 20, npm cache) → `npm install` → `npm run test` → `npm run build` |
| `security-and-lint` | `actions/checkout@v4` (depth 0) → **fails if `backend/.env` is git-tracked** → `trufflesecurity/trufflehog@main` with `--only-verified` |

**Not in CI:** Alembic drift check, a lint step (ESLint/Ruff are not configured), type checking for the backend, and any deployment step.

## 6. Deployment

### Vercel (current)

`vercel.json` defines:

| Setting | Value |
|---|---|
| `buildCommand` | `cd frontend && npm install && npm run build` |
| `outputDirectory` | `frontend/dist` |
| `api/index.py` | `maxDuration: 60`, excludes `backend/tests/**`, `backend/.pytest_cache/**`, `frontend/**` |
| Rewrites | `/api/(.*)` → `/api/index.py`; `/login`, `/signup`, `/signin`, `/sign-in`, `/sign-up`, `/register`, `/app`, `/app/(.*)` → `/index.html` |

`api/index.py` inserts `backend/` into `sys.path` and re-exports `app.main:app`, so the serverless function mounts the full FastAPI app.

**Set these Vercel environment variables:**

| Variable | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `DEBUG` | `false` |
| `DATABASE_URL` | Supabase Postgres via the pooler |
| `JWT_SECRET_KEY` | A random 32+ byte value. **Boot fails without it.** |
| `OPENROUTER_API_KEY` and/or `GROQ_API_KEY` | For the LLM fallback |
| `OPENWA_API_URL`, `OPENWA_API_KEY`, `OPENWA_WEBHOOK_SECRET` | For WhatsApp |
| `MESSAGING_PROVIDER` | `openwa` |
| `VITE_API_URL` | Leave unset so the client uses the relative `/api` |

**Two hard constraints on Vercel:**

1. **The background scheduler never runs.** `scheduler.start()` begins a 300-second loop in the lifespan, but a function with `maxDuration: 60` is frozen or torn down long before. Automation must be driven by `POST /api/automation/trigger-run` (an external cron) or by moving the backend to a long-lived host.
2. **OpenWA must be publicly reachable.** A serverless function cannot call `localhost:2785`. Use the Cloudflare Tunnel and point `OPENWA_API_URL` at the public hostname.

### Recommended: separate hosts

The current single-deployment shape couples three things that have different lifecycle needs. A cleaner split:

| Component | Host | Why |
|---|---|---|
| `frontend/dist` | Vercel CDN | Static, global, free |
| FastAPI | Railway / Fly / a VPS | Long-lived, so the scheduler works and OpenWA is reachable |
| OpenWA + Cloudflare Tunnel | The same VPS as the API | Latency and no public port needed for the API |

## 7. Logging and monitoring

### What exists

| Logger | Where | Level |
|---|---|---|
| `studentops.security` | `main.py` — startup notice, unhandled exception with `exc_info=True` | warning, error |
| `studentops.automation` | `automation_service.py` — cycle start/stop, cycle errors with `exc_info=True` | info, error |

**No logging configuration exists anywhere in the codebase.** No `logging.basicConfig`, no dictConfig, no handler setup. Python's default root logger emits WARNING and above to stderr, which means **every `logger.info` call in `automation_service.py` is silently discarded** — including the scheduler start/stop messages. **[VERIFIED]**

### What does not exist

| Missing | Impact |
|---|---|
| Request IDs / correlation IDs | Cannot trace a single request across routers, services, and audit rows |
| Structured logging | Logs are free text; not machine-parseable |
| Metrics / OpenTelemetry | No latency, error-rate, or saturation visibility |
| Error tracking (Sentry etc.) | Unhandled 500s are only visible in server logs |
| Health check for CI | `GET /` exists but nothing polls it |
| Database backup verification | No dump schedule, no restore test |

### Minimum viable fix

Add to `main.py` before the `FastAPI(...)` constructor:

```python
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
```

Then add a `RequestIdFilter` and echo the id in a response header.

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ValueError: JWT_SECRET_KEY must be securely configured in production.` | `ENVIRONMENT=production` with the default key | Set a real `JWT_SECRET_KEY` |
| `ValueError: Production environment must configure a production DATABASE_URL` | `ENVIRONMENT=production` with SQLite | Point at Postgres |
| 401 "Token has expired" | Access token past `ACCESS_TOKEN_EXPIRE_MINUTES` | Log in again. **The frontend does not auto-refresh**, so this is the normal session end. |
| 401 "Could not validate credentials" on a token that should be valid | A refresh token used as an access token, or a bad signature | Check `type == "access"` |
| 401 "Token reuse detected. All sessions revoked." | A revoked refresh token was replayed — usually a double-click or two tabs | Log in again; this is intentional theft detection |
| 403 "Access forbidden: requires one of roles [...]" | `require_roles` rejected the role | Check the role in the message against `ROLE_EQUIVALENTS` |
| 403 "Scores are confidential" | A `committee_member` hit a score endpoint | Expected |
| 403 from `verify_student_access` | A team-scoped user touched another team's student | Expected |
| 429 on login | The 60/min IP limit, or a proxy collapsed all clients onto one IP | See the rate-limit finding in [04-authorization.md](04-authorization.md) |
| Every student shows `UNEXCUSED_ABSENT` | The Google Meet provider is a stub, so no sessions are fetched | Use `ENVIRONMENT != production` **and** `MESSAGING_PROVIDER != openwa` to select `MockAttendanceProvider` |
| WhatsApp "Cannot reach OpenWA gateway" | The container is down, or the API host cannot route to it | `docker compose up -d openwa`; check `OPENWA_API_URL` |
| WhatsApp QR never appears | The gateway is unpaired, or `OPENWA_API_KEY` is wrong | `GET /api/whatsapp/status`; re-scan the QR |
| Agent replies only in "local deterministic mode" | Both LLM keys are unset or both providers failed | Set `GROQ_API_KEY` or `OPENROUTER_API_KEY` |
| Agent answers an operational question in prose | The keyword router missed the intent and fell through to the LLM | Rephrase using a trigger keyword, or add one to the intent table |
| `MultipleResultsFound` on a score or submission query | `score_records` has duplicate `(student, category, month)` rows because `month` is nullable | Dedupe the rows; the unique constraint does not cover NULLs |
| A new column is missing from an existing DB | `init_db()` uses `create_all`, which never alters tables | `uv run alembic upgrade head` |
| Frontend 404 on a hard refresh of `/app/x` | Vercel rewrites missing locally | Use the dev server, or add a history-fallback |
| `Multiple students found matching 'X'` | Ambiguous `IdentityMatcher` result | The agent lists the candidates; retry with a full name or student code |
| Vercel function times out on `/agent/stream` | `maxDuration: 60` caps the SSE stream | Move the API to a long-lived host |
| `docker compose up` leaves the gateway open | `OPENWA_API_KEY` unset, so `AUTH_KEY` falls back to a dev string | Always set it |

## 9. Operational runbook

### Daily

1. `GET /` — confirm `status: healthy` and `database: healthy`.
2. `GET /api/whatsapp/status` — confirm the official channel is `CONNECTED`.
3. `GET /api/whatsapp/escalations` — review flags older than 3 days.
4. `GET /api/automation/reminders` — review the `PENDING_APPROVAL` queue.

### Weekly

1. `GET /api/reports` — acknowledge committee reports.
2. Review `UNKNOWN_PENDING` reminder logs; these never self-resolve.
3. Confirm Alembic head matches `entities.py`.

### Before any production deploy

- [ ] `cd frontend && npm run build` — 0 errors
- [ ] `cd frontend && npm test -- --run` — all pass
- [ ] `cd backend && uv run pytest tests -v` — all 248 pass
- [ ] `cd backend && uv run alembic upgrade head`
- [ ] `ENVIRONMENT=production` set, with a real `JWT_SECRET_KEY` and a non-SQLite `DATABASE_URL`
- [ ] `OPENWA_API_KEY` and `OPENWA_WEBHOOK_SECRET` set to fresh random values
- [ ] `backend/.env` not tracked in git
- [ ] An external cron calls `POST /api/automation/trigger-run` (Vercel only)
- [ ] `OPENWA_API_URL` points at a publicly reachable tunnel

## 10. Gaps and open questions

| # | Item | Severity |
|---|---|---|
| 1 | No logging configuration. `automation_service` info logs are discarded. | Medium |
| 2 | No request IDs, structured logs, metrics, or error tracking. | Medium |
| 3 | The background scheduler cannot run on Vercel, so automation is dead in production. | **High (functional)** |
| 4 | No backup or restore procedure. | **[UNKNOWN]** whether Supabase managed backups are enabled. |
| 5 | No health check in CI or any uptime monitor. `GET /` exists and is unused. | Medium |
| 6 | No Alembic drift check in CI. | Medium |
| 7 | No lint step. ESLint and Ruff are not configured despite `AGENTS.md` conventions. | Low |
| 8 | `start-dev.ps1` is Windows-only. No Linux or macOS equivalent. | Low |
| 9 | The frontend does not use the implemented refresh flow, so sessions hard-expire. | **High (UX)** |
| 10 | `docker-compose.yml` defaults the gateway `AUTH_KEY` to a dev string. | **High (security)** |
| 11 | No documented rotation procedure for `JWT_SECRET_KEY`, `OPENWA_API_KEY`, or `OPENWA_WEBHOOK_SECRET`. | Medium |
| 12 | No runbook for rotating a leaked refresh token other than the automatic all-session revoke. | Low |
| 13 | `boto3`, `SUPABASE_*`, `GOOGLE_*`, and `TWILIO_*` are all declared and unused, which makes the real configuration surface unclear. | Low |
