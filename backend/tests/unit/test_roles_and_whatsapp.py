"""
Unit & Integration Tests for 5-Tier Role Model and WhatsApp Architecture.
Verifies permission boundaries, technical vs. behavior evaluation isolation,
and WhatsApp direct link generation.
"""
import pytest
from httpx import AsyncClient, ASGITransport
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


async def get_token(client: AsyncClient, email: str, password: str) -> str:
    res = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return res.json()["access_token"]


@pytest.mark.asyncio
async def test_five_tier_logins(client):
    """Verifies that all 5 roles can authenticate successfully."""
    region_token = await get_token(client, "region.head@studentops.org", "head123")
    assert region_token is not None

    leader_token = await get_token(client, "hr.leader@studentops.org", "leader123")
    assert leader_token is not None

    head_token = await get_token(client, "lead@studentops.org", "lead123")
    assert head_token is not None

    hr_member_token = await get_token(client, "hr.member@studentops.org", "hrmember123")
    assert hr_member_token is not None

    member_token = await get_token(client, "maurine.magdy@studentops.org", "member123")
    assert member_token is not None


@pytest.mark.asyncio
async def test_technical_submissions_privacy_for_hr_roles(client):
    """
    Technical submissions MUST be accessible only to Committee Head and submitting member.
    Neither Region HR Head, HR Leader, nor HR Member may view them.
    """
    head_token = await get_token(client, "lead@studentops.org", "lead123")
    region_token = await get_token(client, "region.head@studentops.org", "head123")
    leader_token = await get_token(client, "hr.leader@studentops.org", "leader123")
    hr_member_token = await get_token(client, "hr.member@studentops.org", "hrmember123")

    # 1. Committee Head accesses submissions -> 200
    res_head = await client.get("/api/tasks/task_001/submissions", headers={"Authorization": f"Bearer {head_token}"})
    assert res_head.status_code == 200
    assert isinstance(res_head.json(), list)

    # 2. Region HR Head forbidden -> 403
    res_region = await client.get("/api/tasks/task_001/submissions", headers={"Authorization": f"Bearer {region_token}"})
    assert res_region.status_code == 403
    assert "HR roles do not have permission" in res_region.json()["detail"]

    # 3. Committee HR Leader forbidden -> 403
    res_leader = await client.get("/api/tasks/task_001/submissions", headers={"Authorization": f"Bearer {leader_token}"})
    assert res_leader.status_code == 403

    # 4. Committee HR Member forbidden -> 403
    res_hr_member = await client.get("/api/tasks/task_001/submissions", headers={"Authorization": f"Bearer {hr_member_token}"})
    assert res_hr_member.status_code == 403


@pytest.mark.asyncio
async def test_technical_submission_review_by_committee_head(client):
    """Committee Head can review and assign technical scores (/10). HR roles cannot."""
    head_token = await get_token(client, "lead@studentops.org", "lead123")
    hr_member_token = await get_token(client, "hr.member@studentops.org", "hrmember123")

    # Head reviews submission
    review_res = await client.put(
        "/api/tasks/submissions/sub_m1/review",
        headers={"Authorization": f"Bearer {head_token}"},
        json={"score": 9.5, "reviewer_notes": "Excellent architecture and documentation"}
    )
    assert review_res.status_code == 200
    data = review_res.json()
    assert data["score"] == 9.5
    assert data["technical_score"] == 9.5
    assert data["reviewer_notes"] == "Excellent architecture and documentation"

    # HR Member cannot review technical submission -> 403
    bad_res = await client.put(
        "/api/tasks/submissions/sub_m1/review",
        headers={"Authorization": f"Bearer {hr_member_token}"},
        json={"score": 10.0, "reviewer_notes": "Attempt by HR"}
    )
    assert bad_res.status_code == 403


@pytest.mark.asyncio
async def test_behavior_score_update_by_hr_member(client):
    """HR Member can grade behavior (/23) for assigned student; Committee Head is read-only."""
    head_token = await get_token(client, "lead@studentops.org", "lead123")
    hr_member_token = await get_token(client, "hr.member@studentops.org", "hrmember123")

    # HR Member updates behavior scores
    update_res = await client.put(
        "/api/students/std_maurine/behavior-score",
        headers={"Authorization": f"Bearer {hr_member_token}"},
        json={
            "student_id": "std_maurine",
            "group_interaction": 4.5,
            "social_media": 5.0,
            "hierarchy_rules": 4.0,
            "polite_conduct": 7.5,
            "notes": "Very active during sync"
        }
    )
    assert update_res.status_code == 200
    summary = update_res.json()
    assert summary["group_interaction_score"] == 4.5
    assert summary["total_behavior_score"] == 21.0

    # Committee Head cannot update behavior score (Read-only) -> 403
    head_bad = await client.put(
        "/api/students/std_maurine/behavior-score",
        headers={"Authorization": f"Bearer {head_token}"},
        json={
            "student_id": "std_maurine",
            "group_interaction": 5.0,
            "social_media": 5.0,
            "hierarchy_rules": 5.0,
            "polite_conduct": 8.0,
        }
    )
    assert head_bad.status_code == 403


@pytest.mark.asyncio
async def test_whatsapp_direct_link_generation(client):
    """Generates zero-trust client-side wa.me links with bilingual pre-filled templates."""
    hr_member_token = await get_token(client, "hr.member@studentops.org", "hrmember123")

    res = await client.post(
        "/api/whatsapp/generate-link?student_id=std_maurine&template_type=OVERDUE_TASK",
        headers={"Authorization": f"Bearer {hr_member_token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert "https://wa.me/201012345678" in data["encoded_url"]
    assert "Maurine" in data["message_text"]
    assert "مورين" in data["message_text"]
    assert data["student_name"] == "Maurine Magdy Adly"


@pytest.mark.asyncio
async def test_whatsapp_sla_escalations(client):
    """SLA escalation monitor correctly returns overdue flags older than 3 days."""
    leader_token = await get_token(client, "hr.leader@studentops.org", "leader123")

    res = await client.get("/api/whatsapp/escalations", headers={"Authorization": f"Bearer {leader_token}"})
    assert res.status_code == 200
    escalations = res.json()
    assert len(escalations) >= 1
    maurine_flag = next((e for e in escalations if e["student_id"] == "std_maurine"), None)
    assert maurine_flag is not None
    assert maurine_flag["is_escalated"] is True
    assert maurine_flag["days_open"] >= 3
