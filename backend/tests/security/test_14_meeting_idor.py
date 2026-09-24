import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_meeting_list_fail_closed(setup_data, auth_headers):
    """
    Test that committee roles with a missing team_id fail closed (return empty list)
    rather than failing open and viewing all meetings in the database.
    """
    headers = auth_headers(setup_data["head_unassigned"], "committee_head", None)
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/attendance/meetings", headers=headers)
        assert res.status_code == 200
        assert res.json() == []


@pytest.mark.asyncio
async def test_meeting_attendance_fail_closed(setup_data, auth_headers):
    """
    Test that retrieving attendance records for a specific meeting also enforces fail-closed
    if the user is missing a team_id, and cross-committee checks work.
    """
    headers_unassigned = auth_headers(setup_data["head_unassigned"], "committee_head", None)
    headers_a = auth_headers(setup_data["head_a"], "committee_head", setup_data["team_a"])
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Unassigned head should see empty attendance for Team A's meeting
        res = await client.get(f"/api/attendance/meetings/{setup_data['mt_a']}", headers=headers_unassigned)
        assert res.status_code == 200
        assert res.json()["attendance"] == []
        
        # 2. Team A head should see Team A's records
        res_a = await client.get(f"/api/attendance/meetings/{setup_data['mt_a']}", headers=headers_a)
        assert res_a.status_code == 200
        assert len(res_a.json()["attendance"]) > 0
        
        # 3. Team A head should see empty attendance for Team B's meeting (cross-committee denial)
        res_b = await client.get(f"/api/attendance/meetings/{setup_data['mt_b']}", headers=headers_a)
        assert res_b.status_code == 200
        assert res_b.json()["attendance"] == []
