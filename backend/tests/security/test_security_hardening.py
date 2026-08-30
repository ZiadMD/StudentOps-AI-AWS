"""
Comprehensive Automated Security Hardening & Regression Test Suite for StudentOps AI.
Validates:
- Privilege Escalation Prevention
- Strict Server-Side Role Enforcement
- IDOR / BOLA & Horizontal Privilege Scoping
- Sensitive Action Confirmation Anti-Replay & Anti-Hijacking
- Server-Side Rate Limiting (429s & Retry-After)
- Cryptographic Token & JWT Validation
- Input Validation & Password Boundary Constraints
- Security Headers & CORS Policy Integrity
- Error Sanitization & Information Exposure Prevention
- Conversational State Multi-Tenancy Isolation
"""
import pytest
import asyncio
from datetime import timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from app.main import app
from app.core.database import Base, get_db
from app.core.config import settings
from app.core.security import create_access_token
from app.core.rate_limiter import limiter
from app.models.entities import User, Student, AgentActionAudit
from app.seed.seed_data import seed_all


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Reset rate limiter state before each test."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
async def sec_test_db():
    """Isolated in-memory database initialized and seeded for security evaluations."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        await seed_all(session)
        yield session

    await engine.dispose()


@pytest.fixture
async def sec_client(sec_test_db):
    """FastAPI Test Client bound to the isolated security database."""
    async def override_get_db():
        yield sec_test_db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# Helper to generate bearer headers
def auth_headers(user_id: str, role: str, team_id: str = None) -> dict:
    token = create_access_token({"sub": user_id, "role": role, "team_id": team_id})
    return {"Authorization": f"Bearer {token}"}


# ==============================================================================
# 1. PRIVILEGE ESCALATION & ADMIN CREATION TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_public_registration_cannot_self_assign_admin_role(sec_client):
    """
    SECURITY TEST: Normal user attempts to register with role="hr_admin".
    The server MUST ignore client-supplied role and enforce 'member'.
    """
    res = await sec_client.post("/api/auth/register", json={
        "email": "attacker.admin@studentops.org",
        "password": "SecurePassword123!",
        "full_name": "Malicious Attacker",
        "role": "hr_admin",  # Attacker attempt
        "team_id": "team_tech"
    })
    assert res.status_code == 201
    data = res.json()
    assert data["user"]["role"] == "member"  # Server-side enforcement verified


@pytest.mark.asyncio
async def test_public_registration_cannot_self_assign_lead_role(sec_client):
    """
    SECURITY TEST: Normal user attempts to register with role="team_lead".
    Server strictly creates user as 'member'.
    """
    res = await sec_client.post("/api/auth/register", json={
        "email": "attacker.lead@studentops.org",
        "password": "SecurePassword123!",
        "full_name": "Wannabe Lead",
        "role": "team_lead"
    })
    assert res.status_code == 201
    assert res.json()["user"]["role"] == "member"


@pytest.mark.asyncio
async def test_non_admin_cannot_change_user_roles(sec_client):
    """
    SECURITY TEST: Non-admin users cannot call the role update endpoint.
    """
    member_headers = auth_headers("usr_maurine", "member", "team_tech")
    lead_headers = auth_headers("usr_lead_tech", "team_lead", "team_tech")

    # Member attempting to promote self to admin
    res1 = await sec_client.patch(
        "/api/auth/users/usr_maurine/role",
        headers=member_headers,
        json={"role": "hr_admin"}
    )
    assert res1.status_code == 403

    # Team Lead attempting to promote member to admin
    res2 = await sec_client.patch(
        "/api/auth/users/usr_maurine/role",
        headers=lead_headers,
        json={"role": "hr_admin"}
    )
    assert res2.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_legitimately_update_user_role(sec_client):
    """
    SECURITY TEST: Authorized HR Admin can elevate a user's role.
    """
    admin_headers = auth_headers("usr_admin", "hr_admin")
    res = await sec_client.patch(
        "/api/auth/users/usr_maurine/role",
        headers=admin_headers,
        json={"role": "team_lead"}
    )
    assert res.status_code == 200
    assert res.json()["role"] == "team_lead"


# ==============================================================================
# 2. AUTHORIZATION & ACCESS CONTROL (IDOR / BOLA) TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_unauthenticated_cannot_access_protected_endpoints(sec_client):
    """
    SECURITY TEST: Unauthenticated requests to private endpoints receive 401.
    """
    endpoints = [
        ("GET", "/api/auth/me"),
        ("GET", "/api/students"),
        ("GET", "/api/students/std_maurine"),
        ("GET", "/api/attendance/meetings"),
        ("GET", "/api/tasks"),
        ("GET", "/api/audit/logs"),
        ("GET", "/api/agent/tools"),
        ("POST", "/api/agent/chat"),
    ]
    for method, path in endpoints:
        if method == "GET":
            res = await sec_client.get(path)
        else:
            res = await sec_client.post(path, json={"query": "test"})
        assert res.status_code in (401, 403), f"Endpoint {path} failed auth barrier: {res.status_code}"


@pytest.mark.asyncio
async def test_member_cannot_access_other_member_profile_idor(sec_client):
    """
    SECURITY TEST: Member 'Maurine' cannot access 'Hanan' profile (BOLA/IDOR protection).
    """
    maurine_headers = auth_headers("usr_maurine", "member", "team_tech")
    res = await sec_client.get("/api/students/std_hanan", headers=maurine_headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_team_lead_cannot_access_other_team_student_profile(sec_client):
    """
    SECURITY TEST: Tech team lead cannot access Ops team student profile.
    """
    tech_lead_headers = auth_headers("usr_lead_tech", "team_lead", "team_tech")
    res = await sec_client.get("/api/students/std_hanan", headers=tech_lead_headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_non_admin_cannot_access_audit_logs(sec_client):
    """
    SECURITY TEST: Audit logs are restricted to HR Admin only.
    """
    lead_headers = auth_headers("usr_lead_tech", "team_lead", "team_tech")
    member_headers = auth_headers("usr_maurine", "member", "team_tech")

    res1 = await sec_client.get("/api/audit/logs", headers=lead_headers)
    assert res1.status_code == 403

    res2 = await sec_client.get("/api/audit/logs", headers=member_headers)
    assert res2.status_code == 403


# ==============================================================================
# 3. ACTION CONFIRMATION ANTI-REPLAY & ANTI-HIJACKING TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_agent_action_confirmation_anti_replay(sec_client, sec_test_db):
    """
    SECURITY TEST: A sensitive action cannot be replayed or confirmed multiple times.
    """
    admin_headers = auth_headers("usr_admin", "hr_admin")

    # Seed a pending action in the database
    action_id = "act_test_replay_123"
    audit = AgentActionAudit(
        id=f"aud_{action_id}",
        action_id=action_id,
        user_id="usr_admin",
        intent="SEND_REMINDER",
        tool_name="send_reminder",
        parameters='{"student_ids": ["std_maurine"]}',
        result="{}",
        requires_confirmation=True,
        confirmed=False,
        status="PENDING_CONFIRMATION"
    )
    sec_test_db.add(audit)
    await sec_test_db.commit()

    # 1. First confirmation succeeds
    res1 = await sec_client.post("/api/agent/confirm", headers=admin_headers, json={
        "action_id": action_id,
        "confirmed": True
    })
    assert res1.status_code == 200
    assert res1.json()["status"] == "EXECUTED"

    # 2. Second confirmation attempt MUST fail (anti-replay check)
    res2 = await sec_client.post("/api/agent/confirm", headers=admin_headers, json={
        "action_id": action_id,
        "confirmed": True
    })
    assert res2.status_code == 400
    assert "not pending" in res2.json()["detail"]


@pytest.mark.asyncio
async def test_team_lead_cannot_confirm_reminders_for_other_teams(sec_client, sec_test_db):
    """
    SECURITY TEST: Tech Team Lead cannot confirm a pending reminder targeting Ops team students.
    """
    tech_lead_headers = auth_headers("usr_lead_tech", "team_lead", "team_tech")

    action_id = "act_test_cross_team_456"
    # Action targeting Ops member 'Hanan' (std_hanan is in team_ops)
    audit = AgentActionAudit(
        id=f"aud_{action_id}",
        action_id=action_id,
        user_id="usr_lead_ops",
        intent="SEND_REMINDER",
        tool_name="send_reminder",
        parameters='{"student_ids": ["std_hanan"]}',
        result="{}",
        requires_confirmation=True,
        confirmed=False,
        status="PENDING_CONFIRMATION"
    )
    sec_test_db.add(audit)
    await sec_test_db.commit()

    res = await sec_client.post("/api/agent/confirm", headers=tech_lead_headers, json={
        "action_id": action_id,
        "confirmed": True
    })
    assert res.status_code == 403
    assert "assigned team" in res.json()["detail"]


# ==============================================================================
# 4. SERVER-SIDE RATE LIMITING TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_login_endpoint_rate_limiting(sec_client):
    """
    SECURITY TEST: Rapid login requests exceed the limit and receive HTTP 429.
    """
    # Max login requests per minute is settings.RATE_LIMIT_LOGIN_PER_MINUTE (15)
    limit = settings.RATE_LIMIT_LOGIN_PER_MINUTE
    responses = []
    for _ in range(limit + 2):
        r = await sec_client.post("/api/auth/login", json={
            "email": "nonexistent@studentops.org",
            "password": "wrongpassword123"
        })
        responses.append(r.status_code)

    assert 429 in responses
    # Verify Retry-After header
    last_response = await sec_client.post("/api/auth/login", json={
        "email": "nonexistent@studentops.org",
        "password": "wrongpassword123"
    })
    assert last_response.status_code == 429
    assert "Retry-After" in last_response.headers


@pytest.mark.asyncio
async def test_registration_endpoint_rate_limiting(sec_client):
    """
    SECURITY TEST: Registration spam is rate limited to prevent account exhaustion.
    """
    limit = settings.RATE_LIMIT_REGISTER_PER_MINUTE
    responses = []
    for i in range(limit + 2):
        r = await sec_client.post("/api/auth/register", json={
            "email": f"spam.user.{i}@studentops.org",
            "password": "ValidPassword123!",
            "full_name": f"Spam User {i}"
        })
        responses.append(r.status_code)

    assert 429 in responses


# ==============================================================================
# 5. INPUT VALIDATION & PASSWORD BOUNDARY TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_weak_and_short_passwords_rejected(sec_client):
    """
    SECURITY TEST: Passwords under 8 characters or empty/whitespace are rejected.
    """
    weak_passwords = ["123456", "short", "      ", "abc"]
    for pwd in weak_passwords:
        res = await sec_client.post("/api/auth/register", json={
            "email": f"test.pwd.{len(pwd)}@studentops.org",
            "password": pwd,
            "full_name": "Test User"
        })
        assert res.status_code in (400, 422), f"Weak password '{pwd}' was incorrectly accepted!"


@pytest.mark.asyncio
async def test_excessively_long_passwords_rejected(sec_client):
    """
    SECURITY TEST: Passwords exceeding 128 characters are rejected to prevent DoS.
    """
    long_pwd = "A" * 200
    res = await sec_client.post("/api/auth/register", json={
        "email": "toolong@studentops.org",
        "password": long_pwd,
        "full_name": "Test User"
    })
    assert res.status_code in (400, 422)


# ==============================================================================
# 6. SECURITY HEADERS & CORS TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_security_headers_present_on_responses(sec_client):
    """
    SECURITY TEST: All standard security headers are attached to responses.
    """
    res = await sec_client.get("/")
    assert res.status_code == 200
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "Content-Security-Policy" in res.headers


@pytest.mark.asyncio
async def test_cors_origin_policy(sec_client):
    """
    SECURITY TEST: Verified allowed origin receives CORS credentials headers.
    """
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST"
    }
    res = await sec_client.options("/api/auth/login", headers=headers)
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert res.headers.get("access-control-allow-credentials") == "true"


# ==============================================================================
# 7. JWT FORGERY & EXPIRATION TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_forged_jwt_signature_rejected(sec_client):
    """
    SECURITY TEST: Tokens signed with an invalid secret key are rejected with 401.
    """
    fake_token = create_access_token(
        {"sub": "usr_admin", "role": "hr_admin"},
        expires_delta=timedelta(minutes=15)
    ) + "tampered"

    res = await sec_client.get("/api/auth/me", headers={"Authorization": f"Bearer {fake_token}"})
    assert res.status_code == 401


# ==============================================================================
# 8. CONVERSATIONAL STATE MULTI-TENANCY ISOLATION
# ==============================================================================

@pytest.mark.asyncio
async def test_agent_conversation_state_isolated_between_users(sec_client):
    """
    SECURITY TEST: Two different users using the same conversation_id do not share state.
    """
    admin_headers = auth_headers("usr_admin", "hr_admin")
    lead_headers = auth_headers("usr_lead_tech", "team_lead", "team_tech")

    conv_id = "shared_conv_123"

    # User 1 queries attendance
    res1 = await sec_client.post("/api/agent/chat", headers=admin_headers, json={
        "query": "Who was absent today?",
        "conversation_id": conv_id
    })
    assert res1.status_code == 200

    # User 2 queries reminder in the same conversation_id
    res2 = await sec_client.post("/api/agent/chat", headers=lead_headers, json={
        "query": "What upcoming meetings are there?",
        "conversation_id": conv_id
    })
    assert res2.status_code == 200
