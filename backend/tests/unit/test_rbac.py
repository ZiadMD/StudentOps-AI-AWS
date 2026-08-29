"""
Unit and Integration Tests for StudentOps AI Role-Based Access Control (RBAC) & Team Scoping.
Verifies permission boundaries across Audit, Students, Tasks, Attendance, Dashboard, and Agent.
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
    """Helper to login and retrieve access token."""
    res = await client.post("/api/auth/login", json={"email": email, "password": password})
    return res.json()["access_token"]


# =========================================================
# 1. Audit Logs RBAC Tests (Admin Only)
# =========================================================

@pytest.mark.asyncio
async def test_audit_logs_rbac_matrix(client):
    admin_token = await get_token(client, "admin@studentops.org", "admin123")
    lead_token = await get_token(client, "lead@studentops.org", "lead123")
    member_token = await get_token(client, "maurine.magdy@studentops.org", "member123")

    # 1. Unauthenticated -> 401
    unauth_resp = await client.get("/api/audit/logs")
    assert unauth_resp.status_code == 401

    # 2. Member -> 403
    member_resp = await client.get("/api/audit/logs", headers={"Authorization": f"Bearer {member_token}"})
    assert member_resp.status_code == 403

    # 3. Team Lead -> 403
    lead_resp = await client.get("/api/audit/logs", headers={"Authorization": f"Bearer {lead_token}"})
    assert lead_resp.status_code == 403

    # 4. HR Admin -> 200
    admin_resp = await client.get("/api/audit/logs", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_resp.status_code == 200
    assert isinstance(admin_resp.json(), list)


# =========================================================
# 2. Students Registry & Scoreboard Scoping Tests
# =========================================================

@pytest.mark.asyncio
async def test_students_list_scoping(client):
    admin_token = await get_token(client, "admin@studentops.org", "admin123")
    lead_token = await get_token(client, "lead@studentops.org", "lead123") # TECH team
    member_token = await get_token(client, "maurine.magdy@studentops.org", "member123") # Maurine (std_maurine)

    # 1. Admin sees all 5 seeded students
    admin_res = await client.get("/api/students", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_res.status_code == 200
    assert len(admin_res.json()) == 5

    # 2. Team Lead of TECH sees 2 students (Maurine & Alaa)
    lead_res = await client.get("/api/students", headers={"Authorization": f"Bearer {lead_token}"})
    assert lead_res.status_code == 200
    lead_students = lead_res.json()
    assert len(lead_students) == 2
    student_codes = [s["student_code"] for s in lead_students]
    assert "ST-2026-001" in student_codes # Maurine
    assert "ST-2026-002" in student_codes # Alaa

    # 3. Member sees only their own student record
    member_res = await client.get("/api/students", headers={"Authorization": f"Bearer {member_token}"})
    assert member_res.status_code == 200
    member_students = member_res.json()
    assert len(member_students) == 1
    assert member_students[0]["id"] == "std_maurine"


@pytest.mark.asyncio
async def test_student_detail_access_permissions(client):
    lead_token = await get_token(client, "lead@studentops.org", "lead123") # TECH team lead
    member_token = await get_token(client, "maurine.magdy@studentops.org", "member123") # TECH member (Maurine)

    # 1. Lead can access student in their team (Maurine) -> 200
    res1 = await client.get("/api/students/std_maurine", headers={"Authorization": f"Bearer {lead_token}"})
    assert res1.status_code == 200

    # 2. Lead attempts to access student in another team (Hanan, OPS team) -> 403
    res2 = await client.get("/api/students/std_hanan", headers={"Authorization": f"Bearer {lead_token}"})
    assert res2.status_code == 403
    assert "different team" in res2.json()["detail"]

    # 3. Member attempts to access another student's profile (Alaa) -> 403
    res3 = await client.get("/api/students/std_alaa", headers={"Authorization": f"Bearer {member_token}"})
    assert res3.status_code == 403
    assert "only view your own" in res3.json()["detail"]


@pytest.mark.asyncio
async def test_scoreboard_scoping(client):
    admin_token = await get_token(client, "admin@studentops.org", "admin123")
    lead_token = await get_token(client, "lead@studentops.org", "lead123") # TECH team lead
    member_token = await get_token(client, "maurine.magdy@studentops.org", "member123")

    # Admin: all scoreboards (5 members)
    res_admin = await client.get("/api/students/scoreboard/all", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_admin.status_code == 200
    assert len(res_admin.json()) == 5

    # Team Lead TECH: only TECH members (Maurine, Alaa)
    res_lead = await client.get("/api/students/scoreboard/all", headers={"Authorization": f"Bearer {lead_token}"})
    assert res_lead.status_code == 200
    lead_scores = res_lead.json()
    assert len(lead_scores) == 2
    scored_ids = [s["student_id"] for s in lead_scores]
    assert "std_maurine" in scored_ids
    assert "std_alaa" in scored_ids

    # Member: only Maurine's score
    res_member = await client.get("/api/students/scoreboard/all", headers={"Authorization": f"Bearer {member_token}"})
    assert res_member.status_code == 200
    member_scores = res_member.json()
    assert len(member_scores) == 1
    assert member_scores[0]["student_id"] == "std_maurine"


# =========================================================
# 3. Dashboard Metrics Scoping Tests
# =========================================================

@pytest.mark.asyncio
async def test_dashboard_stats_scoping(client):
    admin_token = await get_token(client, "admin@studentops.org", "admin123")
    lead_token = await get_token(client, "lead@studentops.org", "lead123") # TECH lead (2 students)
    member_token = await get_token(client, "maurine.magdy@studentops.org", "member123")

    # Admin stats -> 5 total students
    admin_stats = (await client.get("/api/dashboard/stats", headers={"Authorization": f"Bearer {admin_token}"})).json()
    assert admin_stats["total_students"] == 5

    # Lead stats -> 2 team students
    lead_stats = (await client.get("/api/dashboard/stats", headers={"Authorization": f"Bearer {lead_token}"})).json()
    assert lead_stats["total_students"] == 2

    # Member stats -> 1 student (self)
    member_stats = (await client.get("/api/dashboard/stats", headers={"Authorization": f"Bearer {member_token}"})).json()
    assert member_stats["total_students"] == 1


# =========================================================
# 4. Agent Console RBAC Tests
# =========================================================

@pytest.mark.asyncio
async def test_agent_console_rbac(client):
    admin_token = await get_token(client, "admin@studentops.org", "admin123")
    lead_token = await get_token(client, "lead@studentops.org", "lead123")
    member_token = await get_token(client, "maurine.magdy@studentops.org", "member123")

    # Member is forbidden from agent console
    member_resp = await client.post("/api/agent/chat", headers={
        "Authorization": f"Bearer {member_token}"
    }, json={"query": "Who is absent today?"})
    assert member_resp.status_code == 403

    # Team Lead is authorized
    lead_resp = await client.post("/api/agent/chat", headers={
        "Authorization": f"Bearer {lead_token}"
    }, json={"query": "Who is absent today?"})
    assert lead_resp.status_code == 200

    # Admin is authorized
    admin_resp = await client.post("/api/agent/chat", headers={
        "Authorization": f"Bearer {admin_token}"
    }, json={"query": "Who is absent today?"})
    assert admin_resp.status_code == 200
