"""
OpenWA Provider for StudentOps AI.
Integrates with headless OpenWA Docker container for official organization notifications,
and provides zero-trust wa.me deep links for personal HR follow-ups.
"""
from __future__ import annotations
from typing import Optional, Any
from datetime import datetime, timezone
import urllib.parse
import re
import asyncio
import random
import httpx

from app.core.config import settings
from app.providers.messaging_provider import (
    MessagingProvider,
    OutgoingMessage,
    MessageDeliveryResult,
)


def format_phone_international(phone: str) -> str:
    """Sanitizes phone numbers into international digits-only format (defaults to Egypt +20 for domestic numbers)."""
    raw = phone.strip()
    if not raw:
        return ""
    is_explicit_intl = raw.startswith("+") or raw.startswith("00")
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return ""
    if raw.startswith("00"):
        digits = digits[2:]
    elif not is_explicit_intl:
        if digits.startswith("0") and len(digits) == 11:
            # Egyptian local mobile format: 010..., 011..., 012..., 015...
            digits = "20" + digits[1:]
        elif len(digits) == 10 and digits.startswith("1"):
            # Egyptian local without 0: 10..., 11..., 12..., 15...
            digits = "20" + digits
    return digits


def generate_wa_me_link(phone: str, message_text: str) -> str:
    """
    Generates a zero-trust client-side wa.me deep link.
    Opens the user's native WhatsApp app directly without storing any credentials on server.
    """
    clean_phone = format_phone_international(phone)
    encoded_text = urllib.parse.quote(message_text)
    return f"https://wa.me/{clean_phone}?text={encoded_text}"


_outbound_rate_lock = asyncio.Lock()
_last_outbound_timestamp = 0.0


async def _throttle_outbound(min_interval: float = 1.0, max_jitter: float = 0.5):
    """Enforces rate limiting and jitter between outgoing OpenWA requests to prevent WhatsApp ban triggers."""
    global _last_outbound_timestamp
    try:
        async with _outbound_rate_lock:
            loop = asyncio.get_running_loop()
            now = loop.time()
            delay_needed = (_last_outbound_timestamp + min_interval) - now
            if delay_needed > 0:
                jitter = random.uniform(0.05, max_jitter)
                await asyncio.sleep(delay_needed + jitter)
            _last_outbound_timestamp = loop.time()
    except RuntimeError:
        pass


def normalize_qr_payload(qr: Optional[str]) -> Optional[str]:
    """Ensures QR payload is a valid browser-renderable image data URL or URL."""
    if not qr:
        return None
    qr = qr.strip()
    if qr.startswith("data:image") or qr.startswith("http://") or qr.startswith("https://"):
        return qr
    # If raw base64 string, prepend standard PNG data URI
    return f"data:image/png;base64,{qr}"


def extract_openwa_message_id(raw_id: Any) -> Optional[str]:
    """
    Normalizes message ID from various OpenWA / WAHA / WPPConnect representations
    into a clean serialized string. Handles nested dictionaries, strings, and legacy stringified dicts.
    """
    if raw_id is None:
        return None
    if isinstance(raw_id, str):
        trimmed = raw_id.strip()
        if not trimmed:
            return None
        # Handle stringified Python dictionary representation (e.g. "{'fromMe': True, '_serialized': '...'}")
        if trimmed.startswith("{") and ("_serialized" in trimmed or "'id'" in trimmed or '"id"' in trimmed):
            try:
                import ast
                parsed = ast.literal_eval(trimmed)
                if isinstance(parsed, dict):
                    return extract_openwa_message_id(parsed)
            except Exception:
                pass
        return trimmed
    if isinstance(raw_id, dict):
        # 1. Prefer serialized string if present
        if raw_id.get("_serialized"):
            return str(raw_id["_serialized"]).strip()
        # 2. Construct serialized string from composite parts if available
        remote = raw_id.get("remote") or raw_id.get("remoteJid") or raw_id.get("chatId")
        short_id = raw_id.get("id")
        if remote and short_id and isinstance(short_id, str):
            from_me_str = "true" if raw_id.get("fromMe") else "false"
            return f"{from_me_str}_{remote}_{short_id}"
        # 3. Check inner id
        inner_id = raw_id.get("id")
        if isinstance(inner_id, (dict, str)):
            extracted_inner = extract_openwa_message_id(inner_id)
            if extracted_inner:
                return extracted_inner
        if short_id:
            return str(short_id).strip()
    return str(raw_id).strip() if raw_id else None


