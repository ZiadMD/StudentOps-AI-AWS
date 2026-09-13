import pytest
import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.main import app
from app.models.entities import User, Student, StudentInvitation, Team
from app.core.database import AsyncSessionLocal

@pytest.fixture(scope="module")
async def ato_setup(db_setup_teardown):
    """
    Sets up the test data for Account Takeover (ISSUE-01) scenarios.
    """
    now = datetime.now(timezone.utc)
    
    t_id = "team_ato_1"
    std_a_id = "std_ato_a"
    std_a_email = "target_a@studentops.org"
    tok_a = "secret_token_a"

    std_b_id = "std_ato_b"
    std_b_email = "target_b@studentops.org"
    tok_b = "secret_token_b"

    std_c_id = "std_ato_c"
    std_c_email = "target_c@studentops.org"
    tok_c = "secret_token_c"

    std_d_id = "std_ato_d"
    std_d_email = "target_d@studentops.org"
    tok_d = "secret_token_d"

    async with AsyncSessionLocal() as db:
        # Create Team
        team = Team(id=t_id, name="ATO Team", code="ATO", description="ATO")
        db.add(team)
        await db.flush()
        
        # 1. Student A (Legitimate target, has active valid invitation)
        std_a = Student(id=std_a_id, email=std_a_email, full_name="Target A", arabic_name="Target A", team_id=t_id, student_code="ATO1", phone="+ATO1")
        db.add(std_a)
        
        inv_a = StudentInvitation(
            id="inv_ato_a",
            student_id=std_a_id,
            token_hash=hashlib.sha256(tok_a.encode()).hexdigest(),
            expires_at=now + timedelta(days=1),
            is_used=False
        )
        db.add(inv_a)
        
        # 2. Student B (Already claimed target)
        std_b = Student(id=std_b_id, email=std_b_email, full_name="Target B", arabic_name="Target B", team_id=t_id, student_code="ATO2", phone="+ATO2")
        db.add(std_b)
        await db.flush()
        
        user_b = User(
            id="usr_ato_b",
            email=std_b_email,
            hashed_password="fake",
            full_name="Claimed User B",
            role="member",
            team_id=t_id,
            student_id=std_b_id,
            is_active=True
        )
        db.add(user_b)
        
        inv_b = StudentInvitation(
            id="inv_ato_b",
            student_id=std_b_id,
            token_hash=hashlib.sha256(tok_b.encode()).hexdigest(),
            expires_at=now + timedelta(days=1),
            is_used=False
        )
        db.add(inv_b)

        # 3. Student C (Expired invitation target)
        std_c = Student(id=std_c_id, email=std_c_email, full_name="Target C", arabic_name="Target C", team_id=t_id, student_code="ATO3", phone="+ATO3")
        db.add(std_c)
        
        inv_c = StudentInvitation(
            id="inv_ato_c",
            student_id=std_c_id,
            token_hash=hashlib.sha256(tok_c.encode()).hexdigest(),
            expires_at=now - timedelta(days=1),  # EXPIRED
            is_used=False
        )
        db.add(inv_c)
        
        # 4. Student D (Used token target)
        std_d = Student(id=std_d_id, email=std_d_email, full_name="Target D", arabic_name="Target D", team_id=t_id, student_code="ATO4", phone="+ATO4")
        db.add(std_d)
        
        inv_d = StudentInvitation(
            id="inv_ato_d",
            student_id=std_d_id,
            token_hash=hashlib.sha256(tok_d.encode()).hexdigest(),
            expires_at=now + timedelta(days=1),
            is_used=True,  # ALREADY USED
            used_at=now,
            used_by_user_id="usr_ato_b"
        )
        db.add(inv_d)
        
        await db.commit()
    
    return {
        "team_id": t_id,
        "std_a_id": std_a_id, "std_a_email": std_a_email, "tok_a": tok_a,
        "std_b_id": std_b_id, "std_b_email": std_b_email, "tok_b": tok_b,
        "std_c_id": std_c_id, "std_c_email": std_c_email, "tok_c": tok_c,
        "std_d_id": std_d_id, "std_d_email": std_d_email, "tok_d": tok_d,
    }

