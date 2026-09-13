from datetime import timedelta

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.entities import MemberFollowupStatus, utcnow


@pytest.mark.asyncio
async def test_get_escalations_does_not_mutate_followup_state(setup_data, auth_headers):
    async with AsyncSessionLocal() as db:
        db.add(MemberFollowupStatus(
            id="followup_read_only",
            student_id=setup_data["st_a"],
            hr_member_id=setup_data["hr_a"],
            flagged_reason="ABSENTEEISM",
            flagged_at=utcnow() - timedelta(days=4),
            status="PENDING",
            is_escalated=False,
        ))
        await db.commit()

    headers = auth_headers(setup_data["leader_a"], "committee_hr_leader", setup_data["team_a"])
    async with AsyncSessionLocal() as db:
        before = await db.execute(
            select(MemberFollowupStatus.is_escalated).where(
                MemberFollowupStatus.id == "followup_read_only"
            )
        )
        before_value = before.scalar_one()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/whatsapp/escalations", headers=headers)

    assert response.status_code == 200
    async with AsyncSessionLocal() as db:
        after = await db.execute(
            select(MemberFollowupStatus.is_escalated).where(
                MemberFollowupStatus.id == "followup_read_only"
            )
        )
        assert after.scalar_one() == before_value