"""
WhatsApp Business Logic and Deterministic Access Boundary Service.
Enforces strict server-side student-to-HR isolation, manages chat history,
routes incoming webhooks from OpenWA, and coordinates real-time WebSocket delivery.
"""
from typing import Optional, Any
import uuid
import json
import logging
from datetime import datetime, timezone
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, desc, func

from app.models.entities import Student, User, WhatsAppChatMessage, utcnow
from app.models.schemas import (
    WhatsAppMessageResponse,
    WhatsAppThreadSummary,
    WhatsAppSyncResponse,
)
from app.providers.openwa_provider import (
    OpenWAProvider,
    format_phone_international,
    OutgoingMessage,
)
from app.services.whatsapp_connection_manager import ws_manager
from app.core.config import settings

logger = logging.getLogger(__name__)


def sanitize_media_url(url: Optional[str]) -> Optional[str]:
    """Sanitize media URL to prevent stored XSS (e.g. javascript: schemes)."""
    if not url:
        return None
    trimmed = str(url).strip()
    lower = trimmed.lower()
    if lower.startswith("javascript:") or lower.startswith("vbscript:") or lower.startswith("file:"):
        return None
    if (
        lower.startswith("http://")
        or lower.startswith("https://")
        or lower.startswith("data:image/")
        or lower.startswith("data:video/")
        or lower.startswith("data:audio/")
        or lower.startswith("data:application/pdf")
        or trimmed.startswith("/")
    ):
        return trimmed
    return None


