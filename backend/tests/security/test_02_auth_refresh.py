import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timedelta, timezone

from app.main import app
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.models.entities import RefreshSession

@pytest.mark.asyncio
async def test_refresh_token_lifecycle(setup_data):
    from app.core.database import AsyncSessionLocal
    
    claims = {"sub": setup_data["hr_a"], "email": "hra@test.com", "role": "committee_hr_member", "team_id": setup_data["team_a"]}
    rt = create_refresh_token(claims)
    
    async with AsyncSessionLocal() as db:
        decoded = decode_token(rt)
        jti = decoded["jti"]
        rs = RefreshSession(id="rs_1", user_id=setup_data["hr_a"], refresh_token_jti=jti, expires_at=datetime.now(timezone.utc) + timedelta(days=7))
        db.add(rs)
        await db.commit()
        
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Valid refresh
        res = await client.post("/api/auth/refresh", json={"refresh_token": rt})
        assert res.status_code == 200
        new_rt = res.json()["refresh_token"]
        
        # 2. Old refresh should fail (reused)
        res_old = await client.post("/api/auth/refresh", json={"refresh_token": rt})
        assert res_old.status_code == 401
        
        # 3. Logout
        res_logout = await client.post("/api/auth/logout", headers={"Authorization": f"Bearer {create_access_token(claims)}"}, json={"refresh_token": new_rt})
        assert res_logout.status_code == 200
        
        # 4. New refresh should fail because logged out
        res_new = await client.post("/api/auth/refresh", json={"refresh_token": new_rt})
        assert res_new.status_code == 401

        # 5. Forged JTI
        bad_claims = {"sub": setup_data["hr_a"], "email": "hra@test.com", "role": "committee_hr_member", "team_id": setup_data["team_a"]}
        bad_rt = create_refresh_token(bad_claims)
        res_bad = await client.post("/api/auth/refresh", json={"refresh_token": bad_rt})
        assert res_bad.status_code == 401
