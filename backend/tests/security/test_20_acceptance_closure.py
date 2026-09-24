from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, text

from app.main import app
from app.core.database import AsyncSessionLocal
from app.core.time import as_utc
from app.models.entities import Meeting, MeetingAssignment, ReminderLog, Student, Team
from app.models.entities import AgentActionAudit
from app.services.whatsapp_service import WhatsAppService
from app.services.automation_service import AutomationEngine


@pytest.mark.asyncio
async def test_non_utc_conversion_preserves_two_minute_instant():
    local_zone = timezone(timedelta(hours=2))
    first = datetime(2026, 9, 13, 12, 0, tzinfo=local_zone)
    second = datetime(2026, 9, 13, 12, 2, tzinfo=local_zone)
    assert as_utc(second) - as_utc(first) == timedelta(minutes=2)


@pytest.mark.asyncio
async def test_pre_meeting_reminder_is_pending_and_never_sends(setup_data):
    meeting_id = "meeting_pre_acceptance"
    async with AsyncSessionLocal() as db:
        db.add(Meeting(
            id=meeting_id,
            meeting_code="pre_acceptance",
            title="Acceptance Meeting",
            start_time=datetime.now(timezone.utc) + timedelta(hours=2),
            end_time=datetime.now(timezone.utc) + timedelta(hours=3),
            duration_minutes=60,
            team_id=setup_data["team_a"],
            status="SCHEDULED",
        ))
        db.add(MeetingAssignment(
            id="assignment_pre_acceptance",
            meeting_id=meeting_id,
            student_id=setup_data["st_a"],
        ))
        await db.commit()

        engine = AutomationEngine()
        engine.openwa.send_message = AsyncMock()
        result = await engine.run_pre_meeting_cycle(db)

        assert any(item["meeting_id"] == meeting_id for item in result)
        assert engine.openwa.send_message.await_count == 0
        reminder = await db.execute(
            select(ReminderLog).where(
                ReminderLog.trigger_source == f"AUTOMATION_PRE_MEETING_{meeting_id}"
            )
        )
        saved = reminder.scalar_one()
        assert saved.status == "PENDING_APPROVAL"
        assert saved.channel == "WHATSAPP_OFFICIAL"


@pytest.mark.asyncio
async def test_hr_a_and_hr_b_cannot_cross_access_chat_operations(setup_data, auth_headers):
    async with AsyncSessionLocal() as db:
        students = await db.execute(select(Student).where(Student.id.in_([setup_data["st_a"], setup_data["st_b"]])))
        student_a, student_b = sorted(students.scalars().all(), key=lambda student: student.id)
        student_a.assigned_hr_id = setup_data["hr_a"]
        student_b.assigned_hr_id = setup_data["hr_b"]
        await db.commit()

    headers_a = auth_headers(setup_data["hr_a"], "committee_hr_member", setup_data["team_a"])
    headers_b = auth_headers(setup_data["hr_b"], "committee_hr_member", setup_data["team_b"])
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        history_a = await client.get(f"/api/whatsapp/threads/{setup_data['st_b']}/messages", headers=headers_a)
        history_b = await client.get(f"/api/whatsapp/threads/{setup_data['st_a']}/messages", headers=headers_b)
        send_a = await client.post(
            f"/api/whatsapp/threads/{setup_data['st_b']}/messages",
            headers=headers_a,
            json={"content": "cross-team"},
        )
        send_b = await client.post(
            f"/api/whatsapp/threads/{setup_data['st_a']}/messages",
            headers=headers_b,
            json={"content": "cross-team"},
        )
        arbitrary_session = await client.get("/api/whatsapp/status?session_id=hr_b", headers=headers_a)

    assert history_a.status_code == 403
    assert history_b.status_code == 403
    assert send_a.status_code == 403
    assert send_b.status_code == 403
    assert arbitrary_session.status_code == 200
    assert arbitrary_session.json()["session_name"] != "hr_hr_b"


