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
        Enforces that HR Member can ONLY access threads for students currently assigned to them.
        """
        student = await db.get(Student, student_id)
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student member not found",
            )

        if current_user.role in ("region_hr_head", "hr_admin"):
            return student
        elif current_user.role in ("committee_hr_leader", "committee_head", "team_lead"):
            if student.team_id != current_user.team_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access forbidden: this member belongs to another committee.",
                )
            return student
        elif current_user.role == "committee_hr_member":
            if student.assigned_hr_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access forbidden: you are not assigned to this member.",
                )
            return student
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access forbidden: HR chat privileges required.",
            )

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
        - Resolves sender's phone -> assigned Student.
        - Resolves Student -> assigned HR Member.
        - Persists message / ack / reaction / edit in DB.
        - Pushes real-time event to that HR Member's connected socket session.
        """
        event_name = (payload.get("event") or payload.get("type") or "").lower()
        data = payload.get("data") or payload

        # 1. Handle Incoming Message (onMessage / message / message.received)
        if (
            "message" in event_name
            or event_name in ("onmessage", "message.received")
            or ("from" in data and "body" in data)
        ):
            raw_sender = str(data.get("from") or data.get("sender", {}).get("id") or "")
            clean_digits = format_phone_international(raw_sender)
            if not clean_digits:
                return {"status": "ignored", "reason": "No sender phone"}

            # Match student by phone
            # We match clean_digits or matching suffix (Egyptian phone 9/10 digits)
            suffix = clean_digits[-9:] if len(clean_digits) >= 9 else clean_digits
            st_res = await db.execute(
                select(Student).where(
                    or_(
                        Student.phone == clean_digits,
                        Student.phone.like(f"%{suffix}"),
                        Student.phone == f"+{clean_digits}",
                    )
                )
            )
            student = st_res.scalars().first()

            if not student:
                logger.info("WhatsApp webhook: incoming message from unregistered phone %s", clean_digits)
                return {"status": "unregistered_sender", "phone": clean_digits}

            assigned_hr_id = student.assigned_hr_id
            openwa_id = str(data.get("id") or f"openwa_{uuid.uuid4().hex[:8]}")

            # Check deduplication
            dup_res = await db.execute(
                select(WhatsAppChatMessage).where(WhatsAppChatMessage.openwa_message_id == openwa_id)
            )
            if dup_res.scalar_one_or_none():
                return {"status": "duplicate_skipped"}

            content = data.get("body") or data.get("text") or data.get("caption") or ""
            msg_type = data.get("type") or "text"
            media_url = data.get("url") or data.get("deprecatedMmsUrl") or data.get("mediaUrl")
            mimetype = data.get("mimetype")
            filename = data.get("filename")

            now = utcnow()
            new_msg = WhatsAppChatMessage(
                id=f"cmsg_{uuid.uuid4().hex[:12]}",
                openwa_message_id=openwa_id,
                student_id=student.id,
                assigned_hr_id=assigned_hr_id,
                sender_type="STUDENT",
                sender_id=student.id,
                sender_phone=clean_digits,
                recipient_phone=settings.OPENWA_OFFICIAL_PHONE or "+201000000000",
                message_type=msg_type if msg_type in ("image", "video", "document", "audio") else "text",
                content=content,
                media_url=sanitize_media_url(media_url),
                media_filename=filename,
                media_mimetype=mimetype,
                status="delivered",
                ack_status=2,
                reactions="[]",
                created_at=now,
                delivered_at=now,
            )
            db.add(new_msg)
            await db.commit()
            await db.refresh(new_msg)

            # Push live event scoped to assigned HR Member
            resp = cls._message_to_response(new_msg)
            if assigned_hr_id:
                await ws_manager.send_to_user(assigned_hr_id, "incoming_message", resp.model_dump(mode="json"))
            else:
                # If unassigned, broadcast to committee HR leader or admins for assignment
                leaders_res = await db.execute(
                    select(User.id).where(
                        User.team_id == student.team_id,
                        User.role == "committee_hr_leader"
                    )
                )
                leader_ids = list(leaders_res.scalars().all())
                await ws_manager.broadcast_to_users(leader_ids, "unassigned_incoming_message", resp.model_dump(mode="json"))

            return {"status": "success", "message_id": new_msg.id, "student_id": student.id}

        # 2. Handle Message Status / Ack (onAck / message.ack)
        elif "ack" in event_name or "ack" in data:
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
                    return {"status": "ack_updated", "message_id": msg.id, "ack": ack_val}

        return {"status": "unhandled_event", "event": event_name}
