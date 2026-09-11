"""
Security Regression Test Suite: Prevention of Account Takeover in Student Registration.
Tests:
- TEST 1: Attack using existing student's email (Account created but NEVER auto-linked).
- TEST 2: User-controlled student_id payload rejection/ignoring.
- TEST 3: Privileged role injection prevention across all 5-tier & legacy roles.
- TEST 4: Valid trusted linking flow via HR-issued cryptographic single-use invitation tokens.
          (Success, token reuse prevention, expiration, invalid token, cross-student binding mismatch).
- TEST 5: Legitimate existing users and login workflows remain intact.
- TEST 6: Email enumeration prevention across unauthenticated registration.
"""
import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from app.main import app
from app.core.database import Base, get_db
from app.core.rate_limiter import limiter
from app.core.security import create_access_token, hash_invitation_token
from app.models.entities import User, Student, StudentInvitation, Team
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


def auth_headers(user_id: str, role: str, team_id: str = None) -> dict:
    token = create_access_token({"sub": user_id, "role": role, "team_id": team_id})
    return {"Authorization": f"Bearer {token}"}


# ==============================================================================
# TEST 1 — Attack using existing student's email
# ==============================================================================
@pytest.mark.asyncio
async def test_registration_with_existing_student_email_does_not_link_student_id(sec_client, sec_test_db):
    """
    SECURITY TEST: An attacker discovers an enrolled student's email and registers an account.
    VULNERABILITY CHECK: Previously, this auto-assigned student_id to the new account.
    SECURE BEHAVIOR: The account MUST NOT be linked to victim.student_id.
    """
    # 1. Create a pre-existing student in DB without an account
    victim_student = Student(
        id="std_victim_unlinked",
        student_code="S-VICTIM-99",
        full_name="Victim Student",
        arabic_name="طالب الضحية",
        email="victim.student@studentops.org",
        phone="+201099998888",
        team_id="team_media",
        role="Member",
        status="ACTIVE"
    )
    sec_test_db.add(victim_student)
    await sec_test_db.commit()

    # 2. Attacker registers using victim's email and attacker password
    reg_resp = await sec_client.post("/api/auth/register", json={
        "email": "victim.student@studentops.org",
        "password": "AttackerPassword123!",
        "full_name": "Attacker Impersonator",
        "arabic_name": "المهاجم المنتحل"
    })
    assert reg_resp.status_code == 201
    reg_data = reg_resp.json()

    # Verify registration response: student_id MUST be None
    assert reg_data["user"]["student_id"] is None
    assert reg_data["user"]["role"] == "member"

    attacker_token = reg_data["access_token"]

    # 3. Attacker checks /api/auth/me
    me_resp = await sec_client.get("/api/auth/me", headers={"Authorization": f"Bearer {attacker_token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["student_id"] is None

    # 4. Attacker attempts to access the victim's student profile
    profile_resp = await sec_client.get(
        f"/api/students/{victim_student.id}",
        headers={"Authorization": f"Bearer {attacker_token}"}
    )
    # Must be 403 Forbidden because attacker is not linked to this student
    assert profile_resp.status_code == 403


# ==============================================================================
# TEST 2 — User-controlled student_id injection
# ==============================================================================
@pytest.mark.asyncio
async def test_registration_ignores_client_supplied_student_id(sec_client):
    """
    SECURITY TEST: Client attempts to directly inject 'student_id' in registration body.
    SECURE BEHAVIOR: Server ignores client-supplied student_id; account is unlinked.
    """
    reg_resp = await sec_client.post("/api/auth/register", json={
        "email": "hacker.injection@studentops.org",
        "password": "SecurePassword123!",
        "full_name": "Hacker Injection",
        "student_id": "std_mohamed"  # Pre-existing seeded student
    })
    assert reg_resp.status_code == 201
    data = reg_resp.json()
    assert data["user"]["student_id"] is None


# ==============================================================================
# TEST 3 — Privileged role injection prevention
# ==============================================================================
@pytest.mark.asyncio
@pytest.mark.parametrize("malicious_role", [
    "region_hr_head",
    "committee_hr_leader",
    "committee_head",
    "committee_hr_member",
    "hr_admin",
    "team_lead"
])
async def test_registration_rejects_privileged_role_self_assignment(sec_client, malicious_role):
    """
    SECURITY TEST: Malicious client supplies privileged roles during public registration.
    SECURE BEHAVIOR: Server strictly overrides with 'member'.
    """
    reg_resp = await sec_client.post("/api/auth/register", json={
        "email": f"hacker.{malicious_role}@studentops.org",
        "password": "SecurePassword123!",
        "full_name": f"Hacker {malicious_role}",
        "role": malicious_role
    })
    assert reg_resp.status_code == 201
    data = reg_resp.json()
    assert data["user"]["role"] == "member"


# ==============================================================================
# TEST 4 — Valid trusted linking flow via HR invitation tokens
# ==============================================================================
@pytest.mark.asyncio
async def test_trusted_invitation_flow_end_to_end(sec_client, sec_test_db):
    """
    SECURITY & FUNCTIONAL TEST:
    1. HR issues an invitation token for a student profile.
    2. Student registers using the token -> successfully linked to student_id.
    3. Reusing the token -> rejected with HTTP 400.
    4. Invalid token -> rejected with HTTP 400.
    5. Expired token -> rejected with HTTP 400.
    6. Attempting to use student A's token for student B's registration -> rejected.
    """
    # 1. Create two unlinked students
    student_a = Student(
        id="std_inv_alice",
        student_code="S-ALICE-01",
        full_name="Alice Member",
        arabic_name="أليس",
        email="alice.invited@studentops.org",
        phone="+201011112222",
        team_id="team_media",
        role="Member",
        status="ACTIVE"
    )
    student_b = Student(
        id="std_inv_bob",
        student_code="S-BOB-02",
        full_name="Bob Member",
        arabic_name="بوب",
        email="bob.invited@studentops.org",
        phone="+201033334444",
        team_id="team_tech",
        role="Member",
        status="ACTIVE"
    )
    sec_test_db.add_all([student_a, student_b])
    await sec_test_db.commit()

    # 2. HR Admin generates an invitation token for Alice
    hr_headers = auth_headers(user_id="usr_admin", role="hr_admin")
    inv_resp = await sec_client.post(
        f"/api/students/{student_a.id}/invitation",
        headers=hr_headers,
        json={"expires_in_days": 7}
    )
    assert inv_resp.status_code == 201
    inv_data = inv_resp.json()
    raw_token_alice = inv_data["token"]
    assert raw_token_alice.startswith("inv_")
    assert inv_data["student_id"] == student_a.id

    # 3. Attacker tries to use Alice's token to register under Bob's email
    cross_resp = await sec_client.post("/api/auth/register", json={
        "email": "bob.invited@studentops.org",
        "password": "BobPassword123!",
        "full_name": "Bob Imposter",
        "invitation_token": raw_token_alice
    })
    assert cross_resp.status_code == 400
    assert "bound to a different email" in cross_resp.json()["detail"]

    # 4. Legitimate Alice registers with her valid invitation token
    alice_reg_resp = await sec_client.post("/api/auth/register", json={
        "email": "alice.invited@studentops.org",
        "password": "AlicePassword123!",
        "full_name": "Alice Member",
        "arabic_name": "أليس",
        "invitation_token": raw_token_alice
    })
    assert alice_reg_resp.status_code == 201
    alice_data = alice_reg_resp.json()
    assert alice_data["user"]["student_id"] == student_a.id
    assert alice_data["user"]["team_id"] == "team_media"

    # 5. Token reuse attempt: Alice tries to register again with same token (or attacker tries)
    reuse_resp = await sec_client.post("/api/auth/register", json={
        "email": "alice.second@studentops.org",
        "password": "SecondPassword123!",
        "full_name": "Alice Second",
        "invitation_token": raw_token_alice
    })
    assert reuse_resp.status_code == 400
    assert "already been used" in reuse_resp.json()["detail"]

    # 6. Invalid token attempt
    invalid_resp = await sec_client.post("/api/auth/register", json={
        "email": "charlie@studentops.org",
        "password": "CharliePassword123!",
        "full_name": "Charlie",
        "invitation_token": "inv_nonexistent_token_12345"
    })
    assert invalid_resp.status_code == 400
    assert "Invalid invitation token" in invalid_resp.json()["detail"]

    # 7. Expired token attempt
    expired_inv = StudentInvitation(
        id="inv_expired_test",
        student_id=student_b.id,
        token_hash=hash_invitation_token("inv_expired_raw_token_xyz"),
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        is_used=False
    )
    sec_test_db.add(expired_inv)
    await sec_test_db.commit()

    exp_resp = await sec_client.post("/api/auth/register", json={
        "email": "bob.invited@studentops.org",
        "password": "BobPassword123!",
        "full_name": "Bob Member",
        "invitation_token": "inv_expired_raw_token_xyz"
    })
    assert exp_resp.status_code == 400
    assert "expired" in exp_resp.json()["detail"]


@pytest.mark.asyncio
async def test_post_registration_link_student_flow(sec_client, sec_test_db):
    """
    SECURITY TEST: An existing authenticated user links an invitation token via /api/auth/link-student.
    """
    # 1. Create unlinked student
    student = Student(
        id="std_postlink_test",
        student_code="S-POSTLINK-01",
        full_name="David PostLink",
        arabic_name="ديفيد",
        email="david@studentops.org",
        phone="+201055556666",
        team_id="team_tech",
        role="Member",
        status="ACTIVE"
    )
    sec_test_db.add(student)
    await sec_test_db.commit()

    # 2. David registers WITHOUT an invitation token
    reg_resp = await sec_client.post("/api/auth/register", json={
        "email": "david@studentops.org",
        "password": "DavidPassword123!",
        "full_name": "David PostLink"
    })
    assert reg_resp.status_code == 201
    assert reg_resp.json()["user"]["student_id"] is None
    david_token = reg_resp.json()["access_token"]

    # 3. HR generates invitation token for David
    hr_headers = auth_headers(user_id="usr_admin", role="hr_admin")
    inv_resp = await sec_client.post(
        f"/api/students/{student.id}/invitation",
        headers=hr_headers
    )
    assert inv_resp.status_code == 201
    raw_token = inv_resp.json()["token"]

    # 4. David links token via /api/auth/link-student
    link_resp = await sec_client.post(
        "/api/auth/link-student",
        headers={"Authorization": f"Bearer {david_token}"},
        json={"invitation_token": raw_token}
    )
    assert link_resp.status_code == 200
    assert link_resp.json()["student_id"] == student.id
    assert link_resp.json()["team_id"] == "team_tech"

    # 5. Re-linking fails
    relink_resp = await sec_client.post(
        "/api/auth/link-student",
        headers={"Authorization": f"Bearer {david_token}"},
        json={"invitation_token": raw_token}
    )
    assert relink_resp.status_code == 400
    assert "already linked" in relink_resp.json()["detail"]


# ==============================================================================
# TEST 5 — Existing legitimate accounts and logins remain fully functional
# ==============================================================================
@pytest.mark.asyncio
async def test_existing_legitimate_accounts_unaffected(sec_client):
    """
    VERIFICATION: Ensure all existing seeded accounts continue to authenticate and retain student profiles.
    """
    # 1. Login seeded member who has student_id
    member_login = await sec_client.post("/api/auth/login", json={
        "email": "ziad.member@studentops.org",
        "password": "member123"
    })
    assert member_login.status_code == 200
    user_data = member_login.json()["user"]
    assert user_data["student_id"] == "std_ziad"
    assert user_data["email"] == "ziad.member@studentops.org"

    # 2. Login admin
    admin_login = await sec_client.post("/api/auth/login", json={
        "email": "admin@studentops.org",
        "password": "admin123"
    })
    assert admin_login.status_code == 200
    assert admin_login.json()["user"]["role"] == "hr_admin"


# ==============================================================================
# TEST 6 — Email enumeration prevention
# ==============================================================================
@pytest.mark.asyncio
async def test_email_enumeration_prevention(sec_client, sec_test_db):
    """
    SECURITY TEST: Verify that unauthenticated registration does not leak whether a student exists.
    """
    # Create an enrolled student
    student = Student(
        id="std_enum_check",
        student_code="S-ENUM-01",
        full_name="Enum Student",
        arabic_name="طالب",
        email="enrolled.student@studentops.org",
        phone="+201077778888",
        team_id="team_tech",
        role="Member",
        status="ACTIVE"
    )
    sec_test_db.add(student)
    await sec_test_db.commit()

    # Register with enrolled student email (without invitation token)
    resp_enrolled = await sec_client.post("/api/auth/register", json={
        "email": "enrolled.student@studentops.org",
        "password": "SecretPassword123!",
        "full_name": "Test User"
    })

    # Register with completely unknown email
    resp_unknown = await sec_client.post("/api/auth/register", json={
        "email": "completely.unknown@studentops.org",
        "password": "SecretPassword123!",
        "full_name": "Test User"
    })

    # Both must return 201 Created with student_id=None
    assert resp_enrolled.status_code == 201
    assert resp_unknown.status_code == 201
    assert resp_enrolled.json()["user"]["student_id"] is None
    assert resp_unknown.json()["user"]["student_id"] is None
    # Responses are structurally identical, giving zero hint that one is an enrolled student
