from datetime import timedelta

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.entities import AttendanceRecord, Meeting, utcnow


@pytest.mark.asyncio
async def test_dashboard_uses_current_relevant_meeting(setup_data, auth_headers):
    now = utcnow()
    async with AsyncSessionLocal() as db:
        meeting_a = (await db.execute(select(Meeting).where(Meeting.id == setup_data["mt_a"]))).scalar_one()
        meeting_b = (await db.execute(select(Meeting).where(Meeting.id == setup_data["mt_b"]))).scalar_one()
        meeting_a.start_time = now - timedelta(hours=2)
        meeting_a.end_time = now - timedelta(hours=1)
        meeting_b.start_time = now - timedelta(minutes=10)
        meeting_b.end_time = now + timedelta(minutes=50)
        db.add(AttendanceRecord(
            id="att_b",
            meeting_id=meeting_b.id,
            student_id=setup_data["st_b"],
            status="LATE",
        ))
        await db.commit()

    headers = auth_headers(setup_data["hr_b"], "committee_hr_member", setup_data["team_b"])
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/dashboard/stats", headers=headers)

    assert response.status_code == 200
    assert response.json()["late_today"] == 1