@pytest.mark.asyncio
async def test_openwa_status_and_qr_are_bound_to_authenticated_user(setup_data, auth_headers, monkeypatch):
    observed_sessions = []

    async def fake_status(provider):
        observed_sessions.append(provider.session_id_preference)
        return {"configured": True, "status": "DISCONNECTED", "session_name": provider.session_id_preference}

    async def fake_qr(provider):
        observed_sessions.append(provider.session_id_preference)
        return "qr-payload"

    with patch("app.providers.openwa_provider.OpenWAProvider.get_status", new=fake_status), \
         patch("app.providers.openwa_provider.OpenWAProvider.get_qr", new=fake_qr):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            headers_a = auth_headers(setup_data["hr_a"], "committee_hr_member", setup_data["team_a"])
            headers_b = auth_headers(setup_data["hr_b"], "committee_hr_member", setup_data["team_b"])
            status_a = await client.get("/api/whatsapp/status", headers=headers_a)
            qr_a = await client.get("/api/whatsapp/qr", headers=headers_a)
            status_b = await client.get("/api/whatsapp/status", headers=headers_b)
            qr_b = await client.get("/api/whatsapp/qr", headers=headers_b)

    assert status_a.status_code == 200
    assert qr_a.status_code == 200
    assert status_b.status_code == 200
    assert qr_b.status_code == 200
    assert observed_sessions == (["hr_hr_a"] * 3) + (["hr_hr_b"] * 3)
    assert "OPENWA_API_KEY" not in status_a.text
    assert "OPENWA_API_KEY" not in qr_a.text


@pytest.mark.asyncio
async def test_application_sqlite_fk_and_check_are_clean():
    async with AsyncSessionLocal() as db:
        pragma = await db.execute(text("PRAGMA foreign_keys"))
        violations = await db.execute(text("PRAGMA foreign_key_check"))
    assert pragma.scalar() == 1
    assert violations.all() == []


@pytest.mark.asyncio
async def test_unauthorized_hr_cannot_confirm_pending_whatsapp_action(setup_data, auth_headers):
    headers = auth_headers(setup_data["hr_b"], "committee_hr_member", setup_data["team_b"])
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/agent/confirm",
            headers=headers,
            json={"action_id": setup_data["action_id"], "confirmed": True},
        )

    assert response.status_code == 403
    async with AsyncSessionLocal() as db:
        audit = await db.execute(
            select(AgentActionAudit).where(AgentActionAudit.action_id == setup_data["action_id"])
        )
        assert audit.scalar_one().status == "PENDING_CONFIRMATION"


@pytest.mark.asyncio
async def test_manual_attendance_excuse_enforces_scope_and_persists(setup_data, auth_headers):
    valid_headers = auth_headers(setup_data["hr_a"], "committee_hr_member", setup_data["team_a"])
    other_team_headers = auth_headers(setup_data["hr_b"], "committee_hr_member", setup_data["team_b"])
    member_headers = auth_headers(setup_data["unlinked_match"], "member", None)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        valid = await client.put(
            f"/api/attendance/meetings/{setup_data['mt_a']}/records/{setup_data['st_a']}/status",
            headers=valid_headers,
            json={"status": "EXCUSED_ACCEPTED", "excuse_reason": "Verified", "excuse_status": "EXCUSED_ACCEPTED"},
        )
        cross_team = await client.put(
            f"/api/attendance/meetings/{setup_data['mt_a']}/records/{setup_data['st_a']}/status",
            headers=other_team_headers,
            json={"status": "PRESENT"},
        )
        unauthorized = await client.put(
            f"/api/attendance/meetings/{setup_data['mt_a']}/records/{setup_data['st_a']}/status",
            headers=member_headers,
            json={"status": "PRESENT"},
        )
        invalid = await client.put(
            f"/api/attendance/meetings/{setup_data['mt_a']}/records/no_such_student/status",
            headers=valid_headers,
            json={"status": "PRESENT"},
        )

    assert valid.status_code == 200
    assert valid.json()["excuse_status"] == "EXCUSED_ACCEPTED"
    assert cross_team.status_code == 403
    assert unauthorized.status_code == 403
    assert invalid.status_code == 404


@pytest.mark.asyncio
async def test_phone_matching_is_exact_and_ambiguous_matches_fail_closed(setup_data):
    async with AsyncSessionLocal() as db:
        db.add_all([
            Student(id="phone_exact_a", email="phone-a@test.com", full_name="Phone A", arabic_name="A", phone="+201012345678", team_id=setup_data["team_a"]),
            Student(id="phone_exact_b", email="phone-b@test.com", full_name="Phone B", arabic_name="B", phone="+202012345678", team_id=setup_data["team_b"]),
        ])
        await db.commit()
        exact = await WhatsAppService.handle_webhook_event(
            {"event": "onMessage", "data": {"id": "phone_exact_msg", "from": "201012345678@c.us", "body": "hello"}}, db
        )
        db.add(Student(id="phone_duplicate", email="phone-dup@test.com", full_name="Phone Duplicate", arabic_name="D", phone="01012345678", team_id=setup_data["team_a"]))
        await db.commit()
        ambiguous = await WhatsAppService.handle_webhook_event(
            {"event": "onMessage", "data": {"id": "phone_ambiguous_msg", "from": "201012345678@c.us", "body": "hello"}}, db
        )

    assert exact["student_id"] == "phone_exact_a"
    assert ambiguous["status"] == "unregistered_sender"
