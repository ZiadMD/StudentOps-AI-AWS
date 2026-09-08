"""
Unit Tests for the 5 Social Media Committee Demo Accounts.
Verifies:
1. All 5 demo accounts authenticate successfully via email and username.
2. Returned profile roles and committee scopes match authoritative specifications.
3. Role-scoped endpoints enforce expected boundaries (e.g. HR Head read-only oversight).
4. Idempotent seed execution guarantees account presence and credential accuracy without wiping DB.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from app.main import app
from app.core.database import Base, get_db
from app.models.entities import User
from app.seed.seed_data import seed_all


DEMO_ACCOUNTS = [
    {
        "role_name": "HR Region / HR Head",
        "email": "region.head@studentops.org",
        "username": "region.head",
        "password": "head123",
        "expected_role": "region_hr_head",
        "expected_team": None,
    },
    {
        "role_name": "HR Leader",
        "email": "hr.leader@studentops.org",
        "username": "hr.leader",
        "password": "leader123",
        "expected_role": "committee_hr_leader",
        "expected_team": "team_media",
    },
    {
        "role_name": "Social Media Committee Head",
        "email": "media.head@studentops.org",
        "username": "media.head",
        "password": "lead123",
        "expected_role": "committee_head",
        "expected_team": "team_media",
    },
    {
        "role_name": "Social Media HR Member",
        "email": "hr.member@studentops.org",
        "username": "hr.member",
        "password": "hrmember123",
        "expected_role": "committee_hr_member",
        "expected_team": "team_media",
    },
    {
        "role_name": "Social Media Committee Member",
        "email": "member@studentops.org",
        "username": "member",
        "password": "member123",
        "expected_role": "committee_member",
        "expected_team": "team_media",
    },
]


@pytest.fixture
async def test_db_session():
    """Isolated in-memory test database fixture."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        await seed_all(session, force=True)
        yield session

    await engine.dispose()


@pytest.fixture
async def client(test_db_session):
    """FastAPI Test Client with overridden database dependency."""
    async def override_get_db():
        yield test_db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_all_five_demo_accounts_login_by_email(client):
    """Test 1: All 5 demo accounts log in via full email and return correct roles and teams."""
    for acc in DEMO_ACCOUNTS:
        res = await client.post("/api/auth/login", json={
            "email": acc["email"],
            "password": acc["password"],
        })
        assert res.status_code == 200, f"Failed login for {acc['email']}: {res.text}"
        data = res.json()
        assert "access_token" in data
        user = data["user"]
        assert user["email"] == acc["email"]
        assert user["role"] == acc["expected_role"], f"Role mismatch for {acc['email']}: got {user['role']}"
        assert user["team_id"] == acc["expected_team"], f"Team mismatch for {acc['email']}: got {user['team_id']}"


@pytest.mark.asyncio
async def test_all_five_demo_accounts_login_by_username(client):
    """Test 2: All 5 demo accounts log in via short username (without @studentops.org domain)."""
    for acc in DEMO_ACCOUNTS:
        res = await client.post("/api/auth/login", json={
            "email": acc["username"],
            "password": acc["password"],
        })
        assert res.status_code == 200, f"Failed username login for {acc['username']}: {res.text}"
        data = res.json()
        assert data["user"]["role"] == acc["expected_role"]


@pytest.mark.asyncio
async def test_login_supports_username_payload_key(client):
    """Test 3: Login endpoint accepts 'username' instead of 'email' in request body."""
    for acc in DEMO_ACCOUNTS:
        res = await client.post("/api/auth/login", json={
            "username": acc["username"],
            "password": acc["password"],
        })
        assert res.status_code == 200, f"Failed username payload login for {acc['username']}: {res.text}"


@pytest.mark.asyncio
async def test_get_current_user_me_profile_scoping(client):
    """Test 4: Verify GET /auth/me returns identical verified profile for each authenticated demo account."""
    for acc in DEMO_ACCOUNTS:
        login_res = await client.post("/api/auth/login", json={
            "email": acc["email"],
            "password": acc["password"],
        })
        token = login_res.json()["access_token"]
        me_res = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["email"] == acc["email"]
        assert me_data["role"] == acc["expected_role"]
        assert me_data["team_id"] == acc["expected_team"]


