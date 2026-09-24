"""
Regression Test Suite for ISSUE-05: HR Member Task Score Collection & Boundary Enforcement.
Tests:
- TEST 1: Social Media HR Member requests task scores from their committee (200 OK, scores returned).
- TEST 2: Social Media HR Member requests technical submission content via /submissions (403 Forbidden).
- TEST 3: HR Member from Committee A requests task scores from Committee B (403 Forbidden).
- TEST 4: HR Member attempts to access another committee's submission using a guessed submission_id (403 Forbidden).
- TEST 5: HR Member attempts to modify or grade a task score (403 Forbidden).
- TEST 6: Committee Head can still view full submission with file_url and grade it (200 OK).
- TEST 7: Committee Member cannot access the score collection endpoint (403 Forbidden).
- TEST 8: Sensitive submission URL/file/path is never serialized in the HR score collection response.
"""
import pytest
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from app.main import app
from app.core.database import Base, get_db
from app.core.rate_limiter import limiter
from app.core.security import create_access_token
from app.models.entities import Task, Submission, Student, User
from app.seed.seed_data import seed_all


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
async def score_test_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        await seed_all(session, force=True)

        # Set up a Media task with a graded submission for testing
        task_media = Task(
            id="tsk_media_test",
            task_number=901,
            title="Social Media Content Campaign",
            description="Create Instagram carousels and reels",
            deadline=datetime.now(timezone.utc),
            team_id="team_media"
        )
        sub_media = Submission(
            id="sub_media_test_01",
            task_id="tsk_media_test",
            student_id="std_mohamed",  # in team_media
            status="ON_TIME",
            score=9.5,
            technical_score=9.5,
            reviewer_notes="Exceptional copy and visual aesthetic",
            submitted_at=datetime.now(timezone.utc),
            reviewed_at=datetime.now(timezone.utc),
            file_url="https://drive.google.com/confidential-creative-draft.psd"
        )

        # Set up a Tech task belonging to team_tech
        task_tech = Task(
            id="tsk_tech_test",
            task_number=902,
            title="Backend Database Optimization",
            description="Optimize SQL queries and connection pool",
            deadline=datetime.now(timezone.utc),
            team_id="team_tech"
        )
        sub_tech = Submission(
            id="sub_tech_test_01",
            task_id="tsk_tech_test",
            student_id="std_ziad",  # in team_tech
            status="ON_TIME",
            score=8.5,
            technical_score=8.5,
            reviewer_notes="Clean index implementation",
            submitted_at=datetime.now(timezone.utc),
            reviewed_at=datetime.now(timezone.utc),
            file_url="https://github.com/internal/proprietary-core-engine.tar.gz"
        )

        session.add_all([task_media, sub_media, task_tech, sub_tech])
        await session.commit()
        yield session

    await engine.dispose()