@pytest.mark.asyncio
async def test_attack_a_unauthorized_claim_without_token(ato_setup):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "email": "attacker@studentops.org",
            "password": "StrongPassword123!",
            "full_name": "Attacker",
            "team_id": ato_setup["team_id"],
            "invitation_token": None
        }
        res = await client.post("/api/auth/register", json=payload)
        assert res.status_code == 201
        
        async with AsyncSessionLocal() as db:
            user_res = await db.execute(select(User).where(User.email == payload["email"]))
            attacker_user = user_res.scalar_one()
            assert attacker_user.student_id is None, "ATO bypass: Attacker successfully claimed a student profile without token."


@pytest.mark.asyncio
async def test_attack_b_invalid_or_expired_token(ato_setup):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Invalid Token
        res_invalid = await client.post("/api/auth/register", json={
            "email": ato_setup["std_a_email"],
            "password": "StrongPassword123!",
            "full_name": "Attacker",
            "team_id": ato_setup["team_id"],
            "invitation_token": "fake_token"
        })
        assert res_invalid.status_code == 400
        assert "invalid invitation token" in res_invalid.json()["detail"].lower()
        
        # 2. Expired Token
        res_exp = await client.post("/api/auth/register", json={
            "email": ato_setup["std_c_email"],
            "password": "StrongPassword123!",
            "full_name": "Attacker",
            "team_id": ato_setup["team_id"],
            "invitation_token": ato_setup["tok_c"]
        })
        assert res_exp.status_code == 400
        assert "expired" in res_exp.json()["detail"].lower()
        
        # 3. Used Token (Replay)
        res_used = await client.post("/api/auth/register", json={
            "email": ato_setup["std_d_email"],
            "password": "StrongPassword123!",
            "full_name": "Attacker",
            "team_id": ato_setup["team_id"],
            "invitation_token": ato_setup["tok_d"]
        })
        assert res_used.status_code == 400
        assert "used" in res_used.json()["detail"].lower()


@pytest.mark.asyncio
async def test_attack_c_identity_mismatch(ato_setup):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/auth/register", json={
            "email": "attacker_stolen@studentops.org",
            "password": "StrongPassword123!",
            "full_name": "Attacker",
            "team_id": ato_setup["team_id"],
            "invitation_token": ato_setup["tok_a"]
        })
        assert res.status_code == 400
        assert "different email" in res.json()["detail"].lower()
        
        async with AsyncSessionLocal() as db:
            inv_res = await db.execute(select(StudentInvitation).where(StudentInvitation.id == "inv_ato_a"))
            inv = inv_res.scalar_one()
            assert inv.is_used is False


@pytest.mark.asyncio
async def test_attack_e_already_bound_identity(ato_setup):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/auth/register", json={
            "email": ato_setup["std_b_email"],
            "password": "StrongPassword123!",
            "full_name": "Attacker",
            "team_id": ato_setup["team_id"],
            "invitation_token": ato_setup["tok_b"]
        })
        assert res.status_code == 400
        assert "already exists" in res.json()["detail"].lower()
        
        async with AsyncSessionLocal() as db:
            user_res = await db.execute(select(User).where(User.student_id == ato_setup["std_b_id"]))
            users = user_res.scalars().all()
            assert len(users) == 1, "ATO Bypass: A second user account was created claiming Target B"


@pytest.mark.asyncio
async def test_legitimate_registration_and_token_burn(ato_setup):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/auth/register", json={
            "email": ato_setup["std_a_email"],
            "password": "StrongPassword123!",
            "full_name": "Target A",
            "team_id": ato_setup["team_id"],
            "invitation_token": ato_setup["tok_a"]
        })
        assert res.status_code == 201
        
        async with AsyncSessionLocal() as db:
            user_res = await db.execute(select(User).where(User.email == ato_setup["std_a_email"]))
            new_user = user_res.scalar_one()
            assert new_user.student_id == ato_setup["std_a_id"]
            
            inv_res = await db.execute(select(StudentInvitation).where(StudentInvitation.id == "inv_ato_a"))
            inv = inv_res.scalar_one()
            assert inv.is_used is True
            assert inv.used_by_user_id == new_user.id
