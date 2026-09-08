import pytest
import httpx
from unittest.mock import AsyncMock, patch, MagicMock
from app.providers.openwa_provider import OpenWAProvider, normalize_qr_payload
from app.providers.messaging_provider import OutgoingMessage

def test_normalize_qr_payload():
    assert normalize_qr_payload(None) is None
    assert normalize_qr_payload("") is None
    # Already normalized
    assert normalize_qr_payload("data:image/png;base64,ABC123==") == "data:image/png;base64,ABC123=="
    assert normalize_qr_payload("https://example.com/qr.png") == "https://example.com/qr.png"
    # Raw base64 string
    assert normalize_qr_payload("iVBORw0KGgoAAAANSUhEUgAA") == "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA"

@pytest.mark.asyncio
async def test_openwa_timeout_marked_as_uncertain_pending():
    """Verify that a network/gateway timeout is classified as UNKNOWN_PENDING to prevent automated duplicate sends."""
    provider = OpenWAProvider(base_url="http://fake-openwa:2785", api_key="owa_test", session_id="test_session")

    fake_sessions = [{"id": "uuid-1234", "name": "test_session", "status": "ready"}]
    mock_get_resp = MagicMock(status_code=200, json=lambda: fake_sessions)

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get, \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_get.return_value = mock_get_resp
        mock_post.side_effect = httpx.TimeoutException("Read timed out")

        msg = OutgoingMessage(
            recipient_name="Test Student",
            recipient_phone="01012345678",
            content="Urgent reminder",
            channel="WHATSAPP_OFFICIAL",
        )
        res = await provider.send_message(msg)

        assert res.success is False
        assert res.is_uncertain is True
        assert res.delivery_status == "UNKNOWN_PENDING"
        assert "UNCERTAIN" in res.error_message
        assert "not retry" in res.error_message.lower()

@pytest.mark.asyncio
async def test_openwa_confirmed_failure_on_500():
    """Verify that a 500 error from gateway is classified as CONFIRMED_FAILED."""
    provider = OpenWAProvider(base_url="http://fake-openwa:2785", api_key="owa_test", session_id="test_session")

    fake_sessions = [{"id": "uuid-1234", "name": "test_session", "status": "ready"}]
    mock_get_resp = MagicMock(status_code=200, json=lambda: fake_sessions)
    mock_post_resp = MagicMock(status_code=500, text="Internal Server Error")

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get, \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_get.return_value = mock_get_resp
        mock_post.return_value = mock_post_resp

        msg = OutgoingMessage(
            recipient_name="Test Student",
            recipient_phone="01012345678",
            content="Urgent reminder",
            channel="WHATSAPP_OFFICIAL",
        )
        res = await provider.send_message(msg)

        assert res.success is False
        assert res.is_uncertain is False
        assert res.delivery_status == "CONFIRMED_FAILED"