@pytest.fixture
async def score_client(score_test_db):
    async def override_get_db():
        yield score_test_db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def get_token(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    return res.json()["access_token"]


# ==============================================================================
# TEST 1: HR Member requests task scores from their authorized committee
# ==============================================================================
@pytest.mark.asyncio
async def test_hr_member_can_collect_task_scores(score_client):
    """
    Social Media HR Member can view numerical scores, grading status, and metadata
    for tasks in their committee via GET /api/tasks/{task_id}/scores.
    """
    hr_token = await get_token(score_client, "hr.member@studentops.org", "hrmember123")
    res = await score_client.get(
        "/api/tasks/tsk_media_test/scores",
        headers={"Authorization": f"Bearer {hr_token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    item = data[0]
    assert item["task_id"] == "tsk_media_test"
    assert item["score"] == 9.5
    assert item["technical_score"] == 9.5
    assert item["status"] == "ON_TIME"
    assert item["student_id"] == "std_mohamed"
    assert item["reviewer_notes"] == "Exceptional copy and visual aesthetic"


# ==============================================================================
# TEST 2: HR Member requests technical submission files via /submissions
# ==============================================================================
@pytest.mark.asyncio
async def test_hr_member_forbidden_from_technical_submission_files(score_client):
    """
    Social Media HR Member requesting technical submissions via /submissions receives 403.
    Confidential technical deliverables remain protected.
    """
    hr_token = await get_token(score_client, "hr.member@studentops.org", "hrmember123")

    # List submissions endpoint
    res_list = await score_client.get(
        "/api/tasks/tsk_media_test/submissions",
        headers={"Authorization": f"Bearer {hr_token}"}
    )
    assert res_list.status_code == 403
    assert "HR roles do not have permission" in res_list.json()["detail"]

    # Single submission endpoint
    res_single = await score_client.get(
        "/api/tasks/submissions/sub_media_test_01",
        headers={"Authorization": f"Bearer {hr_token}"}
    )
    assert res_single.status_code == 403
    assert "HR roles do not have permission" in res_single.json()["detail"]


# ==============================================================================
# TEST 3: HR Member from Committee A requests task from Committee B
# ==============================================================================
@pytest.mark.asyncio
async def test_hr_member_cross_committee_task_access_forbidden(score_client):
    """
    Social Media HR Member (team_media) attempting to access a Technical Committee task (team_tech)
    is rejected with 403 Forbidden.
    """
    hr_token = await get_token(score_client, "hr.member@studentops.org", "hrmember123")
    res = await score_client.get(
        "/api/tasks/tsk_tech_test/scores",
        headers={"Authorization": f"Bearer {hr_token}"}
    )
    assert res.status_code == 403
    assert "different committee" in res.json()["detail"]


# ==============================================================================
# TEST 4: HR Member attempts to access another committee's submission using guessed ID
# ==============================================================================
@pytest.mark.asyncio
async def test_hr_member_cross_committee_guessed_submission_id_forbidden(score_client):
    """
    Social Media HR Member attempting to access sub_tech_test_01 via /submissions/{id}/score
    is rejected with 403 Forbidden (IDOR protection).
    """
    hr_token = await get_token(score_client, "hr.member@studentops.org", "hrmember123")
    res = await score_client.get(
        "/api/tasks/submissions/sub_tech_test_01/score",
        headers={"Authorization": f"Bearer {hr_token}"}
    )
    assert res.status_code == 403
    assert "different committee" in res.json()["detail"]


# ==============================================================================
# TEST 5: HR Member attempts to modify a task score
# ==============================================================================
@pytest.mark.asyncio
async def test_hr_member_cannot_modify_or_grade_task_score(score_client):
    """
    Social Media HR Member attempting to grade or alter a task score is rejected with 403.
    Scoring is the exclusive responsibility of the Committee Head.
    """
    hr_token = await get_token(score_client, "hr.member@studentops.org", "hrmember123")
    res = await score_client.put(
        "/api/tasks/submissions/sub_media_test_01/review",
        json={"score": 10.0, "reviewer_notes": "HR unauthorized grade override"},
        headers={"Authorization": f"Bearer {hr_token}"}
    )
    assert res.status_code == 403


# ==============================================================================
# TEST 6: Committee Head can view full submission and grade it
# ==============================================================================
@pytest.mark.asyncio
async def test_committee_head_can_view_full_submission_and_grade(score_client):
    """
    Committee Head can access the full technical submission including file_url,
    and can review and assign grades.
    """
    head_token = await get_token(score_client, "media.head@studentops.org", "lead123")

    # 1. Head views submission with file_url
    res_sub = await score_client.get(
        "/api/tasks/submissions/sub_media_test_01",
        headers={"Authorization": f"Bearer {head_token}"}
    )
    assert res_sub.status_code == 200
    data = res_sub.json()
    assert "file_url" in data
    assert "confidential-creative-draft.psd" in data["file_url"]

    # 2. Head reviews/updates the score
    res_review = await score_client.put(
        "/api/tasks/submissions/sub_media_test_01/review",
        json={"score": 10.0, "reviewer_notes": "Perfect execution and final delivery"},
        headers={"Authorization": f"Bearer {head_token}"}
    )
    assert res_review.status_code == 200
    assert res_review.json()["score"] == 10.0


# ==============================================================================
# TEST 7: Committee Member cannot access the score collection endpoint
# ==============================================================================
@pytest.mark.asyncio
async def test_committee_member_forbidden_from_score_collection_endpoint(score_client):
    """
    Committee Members are forbidden from calling /scores to inspect internal evaluations.
    """
    member_token = await get_token(score_client, "member@studentops.org", "member123")
    res = await score_client.get(
        "/api/tasks/tsk_media_test/scores",
        headers={"Authorization": f"Bearer {member_token}"}
    )
    assert res.status_code == 403
    assert "restricted to HR and leadership" in res.json()["detail"]


# ==============================================================================
# TEST 8: Sensitive submission URL/file is never serialized in HR response
# ==============================================================================
@pytest.mark.asyncio
async def test_hr_score_response_omits_file_url(score_client):
    """
    Verifies that file_url and deliverable paths are structurally absent from TaskScoreItemSchema.
    """
    hr_token = await get_token(score_client, "hr.member@studentops.org", "hrmember123")
    res = await score_client.get(
        "/api/tasks/tsk_media_test/scores",
        headers={"Authorization": f"Bearer {hr_token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) > 0
    for item in data:
        assert "file_url" not in item
        assert "file" not in item
        assert "psd" not in str(item).lower()
        assert "drive.google.com" not in str(item).lower()
