import asyncio
import pytest
import os
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone

from app.core.security import create_access_token, get_password_hash
from app.models.entities import User, Team, Student, Meeting, Task, Submission, AgentActionAudit, RefreshSession
from app.core.database import Base, engine, AsyncSessionLocal
from app.core.config import settings


def _configured_sqlite_path() -> Path | None:
    if "sqlite" not in settings.DATABASE_URL or ":memory:" in settings.DATABASE_URL:
        return None
    raw_path = settings.DATABASE_URL.split("///", 1)[-1]
    path = Path(raw_path)
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[2] / path
    return path.resolve()


def _remove_configured_database() -> None:
    db_path = _configured_sqlite_path()
    if db_path and db_path.exists():
        try:
            db_path.unlink()
        except PermissionError:
            pass

_cached_hash = None

def get_fast_hash():
    global _cached_hash
    if _cached_hash is None:
        _cached_hash = get_password_hash("pass")
    return _cached_hash

@pytest.fixture(autouse=True, scope="module")
async def db_setup_teardown():
    # Setup
    await engine.dispose()
    _remove_configured_database()
        
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    yield
    
    # Teardown
    await engine.dispose()
    _remove_configured_database()

@pytest.fixture(scope="module")
async def setup_data():
    fast_hash = get_fast_hash()
    async with AsyncSessionLocal() as db:
        team_a = Team(id="team_a", name="Team A", code="A", description="A")
        team_b = Team(id="team_b", name="Team B", code="B", description="B")
        db.add_all([team_a, team_b])
        await db.flush()

        hr_a = User(id="hr_a", email="hra@test.com", hashed_password=fast_hash, role="committee_hr_member", team_id="team_a", full_name="HR A")
        hr_b = User(id="hr_b", email="hrb@test.com", hashed_password=fast_hash, role="committee_hr_member", team_id="team_b", full_name="HR B")
        inactive_hr = User(id="inactive_hr", email="inactive@test.com", hashed_password=fast_hash, role="committee_hr_member", team_id="team_a", full_name="Inactive HR", is_active=False)
        admin = User(id="admin", email="admin@test.com", hashed_password=fast_hash, role="hr_admin", full_name="Admin")
        leader_a = User(id="leader_a", email="leadera@test.com", hashed_password=fast_hash, role="committee_hr_leader", team_id="team_a", full_name="Leader A")
        head_a = User(id="head_a", email="heada@test.com", hashed_password=fast_hash, role="committee_head", team_id="team_a", full_name="Head A")
        head_unassigned = User(id="head_unassigned", email="headun@test.com", hashed_password=fast_hash, role="committee_head", team_id=None, full_name="Head Unassigned")
        region_head = User(id="region", email="region@test.com", hashed_password=fast_hash, role="region_hr_head", full_name="Region")
        unlinked_match = User(id="unlinked_match", email="sta@test.com", hashed_password=fast_hash, role="member", full_name="Hacker")
        db.add_all([hr_a, hr_b, inactive_hr, admin, leader_a, head_a, head_unassigned, region_head, unlinked_match])
        await db.flush()

        st_a = Student(id="st_a", email="sta@test.com", student_code="111", full_name="Student A", phone="+111", team_id="team_a", role="Member", arabic_name="A")
        st_b = Student(id="st_b", email="stb@test.com", student_code="222", full_name="Student B", phone="+222", team_id="team_b", role="Member", arabic_name="B")
        db.add_all([st_a, st_b])
        await db.flush()
        
        now = datetime.now(timezone.utc)
        mt_a = Meeting(id="mt_a", title="Mt A", meeting_code="mt_a_code", start_time=now, end_time=now + timedelta(hours=1), team_id="team_a", status="SCHEDULED")
        mt_b = Meeting(id="mt_b", title="Mt B", meeting_code="mt_b_code", start_time=now, end_time=now + timedelta(hours=1), team_id="team_b", status="SCHEDULED")
        tk_a = Task(id="tk_a", title="Tk A", task_number=1, deadline=now, created_by_user_id="admin", team_id="team_a")
        tk_b = Task(id="tk_b", title="Tk B", task_number=2, deadline=now, created_by_user_id="admin", team_id="team_b")
        db.add_all([mt_a, mt_b, tk_a, tk_b])
        await db.flush()
        
        from app.models.entities import AttendanceRecord
        att_a = AttendanceRecord(id="att_a", meeting_id="mt_a", student_id="st_a", status="PRESENT")
        db.add(att_a)
        await db.flush()

        sub_a = Submission(id="sub_a", task_id="tk_a", student_id="st_a", file_url="http", status="SUBMITTED")
        sub_b = Submission(id="sub_b", task_id="tk_b", student_id="st_b", file_url="http", status="SUBMITTED")
        db.add_all([sub_a, sub_b])
        
        from app.models.entities import MemberFeedback, MemberQuestion
        fb_a = MemberFeedback(id="fb_a", student_id="st_a", hr_member_id="hr_a", content="Test feedback A", status="SUBMITTED")
        fb_b = MemberFeedback(id="fb_b", student_id="st_b", hr_member_id="hr_b", content="Test feedback B", status="SUBMITTED")
        db.add_all([fb_a, fb_b])
        
        q_a = MemberQuestion(id="q_a", student_id="st_a", team_id="team_a", title="Q A", content="Question A", status="PENDING")
        q_b = MemberQuestion(id="q_b", student_id="st_b", team_id="team_b", title="Q B", content="Question B", status="PENDING")
        db.add_all([q_a, q_b])
        
        # Pending action for HITL testing
        action_id = "action_test"
        audit = AgentActionAudit(
            id="audit_1",
            action_id=action_id,
            intent="SEND_REMINDER",
            tool_name="send_reminder",
            parameters='{"student_ids": ["st_a"]}',
            status="PENDING_CONFIRMATION",
            confirmed=False,
            user_id="hr_a"
        )
        db.add(audit)

        await db.commit()

    return {
        "team_a": "team_a", "team_b": "team_b",
        "hr_a": "hr_a", "hr_b": "hr_b", "inactive_hr": "inactive_hr", "admin": "admin", "leader_a": "leader_a", "head_a": "head_a", "head_unassigned": "head_unassigned", "region": "region",
        "unlinked_match": "unlinked_match",
        "st_a": "st_a", "st_b": "st_b",
        "mt_a": "mt_a", "mt_b": "mt_b",
        "tk_a": "tk_a", "tk_b": "tk_b",
        "sub_a": "sub_a", "sub_b": "sub_b",
        "fb_a": "fb_a", "fb_b": "fb_b",
        "q_a": "q_a", "q_b": "q_b",
        "action_id": action_id
    }

@pytest.fixture(scope="module")
def auth_headers():
    def _headers(user_id, role, team_id=None):
        token = create_access_token({"sub": user_id, "role": role, "team_id": team_id})
        return {"Authorization": f"Bearer {token}"}
    return _headers
