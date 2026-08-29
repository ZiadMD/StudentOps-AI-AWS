"""
Unit and Integration Tests for StudentOps AI Authentication & Authorization.
Tests password hashing, JWT operations, registration, login, token refresh, and RBAC.
"""
import pytest
from datetime import timedelta
import jwt
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.core.database import Base, get_db
from app.core.config import settings
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token
)
from app.seed.seed_data import seed_all


@pytest.fixture
async def test_db_session():
    """Create an isolated in-memory SQLite database for test execution."""
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


# =========================================================
# 1. Cryptographic and JWT Unit Tests
# =========================================================

def test_password_hashing_and_verification():
    password = "SuperSecretPassword123!"
    hashed = get_password_hash(password)

    assert hashed != password
    assert hashed.startswith("$2b$") or hashed.startswith("$2a$")
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword", hashed) is False
    assert verify_password("", hashed) is False


def test_jwt_token_generation_and_decoding():
    payload = {"sub": "usr_test123", "role": "hr_admin", "email": "test@studentops.org"}
    token = create_access_token(payload, expires_delta=timedelta(minutes=15))

    decoded = decode_token(token)
    assert decoded["sub"] == "usr_test123"
    assert decoded["role"] == "hr_admin"
    assert decoded["email"] == "test@studentops.org"
    assert decoded["type"] == "access"
    assert "exp" in decoded


def test_jwt_expired_token():
    payload = {"sub": "usr_expired", "role": "member"}
    expired_token = create_access_token(payload, expires_delta=timedelta(seconds=-10))

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_token(expired_token)


def test_jwt_refresh_token_type():
    payload = {"sub": "usr_refresh"}
    refresh_token = create_refresh_token(payload)

    decoded = decode_token(refresh_token)
    assert decoded["type"] == "refresh"


# =========================================================
# 2. Authentication API Endpoints
# =========================================================

@pytest.mark.asyncio
async def test_login_success(client):
    response = await client.post("/api/auth/login", json={
        "email": "admin@studentops.org",
        "password": "admin123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "admin@studentops.org"
    assert data["user"]["role"] == "hr_admin"


@pytest.mark.asyncio
async def test_login_invalid_password(client):
    response = await client.post("/api/auth/login", json={
        "email": "admin@studentops.org",
        "password": "wrongpassword"
    })
    assert response.status_code == 401
    assert "Incorrect email or password" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_nonexistent_email(client):
    response = await client.post("/api/auth/login", json={
        "email": "nobody@studentops.org",
        "password": "password123"
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_register_user_success(client):
    response = await client.post("/api/auth/register", json={
        "email": "new.member@studentops.org",
        "password": "strongPassword123",
        "full_name": "New Developer",
        "arabic_name": "مطور جديد",
        "role": "member",
        "team_id": "team_tech"
    })
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "new.member@studentops.org"
    assert data["user"]["team_name"] == "Technical & Engineering"
    assert data["user"]["role"] == "member"


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    response = await client.post("/api/auth/register", json={
        "email": "admin@studentops.org",
        "password": "anotherpassword",
        "full_name": "Duplicate Admin",
        "role": "member"
    })
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


@pytest.mark.asyncio
async def test_refresh_token_endpoint(client):
    # 1. Login to get refresh token
    login_resp = await client.post("/api/auth/login", json={
        "email": "lead@studentops.org",
        "password": "lead123"
    })
    refresh_token = login_resp.json()["refresh_token"]

    # 2. Call refresh
    refresh_resp = await client.post("/api/auth/refresh", json={
        "refresh_token": refresh_token
    })
    assert refresh_resp.status_code == 200
    data = refresh_resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_get_current_user_me(client):
    # 1. Login
    login_resp = await client.post("/api/auth/login", json={
        "email": "maurine.magdy@studentops.org",
        "password": "member123"
    })
    access_token = login_resp.json()["access_token"]

    # 2. Call /auth/me with Bearer token
    me_resp = await client.get("/api/auth/me", headers={
        "Authorization": f"Bearer {access_token}"
    })
    assert me_resp.status_code == 200
    data = me_resp.json()
    assert data["email"] == "maurine.magdy@studentops.org"
    assert data["full_name"] == "Maurine Magdy Adly"
    assert data["role"] == "member"
    assert data["team_name"] == "Technical & Engineering"
    assert data["student_id"] == "std_maurine"


@pytest.mark.asyncio
async def test_get_me_unauthenticated(client):
    response = await client.get("/api/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_invalid_token(client):
    response = await client.get("/api/auth/me", headers={
        "Authorization": "Bearer completely-invalid-jwt-token"
    })
    assert response.status_code == 401


# =========================================================
# 3. Teams & RBAC Enforcement Tests
# =========================================================

@pytest.mark.asyncio
async def test_list_teams(client):
    response = await client.get("/api/auth/teams")
    assert response.status_code == 200
    teams = response.json()
    assert len(teams) >= 3
    codes = [t["code"] for t in teams]
    assert "TECH" in codes
    assert "OPS" in codes
    assert "MEDIA" in codes


@pytest.mark.asyncio
async def test_create_team_admin_only(client):
    # 1. Login as admin
    admin_login = await client.post("/api/auth/login", json={
        "email": "admin@studentops.org",
        "password": "admin123"
    })
    admin_token = admin_login.json()["access_token"]

    # 2. Create team as admin -> 201 Created
    create_resp = await client.post("/api/auth/teams", headers={
        "Authorization": f"Bearer {admin_token}"
    }, json={
        "name": "Design & UI/UX",
        "code": "UIUX",
        "description": "Design system and user interfaces"
    })
    assert create_resp.status_code == 201
    assert create_resp.json()["code"] == "UIUX"

    # 3. Login as member
    member_login = await client.post("/api/auth/login", json={
        "email": "maurine.magdy@studentops.org",
        "password": "member123"
    })
    member_token = member_login.json()["access_token"]

    # 4. Attempt to create team as member -> 403 Forbidden
    forbidden_resp = await client.post("/api/auth/teams", headers={
        "Authorization": f"Bearer {member_token}"
    }, json={
        "name": "Unauthorized Team",
        "code": "HACK",
        "description": "Should fail"
    })
    assert forbidden_resp.status_code == 403
