# StudentOps AI — Agentic AI HR & Student Operations Platform

StudentOps AI is an enterprise-grade, agentic AI platform designed for student communities, university branches, clubs, and youth organizations.

It replaces fragmented spreadsheets, manual attendance tracking, and repetitive messaging by introducing an **Autonomous ReAct AI Agent** that operates strictly through controlled tools, enforces deterministic HR policies based on community evaluation standards, and requires human confirmation before sensitive actions.

---

## 🌟 Core Features & Architecture

```
User (HR / Leadership)
      ↓
React 19 + TypeScript + Tailwind UI
      ↓
FastAPI Backend (Python 3.12+ / uv)
      ↓
Autonomous ReAct AI Agent (Amazon Bedrock / Fallback)
      ↓
Controlled Tool Registry (Read-Only / Write / Sensitive)
      ↓
Deterministic Domain Services & Policy Engines
      ├── Attendance Policy Engine (Session aggregation & on-time/late/absent classification)
      ├── Identity Matcher (Exact email & Arabic/Latin name normalization)
      ├── Scoring Engine (Task average /10 + Behavior & discipline /23)
      ├── Google Meet & Calendar Providers (Real-time sync + Mock fallback)
      ├── Messaging Provider Abstraction (WhatsApp / SMS / Mock)
      └── Immutable Audit Logger
      ↓
Database Layer (Async SQLite / DynamoDB & PostgreSQL ready)
```

### 1. Zero Direct Database / API Access for the LLM
The LLM never directly executes SQL queries or calls external APIs. All interactions flow through typed tools with explicit JSON schemas, parameter validation, and safety categorization.

### 2. Deterministic Policies & Ground Truth from reference
- **Attendance**:
  - `PRESENT` (حضور في المعاد): Joined within threshold ($\le 10$ mins) and attended $\ge 70\%$ duration.
  - `LATE` (حضور متأخر): Joined $> 10$ mins and attended $\ge 50\%$ duration.
  - `EXCUSED` (بعذر): Valid accepted/moderate/rejected excuse submitted to HR.
  - `ABSENT` (غاب بدون عذر): No valid session or excuse.
- **Scoring System**:
  - Task Quality: Average out of 10 points.
  - Behavior & Discipline: Group Interaction (/5) + Social Media (/5) + Hierarchy & Regulations (/5) + Polite Conduct (/8) = **Total /23**.

### 3. Human-in-the-Loop Confirmation Barrier
External and sensitive actions (e.g. mass messaging via `send_reminder`) are intercepted by the agent. The agent drafts the preview, presents the recipient list and message to the HR user, and waits for explicit approval before dispatching.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Python**: 3.11+ (managed via `uv`)
- **Node.js**: 18+ and `npm`

### 1. Backend Setup & Run
```bash
cd backend
uv sync
uv run python -m app.seed.seed_data  # Seeds database with 8.xlsx ground truth
uv run uvicorn app.main:app --reload --port 8000
```
Backend API will be available at `http://127.0.0.1:8000` (API Docs at `http://127.0.0.1:8000/docs`).

### 2. Frontend Setup & Run
```bash
cd frontend
npm install
npm run dev
```
Frontend UI will be live at `http://localhost:5173`.

---

## 🧪 Testing & Evaluation Suite

Run the full automated test suite with `pytest`:
```bash
cd backend
uv run pytest tests -v
```

### Test Coverage Breakdown:
- `tests/unit/test_attendance_policy.py`: On-time, late, excused, and unexcused duration calculation.
- `tests/unit/test_identity_matcher.py`: Multi-tier matching (Exact email, Arabic transliteration, Latin names).
- `tests/unit/test_scoring.py`: Mathematical verification of refrence metrics.
- `tests/integration/test_agent_tools.py`: Tool execution and sensitive confirmation interception.
- `tests/evals/test_demo_workflow.py`: End-to-end multi-turn evaluation of the Primary Demo Scenario.

---

## 🎬 Primary Demo Walkthrough

### Scenario 1: Identify Absent Members
- **HR Query**: *"Who was absent from today's meeting?"*
- **Agent Action**: Calls `get_meeting_attendance(meeting_id="today_sync")`.
- **Response**: Identifies absent student (*Hanan Ahmed Ramadan* / حنان احمد رمضان) with duration breakdown and contact details.

### Scenario 2: Remind Absent Members with Human Confirmation
- **HR Query**: *"Remind them about the next meeting."*
- **Agent Action**: Calls `get_upcoming_meetings()`, calls `prepare_reminder()`, detects sensitive action, and renders an interactive **Confirmation Card** with WhatsApp draft and recipient list.
- **Action**: HR clicks **[Confirm & Dispatch WhatsApp]** $\to$ Message sent through provider and logged in the immutable Audit Trail.

### Scenario 3: Official 8.xlsx Scorecard
- **HR Query**: *"Show me Maurine's score."*
- **Agent Action**: Calls `get_student_score(student_id_or_name="std_maurine")`.
- **Response**: Displays attendance counts, on-time task submissions, task quality average (/10), and behavior breakdown (Total 23/23 pts, "Outstanding").
