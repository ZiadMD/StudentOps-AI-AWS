"""
OpenWA Provider for StudentOps AI.
Integrates with headless OpenWA Docker container for official organization notifications,
and provides zero-trust wa.me deep links for personal HR follow-ups.
"""
from typing import Optional
from datetime import datetime, timezone
import urllib.parse
import re
import httpx

from app.core.config import settings
from app.providers.messaging_provider import (
    MessagingProvider,
    OutgoingMessage,
    MessageDeliveryResult,
)


def format_phone_international(phone: str) -> str:
    """Sanitizes phone numbers into international digits-only format (defaults to Egypt +20)."""
    digits = re.sub(r"\D", "", phone)
    if not digits:
        return ""
    if digits.startswith("00"):
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        # Egyptian mobile format: 010..., 011..., 012..., 015...
        digits = "20" + digits[1:]
    elif len(digits) == 10 and digits.startswith("1"):
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

    async def _resolve_session(self, client: httpx.AsyncClient) -> Optional[dict]:
        """
        Resolves the active OpenWA session from OpenWA Gateway /api/sessions.
        Selects preferred session by ID or name, falls back to first ready session.
        Auto-creates a session if no sessions exist.
        """
        url = f"{self.base_url}/api/sessions"
        try:
            resp = await client.get(url, headers=self.headers, timeout=4.0)
            if resp.status_code == 200:
                sessions = resp.json()
                if isinstance(sessions, list) and len(sessions) > 0:
                    pref = self.session_id_preference
                    if pref:
                        # Exact ID or name match
                        for s in sessions:
                            if s.get("id") == pref or s.get("name") == pref:
                                return s

                    # Prefer any ready session
                    for s in sessions:
                        if s.get("status") == "ready":
                            return s

                    # Return the first session
                    return sessions[0]

                # List is empty: auto-create ops-official session
                create_name = re.sub(r"[^a-zA-Z0-9\-]", "-", self.session_id_preference or "ops-official").strip("-")
                if len(create_name) < 3:
                    create_name = "ops-official"
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

    async def get_status(self) -> dict:
        """
        Polls OpenWA status endpoint to inspect daemon connectivity, QR state, or live session.
        Works seamlessly with both OpenWA Gateway (/api/sessions) and legacy endpoints.
        """
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                # 1. Try OpenWA Gateway (/api/sessions)
                session = await self._resolve_session(client)
                if session:
                    raw_status = (session.get("status") or "disconnected").lower()
                    if raw_status == "ready":
                        status_str = "CONNECTED"
                    elif raw_status in ("qr_ready", "authenticating", "initializing", "created", "action_required"):
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
                                qr_code = qr_res.json().get("qrCode")
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
        except Exception:
            pass

        return {
            "configured": bool(settings.OPENWA_OFFICIAL_PHONE or settings.OPENWA_API_URL),
            "status": "DISCONNECTED",
            "phone_number": settings.OPENWA_OFFICIAL_PHONE,
            "battery": None,
            "qr_code": None,
        }

    async def get_qr(self) -> Optional[str]:
        """Fetches current QR string / data URL image if session requires authentication."""
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                # 1. OpenWA Gateway (/api/sessions/:id/qr)
                session = await self._resolve_session(client)
                if session:
                    if session.get("status") == "ready":
                        return None
                    qr_res = await client.get(
                        f"{self.base_url}/api/sessions/{session['id']}/qr",
                        headers=self.headers,
                        timeout=3.0,
                    )
                    if qr_res.status_code == 200:
                        return qr_res.json().get("qrCode")
                    return None

                # 2. Legacy OpenWA daemon (/getQrCode)
                resp = await client.get(f"{self.base_url}/getQrCode", headers=self.headers)
                if resp.status_code == 200:
                    return resp.json().get("qr")
        except Exception:
            pass
        return None

    async def send_message(self, message: OutgoingMessage) -> MessageDeliveryResult:
        """
        Sends an official message via OpenWA Gateway or legacy daemon.
        Falls back cleanly if container is disconnected.
        """
        clean_phone = format_phone_international(message.recipient_phone)
        chat_id = f"{clean_phone}@c.us"
        now = datetime.now(timezone.utc)
        gateway_error = None

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # 1. Try OpenWA Gateway
                session = await self._resolve_session(client)
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
                        msg_id = res_data.get("id", res_data.get("messageId", f"openwa_{now.timestamp()}"))
                        return MessageDeliveryResult(
                            success=True,
                            message_id=str(msg_id),
                            recipient_phone=clean_phone,
                            channel="WHATSAPP_OFFICIAL",
                            delivered_at=now,
                        )
                    elif resp.status_code == 409:
                        return MessageDeliveryResult(
                            success=False,
                            message_id=f"err_{now.timestamp()}",
                            recipient_phone=clean_phone,
                            channel="WHATSAPP_OFFICIAL",
                            delivered_at=now,
                            error_message="WhatsApp session is reloading or reconnecting. Please retry shortly.",
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
                    msg_id = resp.json().get("id", f"openwa_{now.timestamp()}")
                    return MessageDeliveryResult(
                        success=True,
                        message_id=str(msg_id),
                        recipient_phone=clean_phone,
                        channel="WHATSAPP_OFFICIAL",
                        delivered_at=now,
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
                    )
        except Exception as exc:
            return MessageDeliveryResult(
                success=False,
                message_id=f"err_{now.timestamp()}",
                recipient_phone=clean_phone,
                channel="WHATSAPP_OFFICIAL",
                delivered_at=now,
                error_message=f"Could not reach OpenWA service: {gateway_error or str(exc)}",
            )

    async def send_batch(self, messages: list[OutgoingMessage]) -> list[MessageDeliveryResult]:
        results = []
        for msg in messages:
            res = await self.send_message(msg)
            results.append(res)
        return results
