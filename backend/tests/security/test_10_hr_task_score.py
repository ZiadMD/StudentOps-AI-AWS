import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_hr_member_can_read_permitted_score_metadata(setup_data, auth_headers):
    """
    HR Member must be able to read permitted numerical task score and score/status metadata
    within the correct committee.
    """
    headers = auth_headers(setup_data["hr_a"], "committee_hr_member", setup_data["team_a"])
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Fetch scores for a task in the same committee
        res = await client.get(f"/api/tasks/{setup_data['tk_a']}/scores", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        
        # 2. Fetch a specific submission score in the same committee
        res_sub = await client.get(f"/api/tasks/submissions/{setup_data['sub_a']}/score", headers=headers)
        assert res_sub.status_code == 200
        sub_data = res_sub.json()
        assert "score" in sub_data
        assert "status" in sub_data


@pytest.mark.asyncio
async def test_hr_member_cross_team_access_denied(setup_data, auth_headers):
    """
    HR Member must NOT be able to read scores or metadata for another committee.
    """
    headers = auth_headers(setup_data["hr_a"], "committee_hr_member", setup_data["team_a"])
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Fetch scores for a task in Team B
        res = await client.get(f"/api/tasks/{setup_data['tk_b']}/scores", headers=headers)
        assert res.status_code == 403
        
        # Fetch a specific submission score in Team B
        res_sub = await client.get(f"/api/tasks/submissions/{setup_data['sub_b']}/score", headers=headers)
        assert res_sub.status_code == 403


@pytest.mark.asyncio
async def test_hr_member_technical_privacy_enforced(setup_data, auth_headers):
    """
    HR MUST NOT access protected technical submission files or protected technical URLs.
    """
    headers = auth_headers(setup_data["hr_a"], "committee_hr_member", setup_data["team_a"])
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Attempt to fetch the full technical submission (which includes file_url)
        res = await client.get(f"/api/tasks/submissions/{setup_data['sub_a']}", headers=headers)
        assert res.status_code == 403
        assert "do not have permission to view technical task submissions" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_hr_member_cannot_modify_scores(setup_data, auth_headers):
    """
    HR MUST NOT modify Committee Head scores.
    """
    headers = auth_headers(setup_data["hr_a"], "committee_hr_member", setup_data["team_a"])
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Attempt to review/modify a submission score
        payload = {"score": 10, "reviewer_notes": "Great job"}
        res = await client.put(f"/api/tasks/submissions/{setup_data['sub_a']}/review", json=payload, headers=headers)
        assert res.status_code == 403


@pytest.mark.asyncio
async def test_committee_head_legitimate_modification(setup_data, auth_headers):
    """
    Committee Head must be able to modify scores for their own committee.
    """
    # Assuming head_a has committee_head role
    headers = auth_headers(setup_data["head_a"], "committee_head", setup_data["team_a"])
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {"score": 5, "reviewer_notes": "Good work"}
        res = await client.put(f"/api/tasks/submissions/{setup_data['sub_a']}/review", json=payload, headers=headers)
        assert res.status_code == 200
        
        # Verify the change
        data = res.json()
        assert data["score"] == 5