def extract_message_id_from_response(res_data: Any, fallback: Optional[str] = None) -> str:
    """
    Extracts a normalized serialized message ID string from an OpenWA / WAHA / WPPConnect API response.
    """
    now_ts = datetime.now(timezone.utc).timestamp()
    default_fallback = fallback or f"openwa_{now_ts}"

    if not res_data:
        return default_fallback

    if isinstance(res_data, str):
        extracted = extract_openwa_message_id(res_data)
        return extracted or default_fallback

    if isinstance(res_data, dict):
        # 1. Check direct keys
        for key in ("_serialized", "id", "messageId"):
            if res_data.get(key) is not None:
                extracted = extract_openwa_message_id(res_data[key])
                if extracted:
                    return extracted

        # 2. Check common wrapper containers
        for container_key in ("response", "data", "result", "message"):
            container = res_data.get(container_key)
            if isinstance(container, dict):
                for key in ("_serialized", "id", "messageId"):
                    if container.get(key) is not None:
                        extracted = extract_openwa_message_id(container[key])
                        if extracted:
                            return extracted
            elif isinstance(container, list) and len(container) > 0:
                first_item = container[0]
                if isinstance(first_item, dict):
                    for key in ("_serialized", "id", "messageId"):
                        if first_item.get(key) is not None:
                            extracted = extract_openwa_message_id(first_item[key])
                            if extracted:
                                return extracted
                elif isinstance(first_item, str):
                    extracted = extract_openwa_message_id(first_item)
                    if extracted:
                        return extracted

    return default_fallback


def parse_openwa_message_meta(
    raw_msg: dict[str, Any],
    payload: Optional[dict[str, Any]] = None,
    official_phone: Optional[str] = None,
) -> tuple[str, bool]:
    """
    Extracts normalized openwa_id and accurately resolves from_me direction.
    Prevents outbound HR messages from ever flipping to incoming student messages.
    """
    # 1. Resolve openwa_id
    raw_id = (
        raw_msg.get("id")
        or raw_msg.get("_serialized")
        or raw_msg.get("messageId")
        or (raw_msg.get("key", {}).get("id") if isinstance(raw_msg.get("key"), dict) else None)
    )
    openwa_id = extract_openwa_message_id(raw_id) or f"openwa_{datetime.now(timezone.utc).timestamp()}"

    # 2. Resolve from_me
    from_me = False

    # Check top-level boolean in data
    if raw_msg.get("fromMe") is not None:
        from_me = bool(raw_msg.get("fromMe"))
    # Check payload level (for webhooks where data is nested in payload)
    elif payload and payload.get("fromMe") is not None:
        from_me = bool(payload.get("fromMe"))
    # Check nested id dict
    elif isinstance(raw_msg.get("id"), dict) and raw_msg["id"].get("fromMe") is not None:
        from_me = bool(raw_msg["id"].get("fromMe"))
    # Check nested key dict (Baileys / WAHA format)
    elif isinstance(raw_msg.get("key"), dict) and raw_msg["key"].get("fromMe") is not None:
        from_me = bool(raw_msg["key"].get("fromMe"))

    # Serialized ID prefix check: true_ indicates fromMe=True in OpenWA/WhatsApp Web protocol
    if not from_me and openwa_id.startswith("true_"):
        from_me = True

    # Deterministic phone check: If sender phone matches official phone, it was sent by us!
    if not from_me and official_phone:
        raw_sender = str(raw_msg.get("from") or raw_msg.get("sender", {}).get("id") or "")
        clean_sender = format_phone_international(raw_sender)
        clean_official = format_phone_international(official_phone)
        if clean_sender and clean_official and clean_sender == clean_official:
            raw_to = str(raw_msg.get("to") or raw_msg.get("chatId") or "")
            clean_to = format_phone_international(raw_to)
            if clean_to != clean_official:
                from_me = True

    return openwa_id, from_me



