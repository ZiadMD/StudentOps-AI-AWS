"""
Explicit Authorization Tests for Task Scores and Submission Visibility.
Verifies the authoritative rule:
- Task Score /10 is an internal evaluation made by the Social Media Committee Head.
- Roles that MAY see Task Scores:
    - HR Head (region_hr_head)
    - HR Leader (committee_hr_leader)
    - Social Media Committee Head (committee_head)
    - Social Media HR Member (committee_hr_member)
- Role that MUST NOT see Task Scores:
    - Social Media Committee Member (committee_member)
"""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from app.main import app
from app.core.database import Base, get_db
from app.models.entities import Submission, Task, Student
from app.seed.seed_data import seed_all


@pytest.fixture
async def auth_test_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        await seed_all(session, force=True)
        # Ensure a graded submission exists for testing
        sub_res = await session.execute(select(Submission).limit(2))
        subs = sub_res.scalars().all()
        if len(subs) >= 2:
            subs[0].score = 9.0
            subs[0].technical_score = 9.0
            subs[0].reviewer_notes = "Excellent content deliverable"
            subs[1].score = 8.0
            subs[1].technical_score = 8.0
            await session.commit()
        yield session

    await engine.dispose()


@pytest.fixture
async def client(auth_test_db):
    async def override_get_db():
        yield auth_test_db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def get_token(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_committee_member_can_get_assigned_tasks_without_scores(client):
    """1. committee_member CAN GET their assigned tasks, but max_score and score_rule are omitted."""
    member_token = await get_token(client, "member@studentops.org", "member123")
    res = await client.get("/api/tasks", headers={"Authorization": f"Bearer {member_token}"})
    assert res.status_code == 200
    tasks = res.json()
    assert len(tasks) > 0

    for t in tasks:
        # Member receives core task metadata
        assert "id" in t
        assert "title" in t
        assert "description" in t
        assert "deadline" in t
        # Authoritative Rule: Task Score information must be None for committee_member
        assert t.get("max_score") is None, f"max_score exposed to member on task {t['id']}"
        assert t.get("score_rule") is None, f"score_rule exposed to member on task {t['id']}"


@pytest.mark.asyncio
async def test_committee_member_can_get_own_submission_without_score(client, auth_test_db):
    """2. committee_member CAN GET their own submission, but technical_score and score are None."""
    member_token = await get_token(client, "member@studentops.org", "member123")
    
    # Ensure std_mohamed has a submission on tsk_1 with a score in the DB
    from datetime import datetime, timezone
    sub_res = await auth_test_db.execute(
        select(Submission).where(
            Submission.task_id == "tsk_1",
            Submission.student_id == "std_mohamed"
        )
    )
    sub = sub_res.scalar_one_or_none()
    if not sub:
        sub = Submission(
            id="sub_test_mohamed",
            task_id="tsk_1",
            student_id="std_mohamed",
            status="ON_TIME",
            score=9.5,
            technical_score=9.5,
            reviewer_notes="Confidential reviewer evaluation",
            submitted_at=datetime.now(timezone.utc),
            file_url="https://drive.google.com/test_mohamed"
        )
        auth_test_db.add(sub)
        await auth_test_db.commit()
    else:
        sub.score = 9.5
        sub.technical_score = 9.5
        sub.reviewer_notes = "Confidential reviewer evaluation"
        await auth_test_db.commit()

    res = await client.get("/api/tasks/tsk_1/submissions", headers={"Authorization": f"Bearer {member_token}"})
    assert res.status_code == 200
    subs = res.json()
    assert len(subs) >= 1

    for s in subs:
        # Must only be their own submission
        assert s["student_id"] == "std_mohamed"
        # Authoritative Rule: Score fields MUST NOT be returned in API response to committee_member
        assert s.get("score") is None, "Score exposed to committee_member in submission response"
        assert s.get("technical_score") is None, "Technical score exposed to committee_member in submission response"
        assert s.get("reviewer_notes") is None, "Reviewer notes exposed to committee_member"


@pytest.mark.asyncio
async def test_committee_member_cannot_access_another_members_submission(client, auth_test_db):
    """3. committee_member CANNOT access another member's submission (IDOR protection)."""
    member_token = await get_token(client, "member@studentops.org", "member123")

    # Find a submission belonging to another student (std_ziad)
    sub_res = await auth_test_db.execute(
        select(Submission).where(Submission.student_id == "std_ziad")
    )
    other_sub = sub_res.scalars().first()
    assert other_sub is not None

    # Attempt direct GET of another student's submission -> 403 Forbidden
    res = await client.get(
        f"/api/tasks/submissions/{other_sub.id}",
        headers={"Authorization": f"Bearer {member_token}"}
    )
    assert res.status_code == 403
    assert "Access forbidden" in res.json()["detail"]


@pytest.mark.asyncio
async def test_committee_member_cannot_access_scoreboards_or_student_scores(client):
    """4. committee_member CANNOT access scoreboard or score endpoints (403 Forbidden)."""
    member_token = await get_token(client, "member@studentops.org", "member123")

    # Scoreboard all
    res_board = await client.get("/api/students/scoreboard/all", headers={"Authorization": f"Bearer {member_token}"})
    assert res_board.status_code == 403

    # Direct student score
    res_score = await client.get("/api/students/std_mohamed/score", headers={"Authorization": f"Bearer {member_token}"})
    assert res_score.status_code == 403

    # Other student score
    res_other = await client.get("/api/students/std_ziad/score", headers={"Authorization": f"Bearer {member_token}"})
    assert res_other.status_code == 403


@pytest.mark.asyncio
async def test_committee_member_cannot_create_or_update_task_score(client, auth_test_db):
    """5. committee_member CANNOT create or update a Task Score (403 Forbidden)."""
    member_token = await get_token(client, "member@studentops.org", "member123")

    sub_res = await auth_test_db.execute(select(Submission).limit(1))
    sub = sub_res.scalar_one()

    res = await client.put(
        f"/api/tasks/submissions/{sub.id}/review",
        json={"score": 10.0, "reviewer_notes": "Attempted self-grade"},
        headers={"Authorization": f"Bearer {member_token}"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_committee_head_can_see_and_assign_task_scores(client, auth_test_db):
    """6. Social Media Committee Head CAN see Task Scores and assign/update Task Score /10."""
    head_token = await get_token(client, "media.head@studentops.org", "lead123")

    # Head sees submissions with scores
    res_subs = await client.get("/api/tasks/tsk_1/submissions", headers={"Authorization": f"Bearer {head_token}"})
    assert res_subs.status_code == 200
    subs = res_subs.json()
    assert len(subs) > 0

    target_sub = subs[0]
    # Head assigns/updates Task Score /10
    review_res = await client.put(
        f"/api/tasks/submissions/{target_sub['id']}/review",
        json={"score": 8.5, "reviewer_notes": "Strong aesthetic and copy"},
        headers={"Authorization": f"Bearer {head_token}"}
    )
    assert review_res.status_code == 200
    updated = review_res.json()
    assert updated["technical_score"] == 8.5
    assert updated["score"] == 8.5
    assert updated["reviewer_notes"] == "Strong aesthetic and copy"


@pytest.mark.asyncio
async def test_hr_roles_can_see_task_scores(client):
    """7. HR Head, HR Leader, and HR Member CAN see Task Scores through scoreboards and oversight."""
    # 1. HR Member
    hr_member_token = await get_token(client, "hr.member@studentops.org", "hrmember123")
    res_hr_mem = await client.get("/api/students/scoreboard/all", headers={"Authorization": f"Bearer {hr_member_token}"})
    assert res_hr_mem.status_code == 200
    data_mem = res_hr_mem.json()
    assert len(data_mem) > 0
    assert "average_task_quality" in data_mem[0]

    # 2. HR Leader
    leader_token = await get_token(client, "hr.leader@studentops.org", "leader123")
    res_ldr = await client.get("/api/students/scoreboard/all", headers={"Authorization": f"Bearer {leader_token}"})
    assert res_ldr.status_code == 200
    data_ldr = res_ldr.json()
    assert "average_task_quality" in data_ldr[0]

    # 3. HR Region Head
    region_token = await get_token(client, "region.head@studentops.org", "head123")
    res_reg = await client.get("/api/students/scoreboard/all", headers={"Authorization": f"Bearer {region_token}"})
    assert res_reg.status_code == 200
    data_reg = res_reg.json()
    assert "average_task_quality" in data_reg[0]
