"""
Unit & Security Isolation Tests for Per-HR WhatsApp Chat Window (via OpenWA).
Verifies:
1. Server-side isolation: HR Member cannot read or send messages to unassigned members (HTTP 403).
2. Webhook ingestion: incoming messages resolve phone number -> student -> assigned HR.
3. Outgoing message dispatch, reaction, and edit endpoints.
4. Option A reassignment: chat history transfers to newly assigned HR member, old HR member loses access.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select, or_

from app.main import app
from app.core.database import Base, get_db
from app.models.entities import Student, User, WhatsAppChatMessage
from app.seed.seed_data import seed_all
from app.providers.messaging_provider import MessageDeliveryResult


@pytest.fixture
async def test_db_session():
    """In-memory SQLite database seeded with core data."""
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
async def test_hr_member_thread_scoping(client, test_db_session):
    """Verifies that an HR Member only sees threads for students assigned to them."""
    hr_token = await get_token(client, "hr.member@studentops.org", "hrmember123")
    headers = {"Authorization": f"Bearer {hr_token}"}

    res = await client.get("/api/whatsapp/threads", headers=headers)
    assert res.status_code == 200
    threads = res.json()
    assert len(threads) > 0

    # Every returned student must have assigned_hr_id == usr_hr_member
    for t in threads:
        assert t["assigned_hr_id"] == "usr_hr_member"


@pytest.mark.asyncio
async def test_server_side_access_isolation_blocked(client, test_db_session):
    """
    Hard Security Boundary:
    HR Member A attempts to access or message a student NOT assigned to them.
    Must return HTTP 403 Forbidden.
    """
    hr_token = await get_token(client, "hr.member@studentops.org", "hrmember123")
    headers = {"Authorization": f"Bearer {hr_token}"}

    # Find or create a student that is NOT assigned to usr_hr_member
    st_res = await test_db_session.execute(
        select(Student).where(
            or_(Student.assigned_hr_id != "usr_hr_member", Student.assigned_hr_id.is_(None))
        )
    )
    unassigned_student = st_res.scalars().first()
    assert unassigned_student is not None

    # 1. Attempt to fetch messages for unassigned student
    res_get = await client.get(f"/api/whatsapp/threads/{unassigned_student.id}/messages", headers=headers)
    assert res_get.status_code == 403
    assert "not assigned" in res_get.json()["detail"].lower()

    # 2. Attempt to send message to unassigned student
    res_post = await client.post(
        f"/api/whatsapp/threads/{unassigned_student.id}/messages",
        headers=headers,
        json={"content": "Malicious attempt to message unassigned student"}
    )
    assert res_post.status_code == 403
    assert "not assigned" in res_post.json()["detail"].lower()


@pytest.mark.asyncio
async def test_hr_member_can_send_message_to_assigned_student(client, test_db_session):
    """Assigned HR Member sends message to assigned student successfully."""
    from datetime import datetime, timezone
    hr_token = await get_token(client, "hr.member@studentops.org", "hrmember123")
    headers = {"Authorization": f"Bearer {hr_token}"}

    # std_ziad is assigned to usr_hr_member
    with patch("app.providers.openwa_provider.OpenWAProvider.send_message", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = MessageDeliveryResult(
            success=True,
            message_id="msg_test_owa_123",
            recipient_phone="201012345678",
            channel="WHATSAPP_OFFICIAL",
            delivered_at=datetime.now(timezone.utc),
        )

        res = await client.post(
            "/api/whatsapp/threads/std_ziad/messages",
            headers=headers,
            json={"content": "Hello Ziad, please update us on your task status."}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["content"] == "Hello Ziad, please update us on your task status."
        assert data["status"] == "sent"
        assert data["openwa_message_id"] == "msg_test_owa_123"
        assert data["student_id"] == "std_ziad"


@pytest.mark.asyncio
async def test_openwa_webhook_incoming_message_resolution(client, test_db_session):
    """
    Webhook receives incoming message:
    1. Resolves sender's phone number -> Student (std_ziad).
    2. Resolves Student -> assigned HR Member (usr_hr_member).
    3. Persists record in DB.
    """
    payload = {
        "event": "onMessage",
        "data": {
            "id": "openwa_incoming_999",
            "from": "201012345678@c.us",
            "body": "Hello HR, I have submitted the assignment.",
            "type": "chat",
        }
    }

    res = await client.post("/api/whatsapp/webhook", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["student_id"] == "std_ziad"

    # Verify message in database
    db_res = await test_db_session.execute(
        select(WhatsAppChatMessage).where(WhatsAppChatMessage.openwa_message_id == "openwa_incoming_999")
    )
    saved_msg = db_res.scalar_one_or_none()
    assert saved_msg is not None
    assert saved_msg.sender_type == "STUDENT"
    assert saved_msg.assigned_hr_id == "usr_hr_member"
    assert saved_msg.content == "Hello HR, I have submitted the assignment."


@pytest.mark.asyncio
async def test_openwa_webhook_ack_receipt(client, test_db_session):
    """Webhook receives delivery and read receipts and updates message status."""
    # Seeded message cmsg_seed_003 has openwa_message_id = true_201012345678@c.us_SEED03
    ack_payload = {
        "event": "onAck",
        "data": {
            "id": "true_201012345678@c.us_SEED03",
            "ack": 3,  # read receipt
        }
    }

    res = await client.post("/api/whatsapp/webhook", json=ack_payload)
    assert res.status_code == 200
    assert res.json()["status"] == "ack_updated"

    # Verify updated in DB
    db_res = await test_db_session.execute(
        select(WhatsAppChatMessage).where(WhatsAppChatMessage.id == "cmsg_seed_003")
    )
    msg = db_res.scalar_one_or_none()
    assert msg is not None
    assert msg.ack_status == 3
    assert msg.status == "read"


@pytest.mark.asyncio
async def test_reaction_and_edit_message(client, test_db_session):
    """Verifies adding a reaction and editing an outgoing message."""
    hr_token = await get_token(client, "hr.member@studentops.org", "hrmember123")
    headers = {"Authorization": f"Bearer {hr_token}"}

    # Add reaction to cmsg_seed_001
    with patch("app.providers.openwa_provider.OpenWAProvider.send_reaction", new_callable=AsyncMock) as mock_react:
        mock_react.return_value = True
        res_react = await client.post(
            "/api/whatsapp/threads/std_ziad/messages/cmsg_seed_001/reaction",
            headers=headers,
            json={"reaction": "❤️"}
        )
        assert res_react.status_code == 200
        assert any(r["emoji"] == "❤️" for r in res_react.json()["reactions"])

    # Edit cmsg_seed_001
    with patch("app.providers.openwa_provider.OpenWAProvider.edit_message", new_callable=AsyncMock) as mock_edit:
        mock_edit.return_value = True
        res_edit = await client.put(
            "/api/whatsapp/threads/std_ziad/messages/cmsg_seed_001",
            headers=headers,
            json={"content": "Updated follow-up message content"}
        )
        assert res_edit.status_code == 200
        assert res_edit.json()["content"] == "Updated follow-up message content"
        assert res_edit.json()["is_edited"] is True


@pytest.mark.asyncio
async def test_option_a_reassignment_history_transfer(client, test_db_session):
    """
    Verifies Option A:
    When Committee HR Leader reassigns std_ziad to another HR Member (usr_ali_lead or newly created HR),
    the new HR Member sees the complete chat history, and the previous HR Member loses access.
    """
    leader_token = await get_token(client, "hr.leader@studentops.org", "leader123")
    leader_headers = {"Authorization": f"Bearer {leader_token}"}

    # Create second HR member account in same committee
    new_hr = User(
        id="usr_hr_member_2",
        email="hr.member2@studentops.org",
        hashed_password="...",
        full_name="Second HR Member",
        role="committee_hr_member",
        team_id="team_tech",
        is_active=True,
    )
    test_db_session.add(new_hr)
    await test_db_session.commit()

    # HR Leader reassigns std_ziad from usr_hr_member to usr_hr_member_2
    assign_res = await client.post(
        "/api/students/assign-cohort",
        headers=leader_headers,
        json={"student_ids": ["std_ziad"], "hr_member_id": "usr_hr_member_2"}
    )
    assert assign_res.status_code == 200

    # 1. Previous HR member (usr_hr_member) can no longer access std_ziad
    old_hr_token = await get_token(client, "hr.member@studentops.org", "hrmember123")
    old_hr_headers = {"Authorization": f"Bearer {old_hr_token}"}
    res_old = await client.get("/api/whatsapp/threads/std_ziad/messages", headers=old_hr_headers)
    assert res_old.status_code == 403

    # 2. Authenticate as new HR member usr_hr_member_2
    from app.core.security import create_access_token
    token_new = create_access_token({"sub": "usr_hr_member_2", "role": "committee_hr_member"})
    new_headers = {"Authorization": f"Bearer {token_new}"}

    # New HR member fetches messages and receives full history (Option A)
    res_new = await client.get("/api/whatsapp/threads/std_ziad/messages", headers=new_headers)
    assert res_new.status_code == 200
    messages = res_new.json()
    assert len(messages) >= 3  # All seed messages transferred