class OpenWAProvider(MessagingProvider):
    """
    HTTP Client interacting with OpenWA Gateway (NestJS) or headless container for official org broadcasts.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        session_id: Optional[str] = None,
    ):
        self.base_url = (base_url or settings.OPENWA_API_URL).rstrip("/")
        self.api_key = api_key or settings.OPENWA_API_KEY
        self.session_id_preference = session_id or settings.OPENWA_SESSION_ID
        self.headers = {
            "Content-Type": "application/json",
        }
        if self.api_key:
            self.headers["X-API-Key"] = self.api_key
            self.headers["Authorization"] = f"Bearer {self.api_key}"
            self.headers["api_key"] = self.api_key

    async def _resolve_session(self, client: httpx.AsyncClient, session_name: Optional[str] = None) -> Optional[dict]:
        """
        Resolves the active OpenWA session from OpenWA Gateway /api/sessions.
        Selects preferred session by ID or name, falls back to first ready session.
        Auto-creates a session if requested session does not exist.
        """
        url = f"{self.base_url}/api/sessions"
        pref = session_name or self.session_id_preference
        try:
            resp = await client.get(url, headers=self.headers, timeout=4.0)
            if resp.status_code == 200:
                sessions = resp.json()
                if isinstance(sessions, list) and len(sessions) > 0:
                    if pref:
                        # Exact ID or name match
                        for s in sessions:
                            if s.get("id") == pref or s.get("name") == pref:
                                return s

                    # If specific session was requested but not found, create it
                    if session_name:
                        create_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", session_name)[:40]
                        create_resp = await client.post(
                            url,
                            json={"name": create_name},
                            headers=self.headers,
                            timeout=5.0,
                        )
                        if create_resp.status_code in (200, 201):
                            return create_resp.json()

                    # Otherwise prefer any ready session
                    for s in sessions:
                        if s.get("status") == "ready":
                            return s

                    # Return the first session
                    return sessions[0]

                # List is empty: auto-create ops-official or requested session
                target_name = pref or "ops-official"
                create_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", target_name)[:40]
                create_resp = await client.post(
                    url,
                    json={"name": create_name},
                    headers=self.headers,
                    timeout=5.0,
                )
                if create_resp.status_code in (200, 201):
                    return create_resp.json()
        except Exception:
            pass
        return None

    async def get_status(self, session_name: Optional[str] = None) -> dict:
        """
        Polls OpenWA status endpoint to inspect daemon connectivity, QR state, or live session.
        Works seamlessly with both OpenWA Gateway (/api/sessions) and legacy endpoints.
        """
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                # 1. Try OpenWA Gateway (/api/sessions)
                session = await self._resolve_session(client, session_name=session_name)
                if session:
                    raw_status = (session.get("status") or "disconnected").lower()
                    if raw_status == "ready":
                        status_str = "CONNECTED"
                    elif raw_status == "authenticating":
                        status_str = "AUTHENTICATING"
                    elif raw_status in ("qr_ready", "action_required", "created", "initializing"):
                        status_str = "SCAN_QR_CODE"
                    else:
                        status_str = "DISCONNECTED"

                    phone_raw = session.get("phone")
                    if phone_raw:
                        phone_number = f"+{phone_raw}" if not str(phone_raw).startswith("+") else str(phone_raw)
                    else:
                        phone_number = settings.OPENWA_OFFICIAL_PHONE

                    qr_code = None
                    if raw_status in ("qr_ready", "action_required", "created", "initializing"):
                        try:
                            qr_res = await client.get(
                                f"{self.base_url}/api/sessions/{session['id']}/qr",
                                headers=self.headers,
                                timeout=3.0,
                            )
                            if qr_res.status_code == 200:
                                raw_qr = qr_res.json().get("qrCode") or qr_res.json().get("qr")
                                qr_code = normalize_qr_payload(raw_qr)
                        except Exception:
                            pass

                    return {
                        "configured": True,
                        "status": status_str,
                        "phone_number": phone_number,
                        "session_name": session.get("name"),
                        "session_id": session.get("id"),
                        "battery": 100,
                        "qr_code": qr_code,
                    }

                # 2. Fallback to legacy OpenWA daemon (/getConnectionState)
                resp = await client.get(f"{self.base_url}/getConnectionState", headers=self.headers)
                if resp.status_code == 200:
                    state = resp.json().get("state", "UNKNOWN")
                    phone_number = settings.OPENWA_OFFICIAL_PHONE
                    if state == "CONNECTED":
                        try:
                            me_resp = await client.get(f"{self.base_url}/getMe", headers=self.headers)
                            if me_resp.status_code == 200:
                                live_num = me_resp.json().get("id", {}).get("user")
                                if live_num:
                                    phone_number = f"+{live_num}"
                        except Exception:
                            pass
                    return {
                        "configured": True,
                        "status": state,
                        "phone_number": phone_number,
                        "battery": 100,
                        "qr_code": None,
                    }
        except httpx.ConnectError:
            return {
                "configured": bool(settings.OPENWA_OFFICIAL_PHONE or settings.OPENWA_API_URL),
                "status": "GATEWAY_UNAVAILABLE",
                "phone_number": settings.OPENWA_OFFICIAL_PHONE,
                "battery": None,
                "qr_code": None,
                "error": "Cannot connect to OpenWA container at " + self.base_url,
            }
        except Exception as e:
            return {
                "configured": bool(settings.OPENWA_OFFICIAL_PHONE or settings.OPENWA_API_URL),
                "status": "DISCONNECTED",
                "phone_number": settings.OPENWA_OFFICIAL_PHONE,
                "battery": None,
                "qr_code": None,
                "error": str(e),
            }

        return {
            "configured": bool(settings.OPENWA_OFFICIAL_PHONE or settings.OPENWA_API_URL),
            "status": "DISCONNECTED",
            "phone_number": settings.OPENWA_OFFICIAL_PHONE,
            "battery": None,
            "qr_code": None,
        }

    async def get_qr(self, session_name: Optional[str] = None) -> Optional[str]:
        """Fetches current QR string / data URL image if session requires authentication."""
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                # 1. OpenWA Gateway (/api/sessions/:id/qr)
                session = await self._resolve_session(client, session_name=session_name)
                if session:
                    if session.get("status") == "ready":
                        return None
                    qr_res = await client.get(
                        f"{self.base_url}/api/sessions/{session['id']}/qr",
                        headers=self.headers,
                        timeout=3.0,
                    )
                    if qr_res.status_code == 200:
                        raw_qr = qr_res.json().get("qrCode") or qr_res.json().get("qr")
                        return normalize_qr_payload(raw_qr)
                    return None

                # 2. Legacy OpenWA daemon (/getQrCode)
                resp = await client.get(f"{self.base_url}/getQrCode", headers=self.headers)
                if resp.status_code == 200:
                    raw_qr = resp.json().get("qr")
                    return normalize_qr_payload(raw_qr)
        except Exception:
            pass
        return None

    async def send_message(self, message: OutgoingMessage, session_name: Optional[str] = None) -> MessageDeliveryResult:
        """
        Sends an official message via OpenWA Gateway or legacy daemon.
        Safely isolates timeouts to prevent dangerous duplicate retry loops.
        """
        clean_phone = format_phone_international(message.recipient_phone)
        chat_id = f"{clean_phone}@c.us"
        now = datetime.now(timezone.utc)
        gateway_error = None

        await _throttle_outbound()

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # 1. Try OpenWA Gateway
                session = await self._resolve_session(client, session_name=session_name)
                if session:
                    session_id = session.get("id")
                    send_url = f"{self.base_url}/api/sessions/{session_id}/messages/send-text"
                    payload = {
                        "chatId": chat_id,
                        "text": message.content,
                    }
                    resp = await client.post(send_url, json=payload, headers=self.headers)
                    if resp.status_code in (200, 201):
                        res_data = resp.json() if resp.text else {}
                        msg_id = extract_message_id_from_response(res_data, fallback=f"openwa_{now.timestamp()}")
                        return MessageDeliveryResult(
                            success=True,
                            message_id=str(msg_id),
                            recipient_phone=clean_phone,
                            channel="WHATSAPP_OFFICIAL",
                            delivered_at=now,
                            delivery_status="DELIVERED",
                            is_uncertain=False,
                        )
                    elif resp.status_code == 409:
                        return MessageDeliveryResult(
                            success=False,
                            message_id=f"err_{now.timestamp()}",
                            recipient_phone=clean_phone,
                            channel="WHATSAPP_OFFICIAL",
                            delivered_at=now,
                            error_message="WhatsApp session is reloading or reconnecting. Please retry shortly.",
                            delivery_status="CONFIRMED_FAILED",
                            is_uncertain=False,
                        )
                    else:
                        gateway_error = f"OpenWA Gateway returned {resp.status_code}: {resp.text}"

                # 2. Fallback to legacy OpenWA daemon (/sendText)
                url = f"{self.base_url}/sendText"
                legacy_payload = {
                    "chatId": chat_id,
                    "text": message.content,
                }
                resp = await client.post(url, json=legacy_payload, headers=self.headers)
                if resp.status_code in (200, 201):
                    res_data = resp.json() if resp.text else {}
                    msg_id = extract_message_id_from_response(res_data, fallback=f"openwa_{now.timestamp()}")
                    return MessageDeliveryResult(
                        success=True,
                        message_id=str(msg_id),
                        recipient_phone=clean_phone,
                        channel="WHATSAPP_OFFICIAL",
                        delivered_at=now,
                        delivery_status="DELIVERED",
                        is_uncertain=False,
                    )
                else:
                    err = gateway_error or f"OpenWA returned {resp.status_code}: {resp.text}"
                    return MessageDeliveryResult(
                        success=False,
                        message_id=f"err_{now.timestamp()}",
                        recipient_phone=clean_phone,
                        channel="WHATSAPP_OFFICIAL",
                        delivered_at=now,
                        error_message=err,
                        delivery_status="CONFIRMED_FAILED",
                        is_uncertain=False,
                    )
        except httpx.TimeoutException as exc:
            # Dangerous condition: message may have been delivered by WhatsApp before HTTP response returned.
            # Mark delivery status as UNKNOWN_PENDING to prevent automated duplicate sends.
            return MessageDeliveryResult(
                success=False,
                message_id=f"timeout_{now.timestamp()}",
                recipient_phone=clean_phone,
                channel="WHATSAPP_OFFICIAL",
                delivered_at=now,
                error_message="Gateway request timed out. Message delivery state is UNCERTAIN. Do NOT retry automatically.",
                delivery_status="UNKNOWN_PENDING",
                is_uncertain=True,
            )
        except Exception as exc:
            return MessageDeliveryResult(
                success=False,
                message_id=f"err_{now.timestamp()}",
                recipient_phone=clean_phone,
                channel="WHATSAPP_OFFICIAL",
                delivered_at=now,
                error_message=f"Could not reach OpenWA service: {gateway_error or str(exc)}",
                delivery_status="CONFIRMED_FAILED",
                is_uncertain=False,
            )

    async def send_batch(self, messages: list[OutgoingMessage], session_name: Optional[str] = None) -> list[MessageDeliveryResult]:
        results = []
        for msg in messages:
            res = await self.send_message(msg, session_name=session_name)
            results.append(res)
        return results

    async def send_media_message(
        self,
        recipient_phone: str,
        file_base64_or_url: str,
        filename: str = "file",
        mimetype: str = "application/octet-stream",
        caption: Optional[str] = None,
    ) -> MessageDeliveryResult:
        """Sends an image, video, audio, or document file via OpenWA Gateway or daemon."""
        clean_phone = format_phone_international(recipient_phone)
        chat_id = f"{clean_phone}@c.us"
        now = datetime.now(timezone.utc)
        gateway_error = None

        await _throttle_outbound()

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                session = await self._resolve_session(client)
                if session:
                    session_id = session.get("id")
                    send_url = f"{self.base_url}/api/sessions/{session_id}/messages/send-file"
                    payload = {
                        "chatId": chat_id,
                        "file": file_base64_or_url,
                        "filename": filename,
                        "caption": caption or "",
                    }
                    resp = await client.post(send_url, json=payload, headers=self.headers)
                    if resp.status_code in (200, 201):
                        res_data = resp.json() if resp.text else {}
                        msg_id = extract_message_id_from_response(res_data, fallback=f"openwa_{now.timestamp()}")
                        return MessageDeliveryResult(
                            success=True,
                            message_id=str(msg_id),
                            recipient_phone=clean_phone,
                            channel="WHATSAPP_OFFICIAL",
                            delivered_at=now,
                        )
                    gateway_error = f"OpenWA Gateway send-file returned {resp.status_code}: {resp.text}"

                # Fallback to legacy OpenWA daemon (/sendFile)
                url = f"{self.base_url}/sendFile"
                legacy_payload = {
                    "chatId": chat_id,
                    "file": file_base64_or_url,
                    "filename": filename,
                    "caption": caption or "",
                }
                resp = await client.post(url, json=legacy_payload, headers=self.headers)
                if resp.status_code in (200, 201):
                    res_data = resp.json() if resp.text else {}
                    msg_id = extract_message_id_from_response(res_data, fallback=f"openwa_{now.timestamp()}")
                    return MessageDeliveryResult(
                        success=True,
                        message_id=str(msg_id),
                        recipient_phone=clean_phone,
                        channel="WHATSAPP_OFFICIAL",
                        delivered_at=now,
                    )
                return MessageDeliveryResult(
                    success=False,
                    message_id=f"err_{now.timestamp()}",
                    recipient_phone=clean_phone,
                    channel="WHATSAPP_OFFICIAL",
                    delivered_at=now,
                    error_message=gateway_error or f"OpenWA sendFile returned {resp.status_code}: {resp.text}",
                )
        except Exception as exc:
            return MessageDeliveryResult(
                success=False,
                message_id=f"err_{now.timestamp()}",
                recipient_phone=clean_phone,
                channel="WHATSAPP_OFFICIAL",
                delivered_at=now,
                error_message=f"Could not deliver media via OpenWA: {gateway_error or str(exc)}",
            )

    async def send_reaction(self, message_id: str, reaction: str) -> bool:
        """Applies or clears an emoji reaction on a message via OpenWA."""
        await _throttle_outbound(min_interval=0.5)
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                session = await self._resolve_session(client)
                if session:
                    session_id = session.get("id")
                    url = f"{self.base_url}/api/sessions/{session_id}/messages/react"
                    resp = await client.post(url, json={"messageId": message_id, "reaction": reaction}, headers=self.headers)
                    if resp.status_code in (200, 201):
                        return True

                # Legacy fallback
                url = f"{self.base_url}/react"
                resp = await client.post(url, json={"messageId": message_id, "reaction": reaction}, headers=self.headers)
                return resp.status_code in (200, 201)
        except Exception:
            return False

    async def edit_message(self, message_id: str, new_text: str) -> bool:
        """Edits an existing message via OpenWA within allowable time window."""
        await _throttle_outbound(min_interval=0.5)
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                session = await self._resolve_session(client)
                if session:
                    session_id = session.get("id")
                    url = f"{self.base_url}/api/sessions/{session_id}/messages/edit"
                    resp = await client.post(url, json={"messageId": message_id, "text": new_text}, headers=self.headers)
                    if resp.status_code in (200, 201):
                        return True

                # Legacy fallback
                url = f"{self.base_url}/editMessage"
                resp = await client.post(url, json={"messageId": message_id, "text": new_text}, headers=self.headers)
                return resp.status_code in (200, 201)
        except Exception:
            return False

    async def get_chat_messages(
        self,
        chat_id: str,
        count: int = 50,
        session_name: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """
        Retrieves recent chat messages from OpenWA Gateway or legacy daemon.
        Attempts Gateway chat endpoints first, then falls back to daemon getChatMessages.
        """
        clean_chat_id = chat_id if "@" in chat_id else f"{format_phone_international(chat_id)}@c.us"

        def _extract_message_list(raw_data: Any) -> list[dict[str, Any]]:
            if isinstance(raw_data, list):
                return [m for m in raw_data if isinstance(m, dict)]
            if isinstance(raw_data, dict):
                for key in ("response", "data", "messages", "result"):
                    val = raw_data.get(key)
                    if isinstance(val, list):
                        return [m for m in val if isinstance(m, dict)]
            return []

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # 1. OpenWA Gateway
                session = await self._resolve_session(client, session_name=session_name)
                if session:
                    session_id = session.get("id")
                    # Try Gateway REST chats/:id/messages
                    urls_to_try = [
                        (f"{self.base_url}/api/sessions/{session_id}/chats/{clean_chat_id}/messages", {"limit": count}),
                        (f"{self.base_url}/api/sessions/{session_id}/messages", {"chatId": clean_chat_id, "limit": count}),
                    ]
                    for url, params in urls_to_try:
                        try:
                            resp = await client.get(url, params=params, headers=self.headers)
                            if resp.status_code == 200:
                                extracted = _extract_message_list(resp.json())
                                if extracted:
                                    return extracted
                        except Exception:
                            continue

                    # Try Gateway POST getChatMessages
                    try:
                        resp = await client.post(
                            f"{self.base_url}/api/sessions/{session_id}/getChatMessages",
                            json={"chatId": clean_chat_id, "count": count, "includeMe": True},
                            headers=self.headers,
                        )
                        if resp.status_code == 200:
                            extracted = _extract_message_list(resp.json())
                            if extracted:
                                return extracted
                    except Exception:
                        pass

                # 2. Legacy OpenWA daemon fallback
                try:
                    resp = await client.post(
                        f"{self.base_url}/getChatMessages",
                        json={"chatId": clean_chat_id, "count": count, "includeMe": True},
                        headers=self.headers,
                    )
                    if resp.status_code == 200:
                        extracted = _extract_message_list(resp.json())
                        if extracted:
                            return extracted
                except Exception:
                    pass

                try:
                    resp = await client.post(
                        f"{self.base_url}/getAllMessagesInChat",
                        json={"chatId": clean_chat_id, "includeMe": True, "limit": count},
                        headers=self.headers,
                    )
                    if resp.status_code == 200:
                        return _extract_message_list(resp.json())
                except Exception:
                    pass

        except Exception:
            pass

        return []

