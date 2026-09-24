"""
Unit tests verifying Reminder scoping and authorization for Committee Members and Leadership.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.core.database import Base, get_db
from app.models.entities import User, Team, Student, ReminderLog
from app.core.security import create_access_token, get_password_hash


@pytest.fixture
async def test_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        # Seed two teams
        team_a = Team(id="team_media", name="Social Media Committee", code="MEDIA", description="Media")
        team_b = Team(id="team_tech", name="Tech Committee", code="TECH", description="Tech")
        session.add_all([team_a, team_b])
        await session.flush()

        # Students
        std_a1 = Student(
            id="stu_a1", student_code="MEDIA-01", full_name="Ali Media", arabic_name="علي ميديا",
            email="ali@ops.org", phone="+201000000001", team_id="team_media", status="ACTIVE"
        )
        std_a2 = Student(
            id="stu_a2", student_code="MEDIA-02", full_name="Sara Media", arabic_name="سارة ميديا",
            email="sara@ops.org", phone="+201000000002", team_id="team_media", status="ACTIVE"
        )
        std_b1 = Student(
            id="stu_b1", student_code="TECH-01", full_name="Omar Tech", arabic_name="عمر تك",
            email="omar@ops.org", phone="+201000000003", team_id="team_tech", status="ACTIVE"
        )
        session.add_all([std_a1, std_a2, std_b1])
        await session.flush()

        pw = get_password_hash("pass123")
        # User 1: Member of team A
        u_member_a1 = User(
            id="usr_member_a1", email="ali@ops.org", hashed_password=pw,
            full_name="Ali Media", role="committee_member", team_id="team_media", student_id="stu_a1"
        )
        # User 2: Member of team A
        u_member_a2 = User(
            id="usr_member_a2", email="sara@ops.org", hashed_password=pw,
            full_name="Sara Media", role="committee_member", team_id="team_media", student_id="stu_a2"
        )
        # User 3: Unlinked member (no student_id)
        u_unlinked = User(
            id="usr_unlinked", email="unlinked@ops.org", hashed_password=pw,
            full_name="Unlinked User", role="committee_member", team_id="team_media", student_id=None
        )
        # User 4: Committee Head for team A
        u_head_a = User(
            id="usr_head_a", email="heada@ops.org", hashed_password=pw,
            full_name="Head A", role="committee_head", team_id="team_media"
        )
        # User 5: Regional HR Head
        u_region_head = User(
            id="usr_region_head", email="region@ops.org", hashed_password=pw,
            full_name="Region Head", role="region_hr_head", team_id=None
        )
        session.add_all([u_member_a1, u_member_a2, u_unlinked, u_head_a, u_region_head])

        # Seed ReminderLogs
        rem1 = ReminderLog(
            id="rem_1_a1", recipient_id="stu_a1", recipient_name="Ali Media", recipient_phone="+201000000001",
            channel="WHATSAPP", message_content="Ali, don't forget meeting tomorrow at 8pm", status="SENT",
            trigger_source="AUTOMATION_ATTENDANCE_meet1"
        )
        rem2 = ReminderLog(
            id="rem_2_a2", recipient_id="stu_a2", recipient_name="Sara Media", recipient_phone="+201000000002",
            channel="WHATSAPP", message_content="Sara, deadline approaching for Reel task", status="SENT",
            trigger_source="AUTOMATION_TASK_PRE_task1"
        )
        rem3 = ReminderLog(
            id="rem_3_b1", recipient_id="stu_b1", recipient_name="Omar Tech", recipient_phone="+201000000003",
            channel="WHATSAPP", message_content="Omar, Python backend workshop starting soon", status="SENT",
            trigger_source="AUTOMATION_ATTENDANCE_meet2"
        )
        session.add_all([rem1, rem2, rem3])
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
async def test_committee_member_can_only_see_own_reminders(client):
    token = create_access_token({"sub": "usr_member_a1", "type": "access"})
    headers = {"Authorization": f"Bearer {token}"}

    # Member A1 calls /api/automation/logs (or /reminders)
    res = await client.get("/api/automation/reminders", headers=headers)
    assert res.status_code == 200
    reminders = res.json()
    assert len(reminders) == 1
    assert reminders[0]["id"] == "rem_1_a1"
    assert reminders[0]["recipient_id"] == "stu_a1"
    assert "Ali, don't forget meeting" in reminders[0]["message_content"]
    assert reminders[0]["title"] == "Meeting Attendance Reminder"


@pytest.mark.asyncio
async def test_member_cannot_access_other_student_reminder_by_id(client):
    token = create_access_token({"sub": "usr_member_a1", "type": "access"})
    headers = {"Authorization": f"Bearer {token}"}

    # Accessing own reminder: 200
    own_res = await client.get("/api/automation/reminders/rem_1_a1", headers=headers)
    assert own_res.status_code == 200

    # Attempting to access Sara's reminder: 403 Forbidden
    other_res = await client.get("/api/automation/reminders/rem_2_a2", headers=headers)
    assert other_res.status_code == 403
    assert "only view your own reminders" in other_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_unlinked_member_fails_closed(client):
    token = create_access_token({"sub": "usr_unlinked", "type": "access"})
    res = await client.get("/api/automation/reminders", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.asyncio
async def test_committee_head_scopes_to_own_committee(client):
    token = create_access_token({"sub": "usr_head_a", "type": "access"})
    res = await client.get("/api/automation/reminders", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    reminders = res.json()
    # Should see rem_1_a1 and rem_2_a2 from team_media, but NOT rem_3_b1 from team_tech
    recipients = {r["recipient_id"] for r in reminders}
    assert "stu_a1" in recipients
    assert "stu_a2" in recipients
    assert "stu_b1" not in recipients


@pytest.mark.asyncio
async def test_region_hr_head_has_organization_wide_visibility(client):
    token = create_access_token({"sub": "usr_region_head", "type": "access"})
    res = await client.get("/api/automation/reminders", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    reminders = res.json()
    assert len(reminders) == 3
