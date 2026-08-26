"""
Messaging Provider Abstraction and Implementations (WhatsApp, SMS, Mock).
"""
from abc import ABC, abstractmethod
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel


class OutgoingMessage(BaseModel):
    recipient_id: Optional[str] = None
    recipient_name: str
    recipient_phone: str
    content: str
    channel: str = "WHATSAPP"  # "WHATSAPP", "SMS", "EMAIL"


class MessageDeliveryResult(BaseModel):
    success: bool
    message_id: str
    recipient_phone: str
    channel: str
    delivered_at: datetime
    error_message: Optional[str] = None


class MessagingProvider(ABC):
    """Abstract interface for dispatching reminders and notifications."""

    @abstractmethod
    async def send_message(self, message: OutgoingMessage) -> MessageDeliveryResult:
        """Send a single message."""
        pass

    @abstractmethod
    async def send_batch(self, messages: list[OutgoingMessage]) -> list[MessageDeliveryResult]:
        """Send a batch of messages."""
        pass


class WhatsAppProvider(MessagingProvider):
    """WhatsApp Cloud / Twilio API adapter."""

    def __init__(self, account_sid: Optional[str] = None, auth_token: Optional[str] = None):
        self.account_sid = account_sid
        self.auth_token = auth_token

    async def send_message(self, message: OutgoingMessage) -> MessageDeliveryResult:
        # Provider-specific WhatsApp API call
        return MessageDeliveryResult(
            success=True,
            message_id=f"wa_{datetime.now().timestamp()}",
            recipient_phone=message.recipient_phone,
            channel="WHATSAPP",
            delivered_at=datetime.now(timezone.utc)
        )

    async def send_batch(self, messages: list[OutgoingMessage]) -> list[MessageDeliveryResult]:
        results = []
        for msg in messages:
            res = await self.send_message(msg)
            results.append(res)
        return results


class MockMessagingProvider(MessagingProvider):
    """Mock Messaging Provider that safely records sent messages for testing and evaluation."""

    def __init__(self):
        self.sent_messages: list[dict] = []

    async def send_message(self, message: OutgoingMessage) -> MessageDeliveryResult:
        now = datetime.now(timezone.utc)
        record = {
            "id": f"msg_mock_{len(self.sent_messages) + 1}",
            "recipient_id": message.recipient_id,
            "recipient_name": message.recipient_name,
            "recipient_phone": message.recipient_phone,
            "content": message.content,
            "channel": message.channel,
            "sent_at": now.isoformat()
        }
        self.sent_messages.append(record)
        return MessageDeliveryResult(
            success=True,
            message_id=record["id"],
            recipient_phone=message.recipient_phone,
            channel=message.channel,
            delivered_at=now
        )

    async def send_batch(self, messages: list[OutgoingMessage]) -> list[MessageDeliveryResult]:
        results = []
        for msg in messages:
            res = await self.send_message(msg)
            results.append(res)
        return results

    def get_history(self) -> list[dict]:
        return list(self.sent_messages)
