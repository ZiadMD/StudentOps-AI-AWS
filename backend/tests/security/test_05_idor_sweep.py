import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_idor_students(setup_data, auth_headers):
    headers = auth_headers(setup_data["hr_a"], "committee_hr_member", setup_data["team_a"])
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # GET Student B (exists, should be 403 or 404 because out of scope)
        res = await client.get(f"/api/students/{setup_data['st_b']}", headers=headers)
        assert res.status_code in [403, 404]

        # PATCH Student B phone
        res_phone = await client.patch(f"/api/students/{setup_data['st_b']}/phone", json={"phone": "+201000000000"}, headers=headers)
        assert res_phone.status_code in [403, 404]

@pytest.mark.asyncio
async def test_idor_tasks(setup_data, auth_headers):
    headers = auth_headers(setup_data["hr_a"], "committee_hr_member", setup_data["team_a"])
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # GET Task B
        res = await client.get(f"/api/tasks/{setup_data['tk_b']}", headers=headers)
        assert res.status_code in [403, 404]
        
        # GET Task B submissions
        res_subs = await client.get(f"/api/tasks/{setup_data['tk_b']}/submissions", headers=headers)
        assert res_subs.status_code in [403, 404]

@pytest.mark.asyncio
async def test_idor_attendance(setup_data, auth_headers):
    headers = auth_headers(setup_data["hr_a"], "committee_hr_member", setup_data["team_a"])
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # HR A tries to reprocess Team B's meeting
        res = await client.post(f"/api/attendance/meetings/{setup_data['mt_b']}/process", headers=headers)
        assert res.status_code in [403, 404]

@pytest.mark.asyncio
async def test_idor_submissions(setup_data, auth_headers):
    headers = auth_headers(setup_data["hr_a"], "committee_hr_member", setup_data["team_a"])
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # GET Submission B
        res = await client.get(f"/api/tasks/submissions/{setup_data['sub_b']}", headers=headers)
        assert res.status_code in [403, 404]

        # Review Submission B
        res_review = await client.put(f"/api/tasks/submissions/{setup_data['sub_b']}/review", json={"status": "APPROVED", "score": 10}, headers=headers)
        assert res_review.status_code in [403, 404]