@pytest.mark.asyncio
async def test_role_scoped_endpoint_permissions(client):
    """Test 5: Authenticated requests reach expected role-scoped endpoints with strict boundaries."""
    tokens = {}
    for acc in DEMO_ACCOUNTS:
        res = await client.post("/api/auth/login", json={
            "email": acc["email"],
            "password": acc["password"],
        })
        tokens[acc["expected_role"]] = res.json()["access_token"]

    head_token = tokens["region_hr_head"]
    leader_token = tokens["committee_hr_leader"]
    comm_head_token = tokens["committee_head"]
    hr_member_token = tokens["committee_hr_member"]
    member_token = tokens["committee_member"]

    # 1. HR Head has oversight access to reports and dashboard stats
    rep_res = await client.get("/api/reports", headers={"Authorization": f"Bearer {head_token}"})
    assert rep_res.status_code == 200
    stats_res = await client.get("/api/dashboard/stats", headers={"Authorization": f"Bearer {head_token}"})
    assert stats_res.status_code == 200

    # 2. HR Head is strictly blocked from operational task creation (403)
    task_res = await client.post("/api/tasks", json={
        "title": "Unauthorized Task",
        "description": "Should fail",
        "deadline": "2026-10-01T12:00:00Z",
        "max_score": 10.0,
        "score_rule": "Test"
    }, headers={"Authorization": f"Bearer {head_token}"})
    assert task_res.status_code == 403

    # 3. Committee Head CAN access tasks and meetings management
    head_tasks = await client.get("/api/tasks", headers={"Authorization": f"Bearer {comm_head_token}"})
    assert head_tasks.status_code == 200

    # 4. HR Member CAN access WhatsApp escalations and attendance
    esc_res = await client.get("/api/whatsapp/escalations", headers={"Authorization": f"Bearer {hr_member_token}"})
    assert esc_res.status_code == 200

    # 5. Member CAN access their own questions and tasks
    q_res = await client.get("/api/questions", headers={"Authorization": f"Bearer {member_token}"})
    assert q_res.status_code == 200


@pytest.mark.asyncio
async def test_idempotent_seeding_preserves_and_updates_demo_accounts(test_db_session):
    """Test 6: Idempotent re-run of seed_all(force=False) guarantees demo accounts persist without data loss."""
    # Run seed_all again without force on existing database
    await seed_all(test_db_session, force=False)

    # Verify all 5 accounts exist and have expected roles
    for acc in DEMO_ACCOUNTS:
        res = await test_db_session.execute(
            select(User).where(User.email == acc["email"])
        )
        user = res.scalar_one_or_none()
        assert user is not None, f"Account {acc['email']} missing after idempotent seed"
        assert user.role == acc["expected_role"]
        assert user.is_active is True


@pytest.mark.asyncio
async def test_database_url_normalization_resolves_relative_sqlite_paths():
    """Test 7: Verify SQLite relative paths are anchored to canonical backend directory."""
    from app.core.database import get_normalized_database_url
    raw = "sqlite+aiosqlite:///./studentops.db"
    normalized = get_normalized_database_url(raw)
    assert normalized.startswith("sqlite+aiosqlite:///")
    assert normalized.endswith("/studentops.db")
    assert "backend/studentops.db" in normalized.replace("\\", "/")


@pytest.mark.asyncio
async def test_invalid_credentials_properly_rejected_and_bcrypt_verified(client, test_db_session):
    """Test 8: Verify wrong password produces 401 Incorrect email or password, while true bcrypt hash passes."""
    # 1. Invalid password
    bad_res = await client.post("/api/auth/login", json={
        "email": "region.head@studentops.org",
        "password": "wrongpassword999"
    })
    assert bad_res.status_code == 401
    assert "Incorrect email or password" in bad_res.json()["detail"]

    # 2. Non-existent user
    non_res = await client.post("/api/auth/login", json={
        "email": "ghost.user@studentops.org",
        "password": "anypassword123"
    })
    assert non_res.status_code == 401
    assert "Incorrect email or password" in non_res.json()["detail"]

    # 3. Direct bcrypt check on stored hash in database
    from app.core.security import verify_password
    q = await test_db_session.execute(select(User).where(User.email == "region.head@studentops.org"))
    u = q.scalar_one()
    assert verify_password("head123", u.hashed_password) is True
    assert verify_password("wrongpassword", u.hashed_password) is False

