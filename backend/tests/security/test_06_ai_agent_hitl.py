import asyncio
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_ai_agent_direct_tool_bypass(setup_data):
    from app.core.database import AsyncSessionLocal
    from app.agent.tools import tool_get_meeting, tool_get_student_attendance, tool_get_tasks, tool_search_students, tool_get_student_score, PermissionContext
    
    async with AsyncSessionLocal() as db:
        # HR A tries to access Team B data by forging context or relying on tool IDOR
        context = PermissionContext(user_id=setup_data["hr_a"], role="committee_hr_member", team_id=setup_data["team_a"])
        
        # Test meeting
        res = await tool_get_meeting(db, context, meeting_id="mt_b")
        assert res["found"] == False
        assert "Unauthorized" in res["message"] or "outside team scope" in res["message"]

        # Test attendance
        res2 = await tool_get_student_attendance(db, context, student_id=setup_data["st_b"])
        assert len(res2.get("history", [])) == 0
        assert "Unauthorized" in res2["message"]

        # Test tasks
        res3 = await tool_get_tasks(db, context)
        # Should only return Team A tasks (which is 1 depending on setup_data)
        assert res3["count"] == 1
        
        # Test students
        res4 = await tool_search_students(db, context, query="Student B")
        assert res4["count"] == 0

        # Test student score
        res5 = await tool_get_student_score(db, context, student_id_or_name=setup_data["st_b"])
        assert res5["found"] == False
        assert "Unauthorized" in res5["message"] or "not found" in res5["message"]

@pytest.mark.asyncio
async def test_hitl_concurrency_and_bypass(setup_data, auth_headers):
    headers = auth_headers(setup_data["hr_a"], "committee_hr_member", setup_data["team_a"])
    action_id = setup_data["action_id"]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Fire two concurrent requests
        req1 = client.post("/api/agent/confirm", json={"action_id": action_id, "confirmed": True}, headers=headers)
        req2 = client.post("/api/agent/confirm", json={"action_id": action_id, "confirmed": True}, headers=headers)
        
        results = await asyncio.gather(req1, req2, return_exceptions=True)
        
        status_codes = [r.status_code for r in results if not isinstance(r, Exception)]
        # One should succeed (200), one should fail (400)
        assert 200 in status_codes
        assert 409 in status_codes or 400 in status_codes
