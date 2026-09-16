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
async def test_openwa_webhook_incoming_message_resolution(client, test_db_session, monkeypatch):
    """
    Webhook receives incoming message:
    1. Resolves sender's phone number -> Student (std_ziad).
    2. Resolves Student -> assigned HR Member (usr_hr_member).
    3. Persists record in DB.
    """
    from app.core.config import settings
    monkeypatch.setattr(settings, "OPENWA_WEBHOOK_SECRET", "test-secret")

    payload = {
        "event": "onMessage",
        "data": {
            "id": "openwa_incoming_999",
            "from": "201012345678@c.us",
            "body": "Hello HR, I have submitted the assignment.",
            "type": "chat",
        }
    }

    res = await client.post(
        "/api/whatsapp/webhook",
        headers={"X-Webhook-Secret": "test-secret"},
        json=payload,
    )
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
async def test_openwa_webhook_ack_receipt(client, test_db_session, monkeypatch):
    """Webhook receives delivery and read receipts and updates message status."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "OPENWA_WEBHOOK_SECRET", "test-secret")

    # Seeded message cmsg_seed_003 has openwa_message_id = true_201012345678@c.us_SEED03
    ack_payload = {
        "event": "onAck",
        "data": {
            "id": "true_201012345678@c.us_SEED03",
            "ack": 3,  # read receipt
        }
    }

    res = await client.post(
        "/api/whatsapp/webhook",
        headers={"X-Webhook-Secret": "test-secret"},
        json=ack_payload,
    )
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
    leader_token = await get_token(client, "region.head@studentops.org", "head123")
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


@pytest.mark.asyncio
async def test_webhook_authentication_and_secret_enforcement(client, monkeypatch):
    """
    SECURITY TEST (§1.2): Enforce that webhook requires valid shared secret when configured.
    """
    from app.core.config import settings
    monkeypatch.setattr(settings, "OPENWA_WEBHOOK_SECRET", "super-secret-openwa-token")

    payload = {
        "event": "onMessage",
        "data": {
            "id": "openwa_auth_test_1",
            "from": "201011112222",
            "body": "Hello",
            "type": "text"
        }
    }

    # 1. Missing secret header
    res_missing = await client.post("/api/whatsapp/webhook", json=payload)
    assert res_missing.status_code == 401

    # 2. Invalid secret header
    res_invalid = await client.post(
        "/api/whatsapp/webhook",
        headers={"X-Webhook-Secret": "wrong-secret"},
        json=payload
    )
    assert res_invalid.status_code == 403

    # 3. Valid secret header
    res_valid = await client.post(
        "/api/whatsapp/webhook",
        headers={"X-Webhook-Secret": "super-secret-openwa-token"},
        json=payload
    )
    assert res_valid.status_code == 200


@pytest.mark.asyncio
async def test_webhook_media_url_sanitization(client, monkeypatch):
    """
    SECURITY TEST (§1.2): Verify that dangerous media URLs (javascript: schemes) are sanitized.
    """
    from app.services.whatsapp_service import sanitize_media_url
    assert sanitize_media_url("javascript:alert('XSS')") is None
    assert sanitize_media_url("vbscript:msgbox('XSS')") is None
    assert sanitize_media_url("file:///etc/passwd") is None
    assert sanitize_media_url("https://example.com/safe.jpg") == "https://example.com/safe.jpg"
    assert sanitize_media_url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==") == "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="


@pytest.mark.asyncio
async def test_webhook_external_hr_device_message_resolution(client, test_db_session, monkeypatch):
    """
    Verifies that when an HR coordinator sends a message from a physical phone or WhatsApp Web,
    OpenWA sends fromMe: true and the webhook resolves the student from data.to / data.chatId,
    attributing sender_type='HR'.
    """
    from app.core.config import settings
    monkeypatch.setattr(settings, "OPENWA_WEBHOOK_SECRET", "test-secret")

    payload = {
        "event": "onAnyMessage",
        "data": {
            "id": "true_201012345678@c.us_EXT_DEV_01",
            "from": "201000000000@c.us",
            "to": "201012345678@c.us",
            "fromMe": True,
            "chatId": "201012345678@c.us",
            "body": "Follow-up sent directly from physical device.",
            "type": "chat",
            "timestamp": 1710000000,
            "ack": 1,
        }
    }

    res = await client.post(
        "/api/whatsapp/webhook",
        headers={"X-Webhook-Secret": "test-secret"},
        json=payload,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["student_id"] == "std_ziad"
    assert data["sender_type"] == "HR"

    # Verify message in database
    db_res = await test_db_session.execute(
        select(WhatsAppChatMessage).where(WhatsAppChatMessage.openwa_message_id == "true_201012345678@c.us_EXT_DEV_01")
    )
    saved_msg = db_res.scalar_one_or_none()
    assert saved_msg is not None
    assert saved_msg.sender_type == "HR"
    assert saved_msg.student_id == "std_ziad"
    assert saved_msg.assigned_hr_id == "usr_hr_member"
    assert saved_msg.recipient_phone == "201012345678"
    assert saved_msg.content == "Follow-up sent directly from physical device."

    # Duplicate submission of the same webhook is safely skipped
    res_dup = await client.post(
        "/api/whatsapp/webhook",
        headers={"X-Webhook-Secret": "test-secret"},
        json=payload,
    )
    assert res_dup.status_code == 200
    assert res_dup.json()["status"] == "duplicate_skipped"


@pytest.mark.asyncio
async def test_webhook_group_message_ignored(client, test_db_session, monkeypatch):
    """Verifies that group messages (@g.us) are dropped gracefully without errors."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "OPENWA_WEBHOOK_SECRET", "test-secret")

    payload = {
        "event": "onMessage",
        "data": {
            "id": "group_msg_123",
            "from": "120363024828192038@g.us",
            "chatId": "120363024828192038@g.us",
            "body": "Broadcast in WhatsApp group",
            "type": "chat",
            "isGroupMsg": True,
        }
    }

    res = await client.post(
        "/api/whatsapp/webhook",
        headers={"X-Webhook-Secret": "test-secret"},
        json=payload,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "ignored"


@pytest.mark.asyncio
async def test_webhook_ambiguous_phone_fails_closed(client, test_db_session, monkeypatch):
    """Verifies that if multiple students share an identical normalized phone, webhook fails closed safely."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "OPENWA_WEBHOOK_SECRET", "test-secret")

    # Add duplicate student with same phone as std_ziad
    dup_student = Student(
        id="std_duplicate_phone",
        student_code="CS-9999",
        full_name="Duplicate Ziad",
        arabic_name="زياد مكرر",
        email="dup.ziad@studentops.org",
        phone="01012345678",  # Identical Egyptian mobile
        team_id="team_tech",
        assigned_hr_id="usr_hr_member",
    )
    test_db_session.add(dup_student)
    await test_db_session.commit()

    payload = {
        "event": "onMessage",
        "data": {
            "id": "openwa_ambiguous_msg_1",
            "from": "201012345678@c.us",
            "body": "Hello from ambiguous number",
            "type": "chat",
        }
    }

    res = await client.post(
        "/api/whatsapp/webhook",
        headers={"X-Webhook-Secret": "test-secret"},
        json=payload,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "unregistered_sender"


@pytest.mark.asyncio
async def test_sync_chat_messages_endpoint_and_deduplication(client, test_db_session):
    """
    Verifies on-demand sync via POST /api/whatsapp/threads/{student_id}/sync:
    - Calls OpenWA get_chat_messages
    - Reconciles and upserts new messages into DB with openwa_message_id deduplication
    - Updates ACK/status on existing messages
    """
    hr_token = await get_token(client, "hr.member@studentops.org", "hrmember123")
    headers = {"Authorization": f"Bearer {hr_token}"}

    mock_openwa_messages = [
        {
            "id": "sync_owa_inbound_001",
            "from": "201012345678@c.us",
            "to": "201000000000@c.us",
            "fromMe": False,
            "body": "Synced reply from student on WhatsApp",
            "type": "chat",
            "timestamp": 1710000000,
            "ack": 2,
        },
        {
            "id": "sync_owa_outbound_002",
            "from": "201000000000@c.us",
            "to": "201012345678@c.us",
            "fromMe": True,
            "body": "Synced reply from HR on physical phone",
            "type": "chat",
            "timestamp": 1710000060,
            "ack": 3,
        },
    ]

    with patch("app.providers.openwa_provider.OpenWAProvider.get_chat_messages", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_openwa_messages

        # 1. First sync: should insert 2 new messages
        res = await client.post("/api/whatsapp/threads/std_ziad/sync?limit=50", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["student_id"] == "std_ziad"
        assert data["synced_count"] == 2
        assert data["new_messages_count"] == 2
        assert data["updated_messages_count"] == 0
        assert any(m["openwa_message_id"] == "sync_owa_inbound_001" for m in data["messages"])
        assert any(m["openwa_message_id"] == "sync_owa_outbound_002" for m in data["messages"])

        # 2. Second sync with same messages: should insert 0 new messages
        res_repeat = await client.post("/api/whatsapp/threads/std_ziad/sync?limit=50", headers=headers)
        assert res_repeat.status_code == 200
        data_repeat = res_repeat.json()
        assert data_repeat["new_messages_count"] == 0
        assert data_repeat["synced_count"] == 2


@pytest.mark.asyncio
async def test_sync_chat_messages_scoping_forbidden(client, test_db_session):
    """Verifies that an HR Member cannot sync chat history for an unassigned member (HTTP 403)."""
    hr_token = await get_token(client, "hr.member@studentops.org", "hrmember123")
    headers = {"Authorization": f"Bearer {hr_token}"}

    # Find unassigned student
    st_res = await test_db_session.execute(
        select(Student).where(
            or_(Student.assigned_hr_id != "usr_hr_member", Student.assigned_hr_id.is_(None))
        )
    )
    unassigned_student = st_res.scalars().first()
    assert unassigned_student is not None

    res = await client.post(f"/api/whatsapp/threads/{unassigned_student.id}/sync", headers=headers)
    assert res.status_code == 403
    assert "not assigned" in res.json()["detail"].lower()


