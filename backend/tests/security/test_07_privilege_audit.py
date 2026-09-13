import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_elevated_role_verification(setup_data, auth_headers):
    # hr_admin should be able to access Team B's student
    headers_admin = auth_headers(setup_data["admin"], "hr_admin", None)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(f"/api/students/{setup_data['st_b']}", headers=headers_admin)
        assert res.status_code == 200

    # region_hr_head accessing Team A student
    headers_region = auth_headers(setup_data["region"], "region_hr_head", None)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(f"/api/students/{setup_data['st_a']}", headers=headers_region)
        assert res.status_code == 200

@pytest.mark.asyncio
async def test_error_leakage(setup_data):
    # Trigger an error intentionally
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/auth/login", content="INVALID JSON")
        # Ensure it doesn't leak stack traces
        assert "Traceback" not in res.text
        assert "File \\\"" not in res.text

@pytest.mark.asyncio
async def test_audit_immutability(setup_data, auth_headers):
    headers = auth_headers(setup_data["hr_a"], "committee_hr_member", setup_data["team_a"])
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Check if there is an exposed endpoint to delete or patch audits.
        # "NO PUBLIC MUTATION SURFACE" is the intended design, we verify 404 for arbitrary audit endpoints.
        res_del = await client.delete("/api/agent/audit/audit_1", headers=headers)
        assert res_del.status_code == 404
        
        res_patch = await client.patch("/api/agent/audit/audit_1", json={"status": "FORGED"}, headers=headers)
        assert res_patch.status_code == 404

@pytest.mark.asyncio
async def test_orm_audit_immutability(setup_data):
    from app.core.database import AsyncSessionLocal
    from app.models.entities import AgentActionAudit
    from sqlalchemy.exc import DatabaseError
    import uuid
    from datetime import datetime, timezone
    
    async with AsyncSessionLocal() as db:
        # Create a test audit directly
        audit = AgentActionAudit(
            id=str(uuid.uuid4()),
            action_id=str(uuid.uuid4()),
            user_id="test_user",
            intent="test_intent",
            tool_name="test_tool",
            timestamp=datetime.now(timezone.utc)
        )
        db.add(audit)
        await db.commit()
        await db.refresh(audit)
        
        # 1. Attempt DELETE
        with pytest.raises(DatabaseError) as exc_info:
            await db.delete(audit)
            await db.commit()
        
        assert "Delete not allowed" in str(exc_info.value) or "Mutation not allowed" in str(exc_info.value)
        await db.rollback()
        
        # 2. Attempt UPDATE
        with pytest.raises(DatabaseError) as exc_info_upd:
            audit.intent = "FORGED_INTENT"
            await db.commit()
            
        assert "Update not allowed" in str(exc_info_upd.value) or "Mutation not allowed" in str(exc_info_upd.value)
        await db.rollback()
