import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.entities import MemberQuestion

@pytest.mark.asyncio
async def test_question_answer_idor_protection(setup_data, auth_headers):
    """
    Test that Committee Head can only answer questions from their own committee.
    Cross-team answer attempt must return 403, and answered_by_user_id must not be modified.
    """
    headers = auth_headers(setup_data["head_a"], "committee_head", setup_data["team_a"])
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Attempt to answer Team B's question
        payload = {"answer": "Hacking attempt"}
        res = await client.post(f"/api/questions/{setup_data['q_b']}/answer", json=payload, headers=headers)
        
        assert res.status_code == 403
        assert "another committee" in res.json()["detail"].lower()
        
        # Verify that the rejected request did not modify the answered_by_user_id
        async with AsyncSessionLocal() as db:
            q_res = await db.execute(select(MemberQuestion).where(MemberQuestion.id == setup_data["q_b"]))
            q = q_res.scalar_one()
            assert q.answered_by_user_id is None, "IDOR Vulnerability: answered_by_user_id was modified despite 403 response!"
        
        # Valid access for Team A's question
        res_valid = await client.post(f"/api/questions/{setup_data['q_a']}/answer", json={"answer": "Valid answer"}, headers=headers)
        assert res_valid.status_code == 200
        assert res_valid.json()["answer"] == "Valid answer"
        assert res_valid.json()["status"] == "ANSWERED"

