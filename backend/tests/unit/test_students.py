"""
Unit and Integration Tests for Student Creation (POST /api/students).
Verifies RBAC permissions, committee scoping, duplicate email/code guards, and auto-generation.
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


@pytest.mark.asyncio
async def test_admin_can_create_student_with_full_details(client):
    admin_token = await get_token(client, "admin@studentops.org", "admin123")
    payload = {
        "student_code": "CUSTOM-2026-999",
        "full_name": "Kareem Tarek",
        "arabic_name": "كريم طارق",
        "email": "kareem.tarek@studentops.org",
        "phone": "+20 100 999 8888",
        "university": "Cairo University",
        "role": "Member",
        "status": "ACTIVE",
        "team_id": "team_tech",
    }
    res = await client.post(
        "/api/students",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=payload
    )
    assert res.status_code == 201
    data = res.json()
    assert data["student_code"] == "CUSTOM-2026-999"
    assert data["full_name"] == "Kareem Tarek"
    assert data["arabic_name"] == "كريم طارق"
    assert data["email"] == "kareem.tarek@studentops.org"
    assert data["phone"] == "+20 100 999 8888"
    assert data["university"] == "Cairo University"
    assert data["role"] == "Member"
    assert data["status"] == "ACTIVE"
    assert data["team_id"] == "team_tech"
    assert "id" in data


@pytest.mark.asyncio
async def test_committee_lead_creates_student_auto_scoped_to_own_team(client):
    lead_token = await get_token(client, "lead@studentops.org", "lead123")  # TECH lead
    payload = {
        "full_name": "Laila Ahmed",
        "arabic_name": "ليلى أحمد",
        "email": "laila.ahmed@studentops.org",
        "phone": "+20 111 222 3333",
        "role": "Member",
    }
    res = await client.post(
        "/api/students",
        headers={"Authorization": f"Bearer {lead_token}"},
        json=payload
    )
    assert res.status_code == 201
    data = res.json()
    assert data["team_id"] == "team_tech"  # Automatically scoped to TECH team
    assert data["student_code"].startswith("ST-2026-")  # Auto-generated code


@pytest.mark.asyncio
async def test_committee_lead_cannot_create_student_in_other_team(client):
    lead_token = await get_token(client, "lead@studentops.org", "lead123")  # TECH lead
    payload = {
        "full_name": "Omar Samy",
        "arabic_name": "عمر سامي",
        "email": "omar.samy@studentops.org",
        "phone": "+20 112 334 5566",
        "team_id": "team_ops",  # Attempting to assign to OPS team
    }
    res = await client.post(
        "/api/students",
        headers={"Authorization": f"Bearer {lead_token}"},
        json=payload
    )
    assert res.status_code == 403
    assert "Cannot create members outside your assigned committee" in res.json()["detail"]


@pytest.mark.asyncio
async def test_regular_member_forbidden_from_creating_student(client):
    member_token = await get_token(client, "ziad.member@studentops.org", "member123")
    payload = {
        "full_name": "Unauthorized Add",
        "arabic_name": "غير مصرح",
        "email": "unauth@studentops.org",
        "phone": "+20 100 000 0000",
    }
    res = await client.post(
        "/api/students",
        headers={"Authorization": f"Bearer {member_token}"},
        json=payload
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_duplicate_email_rejected_with_conflict_409(client):
    admin_token = await get_token(client, "admin@studentops.org", "admin123")
    payload = {
        "full_name": "Duplicate Email Test",
        "arabic_name": "اختبار البريد",
        "email": "ziad.member@studentops.org",  # Existing seeded email
        "phone": "+20 100 111 2222",
    }
    res = await client.post(
        "/api/students",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=payload
    )
    assert res.status_code == 409
    assert "already exists" in res.json()["detail"]


@pytest.mark.asyncio
async def test_duplicate_student_code_rejected_with_conflict_409(client):
    admin_token = await get_token(client, "admin@studentops.org", "admin123")
    payload = {
        "student_code": "CORE-2026-001",  # Existing seeded code for Ziad
        "full_name": "Duplicate Code Test",
        "arabic_name": "اختبار الكود",
        "email": "new.unique.email@studentops.org",
        "phone": "+20 100 333 4444",
    }
    res = await client.post(
        "/api/students",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=payload
    )
    assert res.status_code == 409
    assert "already exists" in res.json()["detail"]


@pytest.mark.asyncio
async def test_non_existent_team_id_rejected_with_404(client):
    admin_token = await get_token(client, "admin@studentops.org", "admin123")
    payload = {
        "full_name": "Ghost Team Member",
        "arabic_name": "عضو فريق وهمي",
        "email": "ghost.team@studentops.org",
        "phone": "+20 100 555 6666",
        "team_id": "team_non_existent",
    }
    res = await client.post(
        "/api/students",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=payload
    )
    assert res.status_code == 404
    assert "not found" in res.json()["detail"]


@pytest.mark.asyncio
async def test_unauthenticated_request_rejected(client):
    payload = {
        "full_name": "Anonymous Member",
        "arabic_name": "مجهول",
        "email": "anon@studentops.org",
        "phone": "+20 100 777 8888",
    }
    res = await client.post("/api/students", json=payload)
    assert res.status_code == 401
