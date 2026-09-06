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
    HTTP Client interacting with headless OpenWA Docker container for official org broadcasts.
    """

    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None):
        self.base_url = (base_url or settings.OPENWA_API_URL).rstrip("/")
        self.api_key = api_key or settings.OPENWA_API_KEY
        self.headers = {}
        if self.api_key:
            self.headers["api_key"] = self.api_key

    async def get_status(self) -> dict:
        """
        Polls OpenWA status endpoint to inspect daemon connectivity, QR state, or live session.
        """
        url = f"{self.base_url}/getConnectionState"
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(url, headers=self.headers)
                if resp.status_code == 200:
                    state = resp.json().get("state", "UNKNOWN")
                    # If connected, fetch host info
                    phone_number = None
                    if state == "CONNECTED":
                        try:
                            me_resp = await client.get(f"{self.base_url}/getMe", headers=self.headers)
                            if me_resp.status_code == 200:
                                phone_number = me_resp.json().get("id", {}).get("user")
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
            "configured": True,
            "status": "DISCONNECTED",
            "phone_number": None,
            "battery": None,
            "qr_code": None,
        }

    async def get_qr(self) -> Optional[str]:
        """Fetches current QR string / base64 image if container requires authentication."""
        url = f"{self.base_url}/getQrCode"
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(url, headers=self.headers)
                if resp.status_code == 200:
                    return resp.json().get("qr")
        except Exception:
            pass
        return None

    async def send_message(self, message: OutgoingMessage) -> MessageDeliveryResult:
        """
        Sends an official message via OpenWA /sendText endpoint.
        Falls back cleanly if container is disconnected.
        """
        clean_phone = format_phone_international(message.recipient_phone)
        chat_id = f"{clean_phone}@c.us"
        url = f"{self.base_url}/sendText"
        payload = {
            "chatId": chat_id,
            "text": message.content,
        }

        now = datetime.now(timezone.utc)
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(url, json=payload, headers=self.headers)
                if resp.status_code in (200, 201):
                    msg_id = resp.json().get("id", f"openwa_{now.timestamp()}")
                    return MessageDeliveryResult(
                        success=True,
                        message_id=msg_id,
                        recipient_phone=clean_phone,
                        channel="WHATSAPP_OFFICIAL",
                        delivered_at=now,
                    )
                else:
                    return MessageDeliveryResult(
                        success=False,
                        message_id=f"err_{now.timestamp()}",
                        recipient_phone=clean_phone,
                        channel="WHATSAPP_OFFICIAL",
                        delivered_at=now,
                        error_message=f"OpenWA returned {resp.status_code}: {resp.text}",
                    )
        except Exception as exc:
            return MessageDeliveryResult(
                success=False,
                message_id=f"err_{now.timestamp()}",
                recipient_phone=clean_phone,
                channel="WHATSAPP_OFFICIAL",
                delivered_at=now,
                error_message=f"Could not reach OpenWA container: {str(exc)}",
            )

    async def send_batch(self, messages: list[OutgoingMessage]) -> list[MessageDeliveryResult]:
        results = []
        for msg in messages:
            res = await self.send_message(msg)
            results.append(res)
        return results
