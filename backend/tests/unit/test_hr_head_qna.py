"""
Unit tests verifying HR Head (region_hr_head) access to Committee Q&A.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from app.main import app
from app.core.database import Base, get_db
from app.models.entities import User, Team, Student, MemberQuestion
from app.core.security import create_access_token, get_password_hash


@pytest.fixture
async def test_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        # Seed test data
        team = Team(id="team_media", name="Social Media Committee", code="MEDIA", description="Media")
        session.add(team)
        await session.flush()

        student = Student(
            id="stu_test_member",
            student_code="STU-001",
            full_name="Member Student",
            arabic_name="طالب عضو",
            email="member.std@ops.org",
            phone="+201000000010",
            team_id="team_media",
            status="ACTIVE",
        )
        session.add(student)
        await session.flush()

        # Users
        pw = get_password_hash("pass123")
        u_member = User(
            id="usr_member",
            email="member@ops.org",
            hashed_password=pw,
            full_name="Member User",
            role="committee_member",
            team_id="team_media",
            student_id="stu_test_member",
        )
        u_head = User(
            id="usr_comm_head",
            email="head@ops.org",
            hashed_password=pw,
            full_name="Committee Head",
            role="committee_head",
            team_id="team_media",
        )
        u_region_head = User(
            id="usr_region_head",
            email="region.head@ops.org",
            hashed_password=pw,
            full_name="Regional HR Head",
            role="region_hr_head",
            team_id=None,
        )
        u_hr_member = User(
            id="usr_hr_member",
            email="hrmember@ops.org",
            hashed_password=pw,
            full_name="HR Member",
            role="committee_hr_member",
            team_id="team_media",
        )
        session.add_all([u_member, u_head, u_region_head, u_hr_member])

        # A question asked by student
        q1 = MemberQuestion(
            id="q_test_1",
            student_id="stu_test_member",
            team_id="team_media",
            title="Video Format Question",
            content="What aspect ratio should we use for TikTok reels?",
            status="OPEN",
        )
        session.add(q1)
        await session.commit()
        yield session

    await engine.dispose()


@pytest.fixture
async def client(test_db):
    async def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_region_hr_head_can_list_and_answer_questions(client):
    token = create_access_token({"sub": "usr_region_head", "type": "access"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. HR Head lists questions
    res = await client.get("/api/questions", headers=headers)
    assert res.status_code == 200
    questions = res.json()
    assert len(questions) >= 1
    assert questions[0]["id"] == "q_test_1"
    assert questions[0]["status"] == "OPEN"

    # 2. HR Head answers question
    answer_payload = {"answer": "Use 9:16 vertical video format with 1080x1920 resolution."}
    ans_res = await client.post("/api/questions/q_test_1/answer", json=answer_payload, headers=headers)
    assert ans_res.status_code == 200
    data = ans_res.json()
    assert data["status"] == "ANSWERED"
    assert data["answer"] == answer_payload["answer"]
    assert data["answered_by_name"] == "Regional HR Head"


@pytest.mark.asyncio
async def test_unauthorized_role_cannot_answer_questions(client):
    # HR Member does not have permission to answer
    hr_token = create_access_token({"sub": "usr_hr_member", "type": "access"})
    res = await client.post(
        "/api/questions/q_test_1/answer",
        json={"answer": "Unauthorized answer attempt"},
        headers={"Authorization": f"Bearer {hr_token}"}
    )
    assert res.status_code == 403
