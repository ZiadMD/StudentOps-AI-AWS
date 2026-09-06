import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.providers.openwa_provider import OpenWAProvider, format_phone_international, generate_wa_me_link
from app.providers.messaging_provider import OutgoingMessage

def test_format_phone_international():
    assert format_phone_international("01012345678") == "201012345678"
    assert format_phone_international("+201012345678") == "201012345678"
    assert format_phone_international("00201012345678") == "201012345678"
    assert format_phone_international("1012345678") == "201012345678"
    assert format_phone_international("") == ""

def test_generate_wa_me_link():
    link = generate_wa_me_link("01012345678", "Hello Student!")
    assert "https://wa.me/201012345678?text=Hello%20Student%21" == link

@pytest.mark.asyncio
async def test_openwa_gateway_status_resolution():
    provider = OpenWAProvider(base_url="http://fake-openwa:2785", api_key="owa_test", session_id="test_session")
    
    fake_sessions = [
        {
            "id": "uuid-1234",
            "name": "test_session",
            "status": "ready",
            "phone": "201204817795",
            "pushName": "Ziad"
        }
    ]

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = fake_sessions

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        status = await provider.get_status()
        assert status["status"] == "CONNECTED"
        assert status["phone_number"] == "+201204817795"
        assert status["session_name"] == "test_session"
        assert status["session_id"] == "uuid-1234"

@pytest.mark.asyncio
async def test_openwa_gateway_send_message():
    provider = OpenWAProvider(base_url="http://fake-openwa:2785", api_key="owa_test", session_id="test_session")
    
    fake_sessions = [
        {"id": "uuid-1234", "name": "test_session", "status": "ready"}
    ]

    mock_get_resp = MagicMock()
    mock_get_resp.status_code = 200
    mock_get_resp.json.return_value = fake_sessions

    mock_post_resp = MagicMock()
    mock_post_resp.status_code = 201
    mock_post_resp.text = '{"id": "msg-999"}'
    mock_post_resp.json.return_value = {"id": "msg-999"}

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get, \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_get.return_value = mock_get_resp
        mock_post.return_value = mock_post_resp

        msg = OutgoingMessage(
            recipient_name="Test Student",
            recipient_phone="01012345678",
            content="Reminder message",
            channel="WHATSAPP_OFFICIAL",
        )
        res = await provider.send_message(msg)
        assert res.success is True
        assert res.message_id == "msg-999"
        assert res.recipient_phone == "201012345678"
