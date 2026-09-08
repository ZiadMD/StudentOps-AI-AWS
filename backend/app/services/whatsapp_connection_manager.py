"""
WhatsApp WebSocket Connection Manager.
Maintains active real-time socket connections scoped per HR Member / User.
Pushes incoming messages, delivery/read receipts, reactions, and session health updates.
"""
from typing import Optional, Any
import json
import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WhatsAppConnectionManager:
    """
    Manages active WebSocket sessions mapped by user_id.
    Allows multiple tabs/windows for the same HR Member.
    """

    def __init__(self):
        # Maps user_id -> set of active WebSockets
        self.active_connections: dict[str, set[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        """Accepts and registers a new WebSocket connection for a user."""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        logger.info("WhatsApp WS connected: user_id=%s (active tabs: %d)", user_id, len(self.active_connections[user_id]))

    def disconnect(self, user_id: str, websocket: WebSocket):
        """Unregisters a closed WebSocket connection."""
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info("WhatsApp WS disconnected: user_id=%s", user_id)

    async def send_to_user(self, user_id: str, event_type: str, data: Any):
        """Pushes an event payload to all open sockets for a specific user."""
        if user_id not in self.active_connections:
            return

        payload = {
            "type": event_type,
            "data": data,
        }
        dead_sockets = set()
        for ws in self.active_connections[user_id]:
            try:
                await ws.send_json(payload)
            except Exception as exc:
                logger.warning("Failed to push WS message to user %s: %s", user_id, exc)
                dead_sockets.add(ws)

        for ws in dead_sockets:
            self.disconnect(user_id, ws)

    async def broadcast_to_users(self, user_ids: list[str], event_type: str, data: Any):
        """Pushes an event to multiple users (e.g. HR Member + Committee Leader oversight)."""
        for uid in user_ids:
            await self.send_to_user(uid, event_type, data)

    async def broadcast_all(self, event_type: str, data: Any):
        """Broadcasts system-wide (e.g. OpenWA daemon connectivity change)."""
        payload = {
            "type": event_type,
            "data": data,
        }
        for uid, sockets in list(self.active_connections.items()):
            dead_sockets = set()
            for ws in sockets:
                try:
                    await ws.send_json(payload)
                except Exception:
                    dead_sockets.add(ws)
            for ws in dead_sockets:
                self.disconnect(uid, ws)


# Global singleton manager
ws_manager = WhatsAppConnectionManager()
