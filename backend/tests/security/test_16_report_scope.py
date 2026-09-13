import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.mark.asyncio
async def test_committee_report_summary_is_limited_to_calling_team(setup_data, auth_headers):
    headers = auth_headers(setup_data["leader_a"], "committee_hr_leader", setup_data["team_a"])

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/reports/committee/summary", headers=headers)

    assert response.status_code == 200
    summary = response.json()
    assert summary["team_id"] == setup_data["team_a"]
    assert summary["total_members"] == 1
    assert summary["total_sessions"] == 1
    assert summary["task_count"] == 1
    assert summary["feedback_submissions_count"] == 1