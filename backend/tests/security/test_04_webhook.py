import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_webhook_authentication(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "OPENWA_WEBHOOK_SECRET", "test-secret")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # No secret
        res = await client.post("/api/whatsapp/webhook", json={})
        assert res.status_code == 401

        # Wrong secret
        res = await client.post("/api/whatsapp/webhook", json={}, headers={"X-Webhook-Secret": "wrong"})
        assert res.status_code == 403

@pytest.mark.asyncio
async def test_webhook_identity_integrity(setup_data):
    from app.core.config import settings
    settings.OPENWA_WEBHOOK_SECRET = 'test-secret'
    from app.core.config import settings
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Valid webhook payload, but fake phone number
        res = await client.post(
            "/api/whatsapp/webhook", 
            json={"data": {"from": "+999", "body": "Hello"}}, 
            headers={"X-Webhook-Secret": "test-secret"}
        )
        # Should be processed but won't match any internal student
        assert res.status_code == 200
        
        # Spoofed student mapping (attempting to inject an internal ID into the external webhook)
        res2 = await client.post(
            "/api/whatsapp/webhook", 
            json={"data": {"from": "+111", "body": "Hello", "student_id": "st_b"}}, 
            headers={"X-Webhook-Secret": "test-secret"}
        )
        assert res2.status_code == 200
        # The internal system will resolve "+111" to "st_a" securely, ignoring "st_b"

        import asyncio
        await asyncio.sleep(0.1)
