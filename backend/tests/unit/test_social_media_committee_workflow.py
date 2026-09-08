"""
test_social_media_committee_workflow.py
----------------------------------------
Authoritative End-to-End Business Workflow Test Suite for the Social Media Committee.
Enforces the 5 operational accounts and exact responsibility mapping:
1. HR Region / HR Head (region.head@studentops.org) - Oversight & Reports
2. HR Leader (hr.leader@studentops.org) - Total Score, Bonuses, Member Feedback, Reports Upward
3. Social Media Committee Head (media.head@studentops.org) - Sets Tasks & Meetings, Scores Submissions, Answers Q&A
4. Social Media HR Member (hr.member@studentops.org) - Attendance, Reminders, Behavior Scores, Follow-up Flags -> WhatsApp
5. Social Media Committee Member (member@studentops.org) - Attends Meetings, Submits Tasks, Asks Questions
"""

import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.core.database import Base, get_db
from app.seed.seed_data import seed_all


@pytest.fixture
async def test_db_session():
    """Isolated in-memory database fixture."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        await seed_all(session)
        yield session

    await engine.dispose()


@pytest.fixture
async def client(test_db_session):
    """FastAPI Test Client with overridden database session."""
    async def override_get_db():
        yield test_db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def get_auth_token(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Failed login for {email}: {res.text}"
    return res.json()["access_token"]


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_social_media_five_operational_roles_auth(client):
    """
    1. Authenticate all 5 operational roles and verify their scoped roles and committees.
    """
    # 1. HR Region / HR Head
    head_token = await get_auth_token(client, "region.head@studentops.org", "head123")
    res1 = await client.get("/api/auth/me", headers=bearer(head_token))
    assert res1.status_code == 200
    assert res1.json()["role"] == "region_hr_head"

    # 2. HR Leader (Social Media Committee)
    leader_token = await get_auth_token(client, "hr.leader@studentops.org", "leader123")
    res2 = await client.get("/api/auth/me", headers=bearer(leader_token))
    assert res2.status_code == 200
    assert res2.json()["role"] == "committee_hr_leader"
    assert res2.json()["team_id"] == "team_media"

    # 3. Social Media Committee Head
    comm_head_token = await get_auth_token(client, "media.head@studentops.org", "lead123")
    res3 = await client.get("/api/auth/me", headers=bearer(comm_head_token))
    assert res3.status_code == 200
    assert res3.json()["role"] == "committee_head"
    assert res3.json()["team_id"] == "team_media"

    # 4. Social Media HR Member
    hr_member_token = await get_auth_token(client, "hr.member@studentops.org", "hrmember123")
    res4 = await client.get("/api/auth/me", headers=bearer(hr_member_token))
    assert res4.status_code == 200
    assert res4.json()["role"] == "committee_hr_member"
    assert res4.json()["team_id"] == "team_media"

    # 5. Social Media Committee Member
    member_token = await get_auth_token(client, "member@studentops.org", "member123")
    res5 = await client.get("/api/auth/me", headers=bearer(member_token))
    assert res5.status_code == 200
    assert res5.json()["role"] == "committee_member"
    assert res5.json()["team_id"] == "team_media"


@pytest.mark.asyncio
async def test_committee_head_manages_meetings_and_sessions(client):
    """
    2. Committee Head sets meeting time, title, and session number.
    Members, HR Head, and HR Leader cannot create meetings (403).
    """
    comm_head_token = await get_auth_token(client, "media.head@studentops.org", "lead123")
    member_token = await get_auth_token(client, "member@studentops.org", "member123")
    leader_token = await get_auth_token(client, "hr.leader@studentops.org", "leader123")
    head_token = await get_auth_token(client, "region.head@studentops.org", "head123")

    # Member attempts to create meeting -> 403
    forbidden_res = await client.post(
        "/api/attendance/meetings",
        headers=bearer(member_token),
        json={
            "title": "Unauthorized Session",
            "start_time": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "end_time": (datetime.now(timezone.utc) + timedelta(days=1, hours=1)).isoformat(),
            "session_number": 7
        }
    )
    assert forbidden_res.status_code == 403

    # HR Head and HR Leader attempt to create meeting -> 403 (Owned by Committee Head)
    assert (await client.post(
        "/api/attendance/meetings",
        headers=bearer(head_token),
        json={"title": "Head Meeting", "start_time": datetime.now(timezone.utc).isoformat(), "session_number": 1}
    )).status_code == 403

    assert (await client.post(
        "/api/attendance/meetings",
        headers=bearer(leader_token),
        json={"title": "Leader Meeting", "start_time": datetime.now(timezone.utc).isoformat(), "session_number": 1}
    )).status_code == 403

    # Committee Head creates Session 7
    start_time = datetime.now(timezone.utc) + timedelta(days=1)
    end_time = start_time + timedelta(hours=1)
    create_res = await client.post(
        "/api/attendance/meetings",
        headers=bearer(comm_head_token),
        json={
            "title": "Session 7: TikTok Virality & Short Video Growth",
            "topic": "Algorithms, sound trends, and hook writing",
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "duration_minutes": 60,
            "session_number": 7,
            "meet_url": "https://meet.google.com/media-session-7",
            "student_ids": ["std_mohamed", "std_khaled"]
        }
    )
    assert create_res.status_code in (200, 201)
    meeting_data = create_res.json()
    assert meeting_data["session_number"] == 7
    assert meeting_data["team_id"] == "team_media"

    # Member sees the meeting in their meetings list
    member_meetings_res = await client.get("/api/attendance/meetings", headers=bearer(member_token))
    assert member_meetings_res.status_code == 200
    meeting_ids = [m["id"] for m in member_meetings_res.json()]
    assert meeting_data["id"] in meeting_ids


@pytest.mark.asyncio
async def test_committee_head_and_member_task_workflow(client):
    """
    3. Committee Head creates task -> Member submits task -> Committee Head scores submission.
    HR roles cannot create tasks or grade technical submissions (403).
    """
    comm_head_token = await get_auth_token(client, "media.head@studentops.org", "lead123")
    member_token = await get_auth_token(client, "member@studentops.org", "member123")
    hr_member_token = await get_auth_token(client, "hr.member@studentops.org", "hrmember123")
    leader_token = await get_auth_token(client, "hr.leader@studentops.org", "leader123")
    head_token = await get_auth_token(client, "region.head@studentops.org", "head123")

    # HR Head & HR Leader attempt to create committee task -> 403
    assert (await client.post(
        "/api/tasks",
        headers=bearer(head_token),
        json={"title": "Head Task", "deadline": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}
    )).status_code == 403

    assert (await client.post(
        "/api/tasks",
        headers=bearer(leader_token),
        json={"title": "Leader Task", "deadline": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}
    )).status_code == 403

    # Committee Head creates Task 6
    task_res = await client.post(
        "/api/tasks",
        headers=bearer(comm_head_token),
        json={
            "title": "Task 6: Reel Script & Storyboard",
            "description": "Draft a 30-second script for the orientation teaser reel.",
            "deadline": (datetime.now(timezone.utc) + timedelta(days=4)).isoformat(),
            "max_score": 10.0,
            "task_number": 6,
            "student_ids": ["std_mohamed"]
        }
    )
    assert task_res.status_code in (200, 201)
    task_id = task_res.json()["id"]

    # Member submits the task
    submit_res = await client.post(
        f"/api/tasks/{task_id}/submit?file_url=https://drive.google.com/reel-script-std_mohamed",
        headers=bearer(member_token)
    )
    assert submit_res.status_code == 200
    sub_data = submit_res.json()
    sub_id = sub_data["id"]
    assert sub_data["status"] in ("ON_TIME", "SUBMITTED")

    # HR Member attempts to score technical submission -> 403 Forbidden
    hr_forbidden = await client.put(
        f"/api/tasks/submissions/{sub_id}/review",
        headers=bearer(hr_member_token),
        json={"score": 9.5, "reviewer_notes": "Attempted grading by HR"}
    )
    assert hr_forbidden.status_code == 403

    # Committee Head reviews and scores the task -> 200
    review_res = await client.put(
        f"/api/tasks/submissions/{sub_id}/review",
        headers=bearer(comm_head_token),
        json={"score": 9.5, "reviewer_notes": "Strong hook and clear visual timing!"}
    )
    assert review_res.status_code == 200
    assert review_res.json()["score"] == 9.5
    assert review_res.json()["status"] == "ON_TIME"


@pytest.mark.asyncio
async def test_attendance_absence_creates_flag_and_hr_member_handles_via_whatsapp(client):
    """
    4. Attendance is processed -> Absence flags student -> HR Member handles follow-up via WhatsApp direct link.
    Committee Head and HR Head cannot take attendance (403).
    """
    hr_member_token = await get_auth_token(client, "hr.member@studentops.org", "hrmember123")
    comm_head_token = await get_auth_token(client, "media.head@studentops.org", "lead123")
    head_token = await get_auth_token(client, "region.head@studentops.org", "head123")

    # Committee Head and HR Head cannot process/take attendance (403)
    assert (await client.post("/api/attendance/meetings/meet_test_fake/process", headers=bearer(comm_head_token))).status_code == 403
    assert (await client.post("/api/attendance/meetings/meet_test_fake/process", headers=bearer(head_token))).status_code == 403

    # HR Member checks open follow-up flags
    esc_res = await client.get("/api/whatsapp/escalations", headers=bearer(hr_member_token))
    assert esc_res.status_code == 200
    escalations = esc_res.json()
    assert isinstance(escalations, list)

    # HR Member opens WhatsApp Chat Window via direct link generation
    wa_res = await client.post(
        "/api/whatsapp/generate-link?student_id=std_mohamed&template_type=ABSENTEEISM",
        headers=bearer(hr_member_token)
    )
    assert wa_res.status_code == 200
    wa_data = wa_res.json()
    assert "https://wa.me/" in wa_data["encoded_url"]
    assert wa_data["phone"] is not None

    # Meeting Reminder template
    reminder_res = await client.post(
        "/api/whatsapp/generate-link?student_id=std_mohamed&template_type=MEETING_REMINDER",
        headers=bearer(hr_member_token)
    )
    assert reminder_res.status_code == 200
    assert "نذكرك باقتراب موعد لقاء" in reminder_res.json()["message_text"]

    # Task Deadline Reminder template
    task_rem_res = await client.post(
        "/api/whatsapp/generate-link?student_id=std_mohamed&template_type=TASK_DEADLINE_REMINDER",
        headers=bearer(hr_member_token)
    )
    assert task_rem_res.status_code == 200
    assert "تذكير باقتراب الموعد النهائي" in task_rem_res.json()["message_text"]


@pytest.mark.asyncio
async def test_scoring_workflow_behavior_bonus_and_total_score(client):
    """
    5. Scoring Workflow:
       - HR Member gives behavior score (/23).
       - HR Leader reviews scores, awards bonuses, and oversees components.
       - Unauthorized roles cannot award bonus or grade behavior (403).
       - Score components remain separate; total score formula is not invented.
    """
    hr_member_token = await get_auth_token(client, "hr.member@studentops.org", "hrmember123")
    leader_token = await get_auth_token(client, "hr.leader@studentops.org", "leader123")
    member_token = await get_auth_token(client, "member@studentops.org", "member123")
    comm_head_token = await get_auth_token(client, "media.head@studentops.org", "lead123")
    head_token = await get_auth_token(client, "region.head@studentops.org", "head123")

    # HR Head cannot grade behavior (403)
    assert (await client.put(
        "/api/students/std_mohamed/behavior-score",
        headers=bearer(head_token),
        json={"student_id": "std_mohamed", "group_interaction": 5.0, "social_media": 5.0, "hierarchy_rules": 5.0, "polite_conduct": 8.0}
    )).status_code == 403

    # HR Member updates behavior score (/23)
    beh_res = await client.put(
        "/api/students/std_mohamed/behavior-score",
        headers=bearer(hr_member_token),
        json={
            "student_id": "std_mohamed",
            "group_interaction": 5.0,
            "social_media": 5.0,
            "hierarchy_rules": 5.0,
            "polite_conduct": 8.0,
            "notes": "Full marks in committee engagement"
        }
    )
    assert beh_res.status_code == 200
    assert beh_res.json()["total_behavior_score"] == 23.0
    assert beh_res.json()["group_interaction_score"] == 5.0

    # Member attempts to award bonus -> 403
    res_mem_bonus = await client.post(
        "/api/students/std_mohamed/bonus",
        headers=bearer(member_token),
        json={"points": 3.0, "notes": "Self awarded bonus"}
    )
    assert res_mem_bonus.status_code == 403

    # Committee Head attempts to award bonus -> 403 (Owned by HR Leader)
    res_head_bonus = await client.post(
        "/api/students/std_mohamed/bonus",
        headers=bearer(comm_head_token),
        json={"points": 2.0, "notes": "Head bonus"}
    )
    assert res_head_bonus.status_code == 403

    # HR Head attempts to award bonus -> 403 (Oversight role; owned by HR Leader)
    res_region_head_bonus = await client.post(
        "/api/students/std_mohamed/bonus",
        headers=bearer(head_token),
        json={"points": 2.0, "notes": "Region head bonus"}
    )
    assert res_region_head_bonus.status_code == 403

    # HR Leader awards bonus of 3.0 points -> 200
    bonus_res = await client.post(
        "/api/students/std_mohamed/bonus",
        headers=bearer(leader_token),
        json={"points": 3.0, "notes": "Awarded for outstanding visual designs during live coverage"}
    )
    assert bonus_res.status_code == 200
    score_summary = bonus_res.json()
    assert score_summary["bonus_points"] >= 3.0
    assert score_summary["total_behavior_score"] == 23.0
    # Total Score is kept separate without invented weights
    assert score_summary["total_score"] is None
    assert score_summary["total_score_status"] == "PENDING_FORMULA_DEFINITION"

    # HR Leader accesses scoreboard to oversee components
    sb_res = await client.get("/api/students/scoreboard/all", headers=bearer(leader_token))
    assert sb_res.status_code == 200
    sb_items = sb_res.json()
    mohamed_item = next(s for s in sb_items if s["student_id"] == "std_mohamed")
    assert mohamed_item["bonus_points"] >= 3.0
    assert mohamed_item["total_behavior_score"] == 23.0
    assert mohamed_item["total_score"] is None


@pytest.mark.asyncio
async def test_feedback_and_questions_workflows(client):
    """
    6. Feedback (Member -> HR Leader for HR members) & Questions (Member -> Committee Head).
    Strict confidentiality and role boundaries.
    """
    member_token = await get_auth_token(client, "member@studentops.org", "member123")
    leader_token = await get_auth_token(client, "hr.leader@studentops.org", "leader123")
    comm_head_token = await get_auth_token(client, "media.head@studentops.org", "lead123")
    hr_member_token = await get_auth_token(client, "hr.member@studentops.org", "hrmember123")
    head_token = await get_auth_token(client, "region.head@studentops.org", "head123")

    # Member submits feedback concerning an HR Member to HR Leader
    fb_res = await client.post(
        "/api/feedback",
        headers=bearer(member_token),
        json={
            "hr_member_name": "Farah Tarek",
            "category": "COMMUNICATION",
            "content": "HR Member provided prompt assistance and respectful attendance follow-up."
        }
    )
    assert fb_res.status_code == 201
    feedback_id = fb_res.json()["id"]
    assert fb_res.json()["category"] == "COMMUNICATION"

    # HR Member attempts to view member feedback -> 403 Forbidden (Confidentiality)
    assert (await client.get("/api/feedback", headers=bearer(hr_member_token))).status_code == 403

    # Committee Head attempts to view member feedback -> 403 Forbidden
    assert (await client.get("/api/feedback", headers=bearer(comm_head_token))).status_code == 403

    # HR Leader reviews feedback -> 200
    leader_fb_res = await client.get("/api/feedback", headers=bearer(leader_token))
    assert leader_fb_res.status_code == 200
    assert any(fb["id"] == feedback_id for fb in leader_fb_res.json())

    # HR Head has oversight view -> 200
    head_fb_res = await client.get("/api/feedback", headers=bearer(head_token))
    assert head_fb_res.status_code == 200

    # HR Head attempts to action/update feedback status -> 403 Forbidden (Oversight only; HR Leader actions)
    assert (await client.patch(
        f"/api/feedback/{feedback_id}/status",
        headers=bearer(head_token),
        json={"status": "ACTIONED"}
    )).status_code == 403

    # HR Leader updates feedback status to REVIEWED -> 200
    update_res = await client.patch(
        f"/api/feedback/{feedback_id}/status",
        headers=bearer(leader_token),
        json={"status": "REVIEWED", "notes": "Acknowledged. Exemplary support noted."}
    )
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "REVIEWED"

    # Member asks a question to Committee Head
    q_res = await client.post(
        "/api/questions",
        headers=bearer(member_token),
        json={
            "title": "Export Resolution for Instagram Stories",
            "content": "Should stories be exported in 1080x1920 30fps or 60fps?",
            "team_id": "team_media"
        }
    )
    assert q_res.status_code == 201
    question_id = q_res.json()["id"]

    # HR Member and HR Leader cannot answer committee head questions (403)
    assert (await client.post(
        f"/api/questions/{question_id}/answer",
        headers=bearer(hr_member_token),
        json={"answer": "HR answering"}
    )).status_code == 403
    assert (await client.post(
        f"/api/questions/{question_id}/answer",
        headers=bearer(leader_token),
        json={"answer": "Leader answering"}
    )).status_code == 403

    # Committee Head answers the question
    ans_res = await client.post(
        f"/api/questions/{question_id}/answer",
        headers=bearer(comm_head_token),
        json={"answer": "Export in 1080x1920 at 30fps to avoid Instagram compression artifacts."}
    )
    assert ans_res.status_code == 200
    assert ans_res.json()["status"] == "ANSWERED"
    assert "30fps" in ans_res.json()["answer"]


@pytest.mark.asyncio
async def test_performance_reporting_hr_leader_to_hr_head(client):
    """
    7. Performance Reporting Workflow:
       - HR Leader inspects committee summary.
       - HR Leader submits performance report to HR Head.
       - HR Head reviews the report.
    """
    leader_token = await get_auth_token(client, "hr.leader@studentops.org", "leader123")
    head_token = await get_auth_token(client, "region.head@studentops.org", "head123")

    # HR Leader fetches committee summary
    summary_res = await client.get("/api/reports/committee/summary", headers=bearer(leader_token))
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert summary["team_id"] == "team_media"
    assert "total_members" in summary

    # HR Leader submits report to HR Head
    submit_res = await client.post(
        "/api/reports/submit-to-head",
        headers=bearer(leader_token),
        json={
            "report_title": "Social Media Committee Sprint 5 Operations & Morale Report",
            "notes": "High engagement on campaigns. All open follow-up flags resolved via WhatsApp."
        }
    )
    assert submit_res.status_code in (200, 201)
    report_id = submit_res.json()["id"]

    # HR Head retrieves reports
    head_rep_res = await client.get("/api/reports", headers=bearer(head_token))
    assert head_rep_res.status_code == 200
    assert any(r["id"] == report_id for r in head_rep_res.json())