class WhatsAppService:

    @staticmethod
    def _parse_reactions(reactions_raw: Optional[str]) -> list[dict[str, Any]]:
        if not reactions_raw:
            return []
        try:
            parsed = json.loads(reactions_raw)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []

    @classmethod
    def _message_to_response(cls, msg: WhatsAppChatMessage) -> WhatsAppMessageResponse:
        return WhatsAppMessageResponse(
            id=msg.id,
            openwa_message_id=msg.openwa_message_id,
            student_id=msg.student_id,
            assigned_hr_id=msg.assigned_hr_id,
            sender_type=msg.sender_type,
            sender_id=msg.sender_id,
            sender_phone=msg.sender_phone,
            recipient_phone=msg.recipient_phone,
            message_type=msg.message_type or "text",
            content=msg.content,
            media_url=msg.media_url,
            media_filename=msg.media_filename,
            media_mimetype=msg.media_mimetype,
            status=msg.status,
            ack_status=msg.ack_status or 0,
            reply_to_message_id=msg.reply_to_message_id,
            is_edited=bool(msg.is_edited),
            reactions=cls._parse_reactions(msg.reactions),
            created_at=msg.created_at,
            delivered_at=msg.delivered_at,
            read_at=msg.read_at,
        )

    @classmethod
    async def get_authorized_threads(
        cls,
        current_user: User,
        db: AsyncSession,
        oversight: bool = False,
    ) -> list[WhatsAppThreadSummary]:
        """
        Retrieves member conversation threads scoped to the user's role:
        - committee_hr_member: ONLY students currently assigned to this HR member.
        - committee_hr_leader: assigned students by default, or all committee students if oversight=True.
        - region_hr_head / hr_admin: assigned students, or all organization students if oversight=True.
        """
        query = select(Student)

        if current_user.role == "committee_hr_member":
            # Strict boundary: only assigned students
            query = query.where(Student.assigned_hr_id == current_user.id)
        elif current_user.role in ("committee_hr_leader", "committee_head", "team_lead"):
            if oversight:
                query = query.where(Student.team_id == current_user.team_id)
            else:
                query = query.where(
                    or_(
                        Student.assigned_hr_id == current_user.id,
                        and_(Student.team_id == current_user.team_id, Student.assigned_hr_id.is_(None))
                    )
                )
        elif current_user.role in ("region_hr_head", "hr_admin"):
            if not oversight:
                # If they have explicitly assigned members, prefer them, else all
                assigned_count_res = await db.execute(
                    select(Student.id).where(Student.assigned_hr_id == current_user.id).limit(1)
                )
                if assigned_count_res.scalar_one_or_none():
                    query = query.where(Student.assigned_hr_id == current_user.id)
        else:
            # Regular members have no HR chat window
            return []

        students_res = await db.execute(query.order_by(Student.full_name))
        students = students_res.scalars().all()
        if not students:
            return []

        student_ids = [s.id for s in students]

        # 1. Batch fetch latest message for each student using window function
        subq = (
            select(
                WhatsAppChatMessage.id,
                func.row_number().over(
                    partition_by=WhatsAppChatMessage.student_id,
                    order_by=desc(WhatsAppChatMessage.created_at)
                ).label("rn")
            )
            .where(WhatsAppChatMessage.student_id.in_(student_ids))
            .subquery()
        )
        latest_msgs_res = await db.execute(
            select(WhatsAppChatMessage)
            .join(subq, WhatsAppChatMessage.id == subq.c.id)
            .where(subq.c.rn == 1)
        )
        latest_messages = {m.student_id: m for m in latest_msgs_res.scalars().all()}

        # 2. Batch fetch unread counts grouped by student
        unread_res = await db.execute(
            select(WhatsAppChatMessage.student_id, func.count(WhatsAppChatMessage.id))
            .where(
                WhatsAppChatMessage.student_id.in_(student_ids),
                WhatsAppChatMessage.sender_type == "STUDENT",
                WhatsAppChatMessage.status != "read"
            )
            .group_by(WhatsAppChatMessage.student_id)
        )
        unread_counts = dict(unread_res.all())

        # 3. Batch resolve assigned HR names
        assigned_hr_ids = list({s.assigned_hr_id for s in students if s.assigned_hr_id})
        hr_names: dict[str, str] = {}
        if assigned_hr_ids:
            hr_users_res = await db.execute(
                select(User.id, User.full_name).where(User.id.in_(assigned_hr_ids))
            )
            hr_names = dict(hr_users_res.all())

        threads = []
        for s in students:
            last_msg = latest_messages.get(s.id)
            unread_count = unread_counts.get(s.id, 0)
            hr_name = hr_names.get(s.assigned_hr_id)

            threads.append(
                WhatsAppThreadSummary(
                    student_id=s.id,
                    student_code=s.student_code or "",
                    full_name=s.full_name,
                    arabic_name=s.arabic_name,
                    phone=s.phone,
                    team_id=s.team_id,
                    assigned_hr_id=s.assigned_hr_id,
                    assigned_hr_name=hr_name,
                    last_message=cls._message_to_response(last_msg) if last_msg else None,
                    unread_count=unread_count,
                    status=s.status or "ACTIVE",
                )
            )

        # Sort threads with recent messages first
        threads.sort(
            key=lambda t: (
                t.last_message.created_at.timestamp() if t.last_message and t.last_message.created_at else 0
            ),
            reverse=True,
        )
        return threads

    @classmethod
    async def verify_chat_access(
        cls,
        student_id: str,
        current_user: User,
        db: AsyncSession,
    ) -> Student:
        """
        Hard security boundary:
        Delegates to centralized verify_student_access with mode='chat'.
        """
        from app.core.dependencies import verify_student_access
        return await verify_student_access(student_id, current_user, db, mode="chat")

    @classmethod
    async def get_thread_messages(
        cls,
        student_id: str,
        current_user: User,
        db: AsyncSession,
    ) -> list[WhatsAppMessageResponse]:
        """
        Retrieves complete conversation history for a student thread (Option A: full history transfers on reassignment).
        Marks unread student messages as read.
        """
        await cls.verify_chat_access(student_id, current_user, db)

        msgs_res = await db.execute(
            select(WhatsAppChatMessage)
            .where(WhatsAppChatMessage.student_id == student_id)
            .order_by(WhatsAppChatMessage.created_at.asc())
        )
        messages = msgs_res.scalars().all()

        # Mark unread incoming messages as read
        now = utcnow()
        updated_any = False
        for m in messages:
            if m.sender_type == "STUDENT" and m.status != "read":
                m.status = "read"
                m.ack_status = 3
                m.read_at = now
                updated_any = True

        if updated_any:
            await db.commit()

        return [cls._message_to_response(m) for m in messages]

    @classmethod
    async def send_outgoing_message(
        cls,
        student_id: str,
        current_user: User,
        content: str,
        reply_to_message_id: Optional[str],
        db: AsyncSession,
        openwa: OpenWAProvider,
        message_type: str = "text",
        media_url: Optional[str] = None,
        media_filename: Optional[str] = None,
        media_mimetype: Optional[str] = None,
    ) -> WhatsAppMessageResponse:
        """
        Sends an outgoing message from HR Member to an assigned student.
        Enforces server-side assignment verification before invoking OpenWA API.
        """
        student = await cls.verify_chat_access(student_id, current_user, db)

        clean_recipient = format_phone_international(student.phone)
        official_phone = settings.OPENWA_OFFICIAL_PHONE or "+201000000000"
        msg_id = f"cmsg_{uuid.uuid4().hex[:12]}"
        now = utcnow()

        # 1. Create message in DB as pending
        chat_msg = WhatsAppChatMessage(
            id=msg_id,
            openwa_message_id=None,
            student_id=student.id,
            assigned_hr_id=student.assigned_hr_id or current_user.id,
            sender_type="HR",
            sender_id=current_user.id,
            sender_phone=official_phone,
            recipient_phone=clean_recipient,
            message_type=message_type,
            content=content,
            media_url=media_url,
            media_filename=media_filename,
            media_mimetype=media_mimetype,
            status="pending",
            ack_status=0,
            reply_to_message_id=reply_to_message_id,
            is_edited=False,
            reactions="[]",
            created_at=now,
        )
        db.add(chat_msg)
        await db.commit()
        await db.refresh(chat_msg)

        # 2. Call OpenWA send endpoint
        if message_type in ("image", "video", "document", "audio") and media_url:
            delivery = await openwa.send_media_message(
                recipient_phone=clean_recipient,
                file_base64_or_url=media_url,
                filename=media_filename or "attachment",
                mimetype=media_mimetype or "application/octet-stream",
                caption=content if content and content != media_filename else None,
            )
        else:
            outgoing = OutgoingMessage(
                recipient_name=student.full_name,
                recipient_phone=clean_recipient,
                content=content,
                channel="WHATSAPP_OFFICIAL",
            )
            delivery = await openwa.send_message(outgoing)

        # 3. Update status based on OpenWA delivery result
        if delivery.success:
            chat_msg.status = "sent"
            chat_msg.ack_status = 1
            chat_msg.openwa_message_id = delivery.message_id
            chat_msg.delivered_at = delivery.delivered_at or utcnow()
        else:
            chat_msg.status = "failed"
            logger.warning("OpenWA message delivery failed for student %s: %s", student.id, delivery.error_message)

        await db.commit()
        await db.refresh(chat_msg)

        # 4. Broadcast live update to current user and oversight
        resp = cls._message_to_response(chat_msg)
        await ws_manager.send_to_user(current_user.id, "message_sent", resp.model_dump(mode="json"))

        return resp

    @classmethod
    async def add_reaction(
        cls,
        student_id: str,
        message_id: str,
        reaction: str,
        current_user: User,
        db: AsyncSession,
        openwa: OpenWAProvider,
    ) -> WhatsAppMessageResponse:
        """Applies or toggles an emoji reaction on a message."""
        await cls.verify_chat_access(student_id, current_user, db)

        msg = await db.get(WhatsAppChatMessage, message_id)
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found")

        reactions = cls._parse_reactions(msg.reactions)
        # Filter existing reaction from this user if already reacted
        reactions = [r for r in reactions if r.get("user_id") != current_user.id]
        if reaction.strip():
            reactions.append({
                "emoji": reaction.strip(),
                "from": "hr",
                "user_id": current_user.id,
            })

        msg.reactions = json.dumps(reactions)
        await db.commit()
        await db.refresh(msg)

        if msg.openwa_message_id:
            await openwa.send_reaction(msg.openwa_message_id, reaction.strip())

        resp = cls._message_to_response(msg)
        # Push to sender / HR
        if msg.assigned_hr_id:
            await ws_manager.send_to_user(msg.assigned_hr_id, "message_reaction", resp.model_dump(mode="json"))
        return resp

    @classmethod
    async def edit_message(
        cls,
        student_id: str,
        message_id: str,
        new_content: str,
        current_user: User,
        db: AsyncSession,
        openwa: OpenWAProvider,
    ) -> WhatsAppMessageResponse:
        """Edits an outgoing HR message."""
        await cls.verify_chat_access(student_id, current_user, db)

        msg = await db.get(WhatsAppChatMessage, message_id)
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found")
        if msg.sender_type != "HR":
            raise HTTPException(status_code=400, detail="Cannot edit student messages")

        msg.content = new_content
        msg.is_edited = True
        await db.commit()
        await db.refresh(msg)

        if msg.openwa_message_id:
            await openwa.edit_message(msg.openwa_message_id, new_content)

        resp = cls._message_to_response(msg)
        if msg.assigned_hr_id:
            await ws_manager.send_to_user(msg.assigned_hr_id, "message_edited", resp.model_dump(mode="json"))
        return resp

    @classmethod
    async def handle_webhook_event(
        cls,
        payload: dict[str, Any],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """
        Ingests OpenWA webhook events:
        - Resolves sender / recipient phone -> assigned Student.
        - Supports directional resolution: fromMe=True handles external device / WhatsApp Web messages.
        - Resolves Student -> assigned HR Member.
        - Persists message / ack / reaction / edit in DB.
        - Pushes real-time event to that HR Member's connected socket session.
        """
        event_name = (payload.get("event") or payload.get("type") or "").lower()
        data = payload.get("data") or payload

        # 1. Handle Message Status / Ack (onAck / message.ack / ack)
        if "ack" in event_name or ("ack" in data and "body" not in data and "text" not in data):
            target_id = str(data.get("id") or data.get("messageId") or "")
            ack_val = data.get("ack", 1)  # 1: sent, 2: delivered, 3: read
            if target_id:
                res = await db.execute(
                    select(WhatsAppChatMessage).where(
                        or_(
                            WhatsAppChatMessage.openwa_message_id == target_id,
                            WhatsAppChatMessage.id == target_id,
                        )
                    )
                )
                msg = res.scalar_one_or_none()
                if msg:
                    msg.ack_status = max(msg.ack_status or 0, int(ack_val))
                    if ack_val == 2 and not msg.delivered_at:
                        msg.delivered_at = utcnow()
                        msg.status = "delivered"
                    elif ack_val == 3:
                        msg.read_at = utcnow()
                        msg.status = "read"
                    await db.commit()
                    await db.refresh(msg)

                    resp = cls._message_to_response(msg)
                    if msg.assigned_hr_id:
                        await ws_manager.send_to_user(msg.assigned_hr_id, "message_ack", resp.model_dump(mode="json"))
                    logger.info("WhatsApp webhook: ack updated msg_id=%s openwa_id=%s ack=%s", msg.id, target_id, ack_val)
                    return {"status": "ack_updated", "message_id": msg.id, "ack": ack_val}
            return {"status": "ignored", "reason": "Ack event missing target id"}

        # 2. Handle Messages (onMessage / onAnyMessage / message / message_create / message.received)
        elif (
            "message" in event_name
            or event_name in ("onmessage", "onanymessage", "message.received", "message_create")
            or ("from" in data and ("body" in data or "text" in data or "caption" in data))
        ):
            # Guard against group messages
            chat_id_raw = str(data.get("chatId") or data.get("from") or data.get("to") or "")
            if "@g.us" in chat_id_raw or data.get("isGroupMsg") or data.get("chat", {}).get("isGroup"):
                logger.info("WhatsApp webhook: group message dropped chatId=%s", chat_id_raw)
                return {"status": "ignored", "reason": "Group messages not supported"}

            # Determine direction: fromMe=True indicates message sent from connected device / WhatsApp Web
            from_me = bool(
                data.get("fromMe")
                or payload.get("fromMe")
                or str(data.get("id", "")).startswith("true_")
            )

            if from_me:
                raw_target = str(data.get("to") or data.get("chatId") or data.get("chat", {}).get("id") or "")
                clean_digits = format_phone_international(raw_target)
                raw_sender = str(data.get("from") or settings.OPENWA_OFFICIAL_PHONE or "+201000000000")
            else:
                raw_sender = str(data.get("from") or data.get("sender", {}).get("id") or data.get("chatId") or "")
                clean_digits = format_phone_international(raw_sender)

            if not clean_digits:
                logger.warning("WhatsApp webhook dropped: unable to parse phone number from payload data=%s", data)
                return {"status": "ignored", "reason": "No valid phone number found"}

            # Match student by normalized phone number
            st_res = await db.execute(select(Student))
            matches = [
                candidate for candidate in st_res.scalars().all()
                if format_phone_international(candidate.phone) == clean_digits
            ]

            if len(matches) > 1:
                logger.error(
                    "WhatsApp webhook: ambiguous student match for phone %s (%d candidates found), failing closed",
                    clean_digits, len(matches)
                )

            student = matches[0] if len(matches) == 1 else None

            if not student:
                logger.warning(
                    "WhatsApp webhook: unregistered or ambiguous phone %s (fromMe=%s, event=%s)",
                    clean_digits, from_me, event_name
                )
                return {
                    "status": "unregistered_sender" if not from_me else "unregistered_recipient",
                    "phone": clean_digits,
                }

            assigned_hr_id = student.assigned_hr_id
            openwa_id = str(data.get("id") or f"openwa_{uuid.uuid4().hex[:8]}")

            # Check deduplication
            dup_res = await db.execute(
                select(WhatsAppChatMessage).where(WhatsAppChatMessage.openwa_message_id == openwa_id)
            )
            existing_msg = dup_res.scalar_one_or_none()
            if existing_msg:
                logger.info("WhatsApp webhook: duplicate message skipped openwa_id=%s", openwa_id)
                # Reconcile ack if newer
                ack_val = data.get("ack")
                if ack_val and int(ack_val) > (existing_msg.ack_status or 0):
                    existing_msg.ack_status = int(ack_val)
                    if int(ack_val) == 2 and not existing_msg.delivered_at:
                        existing_msg.delivered_at = utcnow()
                        existing_msg.status = "delivered"
                    elif int(ack_val) == 3 and not existing_msg.read_at:
                        existing_msg.read_at = utcnow()
                        existing_msg.status = "read"
                    await db.commit()
                return {"status": "duplicate_skipped", "message_id": existing_msg.id}

            content = data.get("body") or data.get("text") or data.get("caption") or ""
            raw_msg_type = str(data.get("type") or "text").lower()
            msg_type = "audio" if raw_msg_type == "ptt" else (
                raw_msg_type if raw_msg_type in ("image", "video", "document", "audio") else "text"
            )
            media_url = data.get("url") or data.get("deprecatedMmsUrl") or data.get("mediaUrl")
            mimetype = data.get("mimetype")
            filename = data.get("filename")

            ts = data.get("timestamp") or data.get("t")
            msg_time = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else utcnow()

            sender_type = "HR" if from_me else "STUDENT"
            sender_id = assigned_hr_id if from_me else student.id
            sender_phone = (
                format_phone_international(raw_sender) or settings.OPENWA_OFFICIAL_PHONE or "+201000000000"
            ) if from_me else clean_digits
            recipient_phone = clean_digits if from_me else (settings.OPENWA_OFFICIAL_PHONE or "+201000000000")
            status_val = "sent" if from_me else "delivered"
            ack_val = int(data.get("ack", 1 if from_me else 2))

            new_msg = WhatsAppChatMessage(
                id=f"cmsg_{uuid.uuid4().hex[:12]}",
                openwa_message_id=openwa_id,
                student_id=student.id,
                assigned_hr_id=assigned_hr_id,
                sender_type=sender_type,
                sender_id=sender_id,
                sender_phone=sender_phone,
                recipient_phone=recipient_phone,
                message_type=msg_type,
                content=content,
                media_url=sanitize_media_url(media_url),
                media_filename=filename,
                media_mimetype=mimetype,
                status=status_val,
                ack_status=ack_val,
                reactions="[]",
                raw_payload=json.dumps(data) if isinstance(data, dict) else None,
                created_at=msg_time,
                delivered_at=msg_time if ack_val >= 2 else None,
                read_at=msg_time if ack_val >= 3 else None,
            )
            db.add(new_msg)
            await db.commit()
            await db.refresh(new_msg)

            logger.info(
                "WhatsApp webhook: persisted message id=%s openwa_id=%s student_id=%s sender_type=%s from_me=%s",
                new_msg.id, openwa_id, student.id, sender_type, from_me
            )

            # Broadcast real-time WebSocket update
            resp = cls._message_to_response(new_msg)
            event_ws_type = "message_sent" if from_me else "incoming_message"

            if assigned_hr_id:
                await ws_manager.send_to_user(assigned_hr_id, event_ws_type, resp.model_dump(mode="json"))
            else:
                leaders_res = await db.execute(
                    select(User.id).where(
                        User.team_id == student.team_id,
                        User.role.in_(["committee_hr_leader", "committee_head", "team_lead"])
                    )
                )
                leader_ids = list(leaders_res.scalars().all())
                await ws_manager.broadcast_to_users(
                    leader_ids, f"unassigned_{event_ws_type}", resp.model_dump(mode="json")
                )

            return {
                "status": "success",
                "message_id": new_msg.id,
                "student_id": student.id,
                "sender_type": sender_type,
            }

        return {"status": "unhandled_event", "event": event_name}

    @classmethod
    async def sync_chat_messages(
        cls,
        student_id: str,
        current_user: User,
        db: AsyncSession,
        openwa: OpenWAProvider,
        limit: int = 50,
    ) -> WhatsAppSyncResponse:
        """
        On-demand catch-up synchronization:
        Pulls recent messages from OpenWA, reconciles with database via openwa_message_id deduplication,
        updates status/acks, persists new messages, broadcasts WebSocket events, and returns updated thread history.
        """
        student = await cls.verify_chat_access(student_id, current_user, db)
        clean_phone = format_phone_international(student.phone)
        chat_id = f"{clean_phone}@c.us"

        logger.info(
            "WhatsApp sync started for student %s (phone=%s, limit=%d) by user %s",
            student.id, clean_phone, limit, current_user.id
        )

        raw_messages = await openwa.get_chat_messages(chat_id=chat_id, count=limit)

        new_count = 0
        updated_count = 0
        now = utcnow()

        for raw_msg in raw_messages:
            openwa_id = str(raw_msg.get("id") or "")
            if not openwa_id:
                continue

            from_me = bool(
                raw_msg.get("fromMe")
                or str(openwa_id).startswith("true_")
            )
            content = raw_msg.get("body") or raw_msg.get("text") or raw_msg.get("caption") or ""
            raw_type = str(raw_msg.get("type") or "text").lower()
            msg_type = "audio" if raw_type == "ptt" else (
                raw_type if raw_type in ("image", "video", "document", "audio") else "text"
            )
            media_url = sanitize_media_url(raw_msg.get("url") or raw_msg.get("deprecatedMmsUrl") or raw_msg.get("mediaUrl"))
            filename = raw_msg.get("filename")
            mimetype = raw_msg.get("mimetype")

            ts = raw_msg.get("timestamp") or raw_msg.get("t")
            msg_time = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else now

            ack = int(raw_msg.get("ack", 1 if from_me else 2))
            if ack == 3:
                status_val = "read"
            elif ack == 2:
                status_val = "delivered"
            else:
                status_val = "sent" if from_me else "delivered"

            # Check if exists in DB
            existing_res = await db.execute(
                select(WhatsAppChatMessage).where(WhatsAppChatMessage.openwa_message_id == openwa_id)
            )
            existing = existing_res.scalar_one_or_none()

            if existing:
                changed = False
                if ack > (existing.ack_status or 0):
                    existing.ack_status = ack
                    if ack == 3 and not existing.read_at:
                        existing.read_at = msg_time
                        existing.status = "read"
                    elif ack == 2 and not existing.delivered_at:
                        existing.delivered_at = msg_time
                        existing.status = "delivered"
                    changed = True
                if media_url and not existing.media_url:
                    existing.media_url = media_url
                    changed = True
                if changed:
                    updated_count += 1
            else:
                sender_type = "HR" if from_me else "STUDENT"
                sender_id = student.assigned_hr_id if from_me else student.id
                sender_phone = (
                    settings.OPENWA_OFFICIAL_PHONE or "+201000000000"
                ) if from_me else clean_phone
                recipient_phone = clean_phone if from_me else (
                    settings.OPENWA_OFFICIAL_PHONE or "+201000000000"
                )

                new_msg = WhatsAppChatMessage(
                    id=f"cmsg_{uuid.uuid4().hex[:12]}",
                    openwa_message_id=openwa_id,
                    student_id=student.id,
                    assigned_hr_id=student.assigned_hr_id,
                    sender_type=sender_type,
                    sender_id=sender_id,
                    sender_phone=sender_phone,
                    recipient_phone=recipient_phone,
                    message_type=msg_type,
                    content=content,
                    media_url=media_url,
                    media_filename=filename,
                    media_mimetype=mimetype,
                    status=status_val,
                    ack_status=ack,
                    reactions="[]",
                    raw_payload=json.dumps(raw_msg) if isinstance(raw_msg, dict) else None,
                    created_at=msg_time,
                    delivered_at=msg_time if ack >= 2 else None,
                    read_at=msg_time if ack >= 3 else None,
                )
                db.add(new_msg)
                new_count += 1

        if new_count > 0 or updated_count > 0:
            await db.commit()
            logger.info(
                "WhatsApp sync for student %s completed: %d new, %d updated",
                student.id, new_count, updated_count
            )

        # Retrieve updated full history
        all_msgs = await cls.get_thread_messages(student_id, current_user, db)

        # Notify via WebSocket if any changes occurred
        if (new_count > 0 or updated_count > 0) and student.assigned_hr_id:
            await ws_manager.send_to_user(
                student.assigned_hr_id,
                "messages_synced",
                {
                    "student_id": student.id,
                    "new_count": new_count,
                    "updated_count": updated_count,
                }
            )

        return WhatsAppSyncResponse(
            success=True,
            student_id=student.id,
            synced_count=len(raw_messages),
            new_messages_count=new_count,
            updated_messages_count=updated_count,
            messages=all_msgs,
        )

