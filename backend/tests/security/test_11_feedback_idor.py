import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_feedback_status_idor_protection(setup_data, auth_headers):
    """
    Test that HR Leader can only action feedback from their own committee.
    Cross-committee valid-ID access must return 403.
    """
    # HR Leader A belongs to Team A
    headers = auth_headers(setup_data["leader_a"], "committee_hr_leader", setup_data["team_a"])
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Attempt to patch Team B's feedback
        payload = {"status": "REVIEWED", "notes": "Hacking attempt"}
        res = await client.patch(f"/api/feedback/{setup_data['fb_b']}/status", json=payload, headers=headers)
        
        assert res.status_code == 403
        assert "another committee" in res.json()["detail"].lower()
        
        # Valid access for Team A's feedback
        res_valid = await client.patch(f"/api/feedback/{setup_data['fb_a']}/status", json={"status": "REVIEWED", "notes": "Valid action"}, headers=headers)
        assert res_valid.status_code == 200
        assert res_valid.json()["status"] == "REVIEWED"

@pytest.mark.asyncio
async def test_hr_admin_feedback_oversight_denied(setup_data, auth_headers):
    """
    HR Head/Admin is oversight-only and cannot action operational feedback (403).
    """
    headers = auth_headers(setup_data["admin"], "hr_admin")
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {"status": "REVIEWED", "notes": "Admin attempt"}
        res = await client.patch(f"/api/feedback/{setup_data['fb_a']}/status", json=payload, headers=headers)
        assert res.status_code == 403
