import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_unlinked_user_cannot_submit_feedback(setup_data, auth_headers):
    """
    Ensure an authenticated user without a linked student_id cannot submit feedback
    and is not silently attached to a student profile via email fallback.
    """
    headers = auth_headers(setup_data["unlinked_match"], "member")
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "hr_member_id": setup_data["hr_a"],
            "hr_member_name": "HR A",
            "category": "COMMUNICATION",
            "content": "Test feedback"
        }
        res = await client.post("/api/feedback", json=payload, headers=headers)
        assert res.status_code in [400, 403]
        assert "linked student" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_unlinked_user_cannot_ask_question(setup_data, auth_headers):
    """
    Ensure an authenticated user without a linked student_id cannot ask questions
    and is not silently attached to a student profile via email fallback.
    """
    headers = auth_headers(setup_data["unlinked_match"], "member")
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "title": "Test Question",
            "content": "What is the meaning of life?"
        }
        res = await client.post("/api/questions", json=payload, headers=headers)
        assert res.status_code in [400, 403]
        assert "linked student" in res.json()["detail"].lower()
