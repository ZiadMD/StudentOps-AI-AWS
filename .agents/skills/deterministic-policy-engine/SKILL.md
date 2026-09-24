---
name: deterministic-policy-engine
description: "Master procedures for building, maintaining, and verifying deterministic HR policies in StudentOps AI (Attendance 70%/50% rules, Scoreboard evaluation /23, and multi-tier identity matching)."
risk: safe
source: "studentops/policy-engine"
date_added: "2026-08-27"
---

# Deterministic Policy Engine Skill

This skill provides step-by-step procedures and rules for implementing and maintaining deterministic operations in StudentOps AI.

## Philosophy: Zero Hallucination Operations
The autonomous ReAct agent must never calculate attendance status, member scores, or identity matches through raw LLM reasoning. All calculations must be computed deterministically in `backend/app/services/`.

## Policy Specifications

### 1. Attendance Policy Rules (`app/services/attendance_service.py`)
- `PRESENT`:
  - Join delay <= 10 minutes from meeting `start_time`.
  - Attended duration >= 70% of total meeting duration.
- `LATE`:
  - Join delay > 10 minutes from `start_time` OR attended duration between 50% and 69.9%.
- `EXCUSED`:
  - Explicit excuse filed with status `ACCEPTED` or `MODERATE_ACCEPTED`. Overrides unexcused absence.
- `ABSENT`:
  - Member did not join OR attended duration < 50% without an accepted excuse.

### 2. Member Evaluation Scoring Standard (`app/services/scoring_service.py`)
- Task Quality: Average score across task submissions (scale: 0.0 to 10.0 pts).
- Behavior and Discipline (Total /23.0 pts):
  - Group Interaction: max 5.0 pts
  - Social Media Engagement: max 5.0 pts
  - Hierarchy & Rules Compliance: max 5.0 pts
  - Polite Conduct & Professionalism: max 8.0 pts
- Rating Tier Classification:
  - Outstanding: Behavior >= 20.0 AND Task Average >= 8.5
  - Good: Behavior >= 15.0 AND Task Average >= 6.0
  - Needs Review: Behavior < 15.0 OR Task Average < 6.0

### 3. Multi-Tier Identity Matching (`app/services/identity_matcher.py`)
- Tier 1: Exact normalized email match (`student.email.lower()`).
- Tier 2: Normalized Arabic name match (stripping tashkeel, normalizing alef/yaa/taa-marboota).
- Tier 3: Transliterated Latin name fuzzy match.
- Fallback: Unmatched record flagged for manual HR review.

## Verification Checklist
- Run `cd backend && uv run pytest tests/unit/test_attendance_policy.py tests/unit/test_scoring.py tests/unit/test_identity_matcher.py -v`.
