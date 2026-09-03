"""Tests for the standalone WhatsApp Agent test mode."""
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from app.agent import whatsapp_agent
from app.core.database import get_db
from app.main import app
from app.seed.seed_data import seed_all
from app.core.database import Base
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


@pytest.fixture
async def client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        await seed_all(session)
        async def override_get_db():
            yield session
        app.dependency_overrides[get_db] = override_get_db
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as test_client:
            yield test_client
        app.dependency_overrides.clear()
    await engine.dispose()


def test_empty_phone_number():
    result = whatsapp_agent.send_whatsapp_message("", "Hello")
    assert result["success"] is False
    assert "valid international" in result["error"]


def test_invalid_phone_number():
    result = whatsapp_agent.send_whatsapp_message("+20abc", "Hello")
    assert result["success"] is False
    assert result["status"] == "failed"


def test_empty_message():
    result = whatsapp_agent.send_whatsapp_message("+201012345678", "   ")
    assert result["success"] is False
    assert result["error"] == "Message cannot be empty."


def test_successful_tool_execution(monkeypatch):
    calls = []
    fake_pywhatkit = SimpleNamespace(
        sendwhatmsg_instantly=lambda *args, **kwargs: calls.append((args, kwargs))
    )
    monkeypatch.setattr(whatsapp_agent, "pywhatkit", fake_pywhatkit)

    result = whatsapp_agent.send_whatsapp_message("00201012345678", " Test message ")

    assert result == {
        "success": True,
        "recipient": "+201012345678",
        "message": "Test message",
        "status": "sent",
    }
    assert calls == [(("+201012345678", "Test message"), {"wait_time": 10, "tab_close": True})]


def test_pywhatkit_failure(monkeypatch):
    def fail(*args, **kwargs):
        raise RuntimeError("WhatsApp Web is unavailable")

    monkeypatch.setattr(whatsapp_agent, "pywhatkit", SimpleNamespace(sendwhatmsg_instantly=fail))
    result = whatsapp_agent.send_whatsapp_message("+201012345678", "Hello")
    assert result["success"] is False
    assert result["error"] == "WhatsApp Web is unavailable"


@pytest.mark.asyncio
async def test_api_success_response(client, monkeypatch):
    login = await client.post("/api/auth/login", json={"email": "admin@studentops.org", "password": "admin123"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    async def send_success(phone, message):
        return {"success": True, "recipient": phone, "status": "sent"}

    monkeypatch.setattr("app.api.routes_whatsapp.run_whatsapp_agent", send_success)

    response = await client.post(
        "/api/whatsapp/send",
        json={"phone_number": "+201012345678", "message": "Hello"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json() == {"success": True, "recipient": "+201012345678", "status": "sent"}


@pytest.mark.asyncio
async def test_api_failure_response(client, monkeypatch):
    login = await client.post("/api/auth/login", json={"email": "admin@studentops.org", "password": "admin123"})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    async def send_failure(phone, message):
        return {
            "success": False,
            "recipient": phone,
            "status": "failed",
            "error": "WhatsApp Web is unavailable",
        }

    monkeypatch.setattr("app.api.routes_whatsapp.run_whatsapp_agent", send_failure)

    response = await client.post(
        "/api/whatsapp/send",
        json={"phone_number": "+201012345678", "message": "Hello"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["success"] is False
    assert response.json()["status"] == "failed"
