"""Dedicated WhatsApp test agent and pywhatkit sending tool."""
import asyncio
import logging
import re
from typing import Any

from app.core.config import settings

try:
    import pywhatkit
except ImportError:
    pywhatkit = None


logger = logging.getLogger("studentops.whatsapp")


def normalize_phone_number(phone_number: str) -> str:
    """Normalize an international phone number to a plus-prefixed digit string."""
    value = re.sub(r"[\s().-]", "", phone_number.strip())
    if value.startswith("00"):
        value = "+" + value[2:]
    elif not value.startswith("+"):
        value = "+" + value

    digits = value[1:]
    if not re.fullmatch(r"[1-9]\d{7,14}", digits):
        raise ValueError("Enter a valid international phone number, including its country code.")
    return f"+{digits}"


def send_whatsapp_message(phone_number: str, message: str) -> dict[str, Any]:
    """Send one WhatsApp message through the currently logged-in WhatsApp Web session."""
    recipient = phone_number.strip()
    try:
        recipient = normalize_phone_number(phone_number)
        content = message.strip()
        if not content:
            raise ValueError("Message cannot be empty.")
        if pywhatkit is None:
            raise RuntimeError("pywhatkit is not installed. Install it with 'uv add pywhatkit'.")

        logger.info("[WhatsAppTool] Calling pywhatkit")
        pywhatkit.sendwhatmsg_instantly(
            recipient,
            content,
            wait_time=settings.WHATSAPP_WAIT_TIME,
            tab_close=settings.WHATSAPP_TAB_CLOSE,
        )
        logger.info("[WhatsAppTool] pywhatkit returned")
        return {"success": True, "recipient": recipient, "message": content, "status": "sent"}
    except Exception as exc:
        logger.exception("[WhatsAppTool] pywhatkit failed")
        return {"success": False, "recipient": recipient, "status": "failed", "error": str(exc)}


async def run_whatsapp_agent(phone_number: str, message: str) -> dict[str, Any]:
    """Run the test agent with explicit user inputs and a non-blocking tool call."""
    logger.info("[WhatsAppAgent] Starting")
    logger.info("[WhatsAppAgent] Tool invocation started")
    result = await asyncio.to_thread(send_whatsapp_message, phone_number, message)
    if result["success"]:
        logger.info("[WhatsAppAgent] Message sent successfully")
    return result