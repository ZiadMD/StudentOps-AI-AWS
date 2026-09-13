import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_rate_limit_login(setup_data):
    from app.core.rate_limiter import limiter
    limiter.reset()
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # settings.RATE_LIMIT_LOGIN_PER_MINUTE is typically 5. We'll spam 10 requests.
        responses = []
        for _ in range(65):
            res = await client.post("/api/auth/login", json={"email": "hra@test.com", "password": "wrong"})
            responses.append(res.status_code)
            
        # At least one should be 429 Too Many Requests
        assert 429 in responses

@pytest.mark.asyncio
async def test_rate_limit_webhook():
    from app.core.rate_limiter import limiter
    limiter.reset()
    
    # Wait to reset just in case
    await asyncio.sleep(0.1)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Assume max_requests = 120. Spam 150 requests!
        reqs = [client.post("/api/whatsapp/webhook", json={}) for _ in range(130)]
        results = await asyncio.gather(*reqs, return_exceptions=True)
        status_codes = [r.status_code for r in results if hasattr(r, 'status_code')]
        
        assert 429 in status_codes
