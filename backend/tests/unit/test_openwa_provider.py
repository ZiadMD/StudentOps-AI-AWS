import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.providers.openwa_provider import OpenWAProvider, format_phone_international, generate_wa_me_link
from app.providers.messaging_provider import OutgoingMessage

def test_format_phone_international():
    assert format_phone_international("01012345678") == "201012345678"
    assert format_phone_international("+201012345678") == "201012345678"
    assert format_phone_international("00201012345678") == "201012345678"
    assert format_phone_international("1012345678") == "201012345678"
    assert format_phone_international("+14155552671") == "14155552671"
    assert format_phone_international("+966501234567") == "966501234567"
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


def test_extract_openwa_message_id():
    from app.providers.openwa_provider import extract_openwa_message_id

    # 1. None and empty
    assert extract_openwa_message_id(None) is None
    assert extract_openwa_message_id("") is None
    assert extract_openwa_message_id("   ") is None

    # 2. Simple and serialized string IDs
    assert extract_openwa_message_id("msg_test_123") == "msg_test_123"
    assert extract_openwa_message_id("true_201012345678@c.us_3EB0ABCDEF123456") == "true_201012345678@c.us_3EB0ABCDEF123456"

    # 3. Dictionary with _serialized
    dict_with_serialized = {
        "fromMe": True,
        "remote": "201012345678@c.us",
        "id": "3EB0ABCDEF123456",
        "_serialized": "true_201012345678@c.us_3EB0ABCDEF123456",
    }
    assert extract_openwa_message_id(dict_with_serialized) == "true_201012345678@c.us_3EB0ABCDEF123456"

    # 4. Dictionary without _serialized (composite)
    dict_composite = {
        "fromMe": True,
        "remote": "201012345678@c.us",
        "id": "3EB0ABCDEF123456",
    }
    assert extract_openwa_message_id(dict_composite) == "true_201012345678@c.us_3EB0ABCDEF123456"

    # 5. Nested dictionary under id
    dict_nested = {
        "id": {
            "_serialized": "true_201012345678@c.us_3EB0ABCDEF123456"
        }
    }
    assert extract_openwa_message_id(dict_nested) == "true_201012345678@c.us_3EB0ABCDEF123456"

    # 6. Stringified Python dictionary repr
    stringified = "{'fromMe': True, 'remote': '201012345678@c.us', 'id': '3EB0...', '_serialized': 'true_201012345678@c.us_3EB0...'}"
    assert extract_openwa_message_id(stringified) == "true_201012345678@c.us_3EB0..."


def test_extract_message_id_from_response():
    from app.providers.openwa_provider import extract_message_id_from_response

    # Direct string
    assert extract_message_id_from_response("true_201012345678@c.us_ABC") == "true_201012345678@c.us_ABC"

    # Direct id field as string
    assert extract_message_id_from_response({"id": "msg_999"}) == "msg_999"

    # Direct id field as dict
    assert extract_message_id_from_response({
        "id": {
            "fromMe": True,
            "remote": "201012345678@c.us",
            "id": "3EB0123",
            "_serialized": "true_201012345678@c.us_3EB0123"
        }
    }) == "true_201012345678@c.us_3EB0123"

    # messageId field
    assert extract_message_id_from_response({"messageId": "msg_m_888"}) == "msg_m_888"

    # Nested response container
    assert extract_message_id_from_response({"response": {"id": "msg_nested_777"}}) == "msg_nested_777"

    # List in data container
    assert extract_message_id_from_response({"data": [{"id": "msg_list_666"}]}) == "msg_list_666"


def test_parse_openwa_message_meta():
    from app.providers.openwa_provider import parse_openwa_message_meta

    # 1. Top-level fromMe
    meta_top = {"id": "msg_001", "fromMe": True, "body": "hello"}
    id_top, from_me_top = parse_openwa_message_meta(meta_top)
    assert id_top == "msg_001"
    assert from_me_top is True

    # 2. Nested id dict with fromMe
    meta_nested_id = {
        "id": {
            "fromMe": True,
            "_serialized": "true_201012345678@c.us_999",
        },
        "body": "test",
    }
    id_nest, from_me_nest = parse_openwa_message_meta(meta_nested_id)
    assert id_nest == "true_201012345678@c.us_999"
    assert from_me_nest is True

    # 3. Baileys / WAHA key format
    meta_key = {
        "id": "true_201012345678@c.us_BAIL_01",
        "key": {"fromMe": True, "remoteJid": "201012345678@c.us"},
        "body": "from baileys",
    }
    id_key, from_me_key = parse_openwa_message_meta(meta_key)
    assert id_key == "true_201012345678@c.us_BAIL_01"
    assert from_me_key is True

    # 4. Serialized prefix true_
    meta_prefix = {"id": "true_201012345678@c.us_PREFIX_01", "body": "prefix test"}
    id_pre, from_me_pre = parse_openwa_message_meta(meta_prefix)
    assert id_pre == "true_201012345678@c.us_PREFIX_01"
    assert from_me_pre is True

    # 5. Deterministic phone match
    meta_phone = {
        "id": "unlabeled_001",
        "from": "201000000000@c.us",
        "to": "201012345678@c.us",
        "body": "sent from official",
    }
    id_ph, from_me_ph = parse_openwa_message_meta(meta_phone, official_phone="+201000000000")
    assert id_ph == "unlabeled_001"
    assert from_me_ph is True

    # 6. Incoming student message
    meta_student = {
        "id": "false_201012345678@c.us_STU_01",
        "from": "201012345678@c.us",
        "to": "201000000000@c.us",
        "fromMe": False,
        "body": "Hello HR",
    }
    id_stu, from_me_stu = parse_openwa_message_meta(meta_student, official_phone="+201000000000")
    assert id_stu == "false_201012345678@c.us_STU_01"
    assert from_me_stu is False


@pytest.mark.asyncio
async def test_openwa_gateway_send_message_with_dict_id():
    """Verifies that if OpenWA returns an ID dictionary, send_message extracts a clean serialized string."""
    provider = OpenWAProvider(base_url="http://fake-openwa:2785", api_key="owa_test", session_id="test_session")
    
    fake_sessions = [{"id": "uuid-1234", "name": "test_session", "status": "ready"}]

    mock_get_resp = MagicMock()
    mock_get_resp.status_code = 200
    mock_get_resp.json.return_value = fake_sessions

    mock_post_resp = MagicMock()
    mock_post_resp.status_code = 201
    mock_post_resp.text = '{"id": {"_serialized": "true_201012345678@c.us_3EB0TEST123"}}'
    mock_post_resp.json.return_value = {
        "id": {
            "fromMe": True,
            "remote": "201012345678@c.us",
            "id": "3EB0TEST123",
            "_serialized": "true_201012345678@c.us_3EB0TEST123"
        }
    }

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get, \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_get.return_value = mock_get_resp
        mock_post.return_value = mock_post_resp

        msg = OutgoingMessage(
            recipient_name="Test Student",
            recipient_phone="01012345678",
            content="Dict ID test message",
            channel="WHATSAPP_OFFICIAL",
        )
        res = await provider.send_message(msg)
        assert res.success is True
        assert res.message_id == "true_201012345678@c.us_3EB0TEST123"
        assert not res.message_id.startswith("{")

