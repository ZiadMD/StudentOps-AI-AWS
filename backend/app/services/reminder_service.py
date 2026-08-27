"""
Reminder and Notification Engine.
"""
from typing import Optional
from datetime import datetime, timezone
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.entities import Student, Event, ReminderLog, AgentActionAudit, AttendanceRecord, Task, Submission
from app.models.schemas import ReminderRequest, ReminderResult
from app.providers.messaging_provider import MessagingProvider, OutgoingMessage


class ReminderService:
    """Handles targeting students who need reminders and executing notifications."""

    def __init__(self, provider: MessagingProvider):
        self.provider = provider

    async def find_absent_students_for_meeting(self, meeting_id: str, db: AsyncSession) -> list[Student]:
        """Finds all students who were absent from a specific meeting."""
        res = await db.execute(
            select(Student)
            .join(AttendanceRecord, AttendanceRecord.student_id == Student.id)
            .where(
                AttendanceRecord.meeting_id == meeting_id,
                AttendanceRecord.status.in_(["UNEXCUSED_ABSENT", "EXCUSED_REJECTED", "EXCUSED_MODERATE"])
            )
        )
        return list(res.scalars().all())

    async def find_students_with_pending_task(self, task_id: str, db: AsyncSession) -> list[Student]:
        """Finds all students who have not submitted a specific task."""
        res = await db.execute(
            select(Student)
            .join(Submission, Submission.student_id == Student.id)
            .where(
                Submission.task_id == task_id,
                Submission.status == "PENDING"
            )
        )
        return list(res.scalars().all())

    def generate_meeting_reminder_text(
        self,
        student_name: str,
        event_title: str,
        event_time: datetime,
        meet_url: Optional[str] = None
    ) -> str:
        """Generates a professional Arabic/English reminder message."""
        time_str = event_time.strftime("%A, %d %b at %I:%M %p")
        link_str = f"\nGoogle Meet: {meet_url}" if meet_url else ""
        return (
            f"مرحباً {student_name}\n"
            f"نود تذكيرك بالاجتماع القادم: *{event_title}*\n"
            f"الموعد: {time_str}{link_str}\n\n"
            f"يرجى الحضور في الموعد المحدد لأهمية النقاط المطروحة. بالتوفيق!"
        )

    async def send_reminders(
        self,
        students: list[Student],
        event: Optional[Event],
        custom_message: Optional[str] = None,
        channel: str = "WHATSAPP",
        trigger_source: str = "AI_AGENT",
        db: Optional[AsyncSession] = None
    ) -> ReminderResult:
        """Dispatches messages through provider and logs to database."""
        outgoing_msgs = []
        recipients_data = []

        for s in students:
            if custom_message:
                msg_body = custom_message.replace("{name}", s.full_name)
            elif event:
                msg_body = self.generate_meeting_reminder_text(
                    student_name=s.arabic_name or s.full_name,
                    event_title=event.title,
                    event_time=event.start_time,
                    meet_url=event.meet_url
                )
            else:
                msg_body = f"تذكير من إدارة العمليات والموارد البشرية لـ {s.full_name}."

            outgoing = OutgoingMessage(
                recipient_id=s.id,
                recipient_name=s.full_name,
                recipient_phone=s.phone,
                content=msg_body,
                channel=channel
            )
            outgoing_msgs.append(outgoing)
            recipients_data.append({
                "student_id": s.id,
                "name": s.full_name,
                "arabic_name": s.arabic_name,
                "phone": s.phone
            })

            if db:
                reminder_log = ReminderLog(
                    id=f"rem_{int(datetime.now().timestamp())}_{s.id}",
                    recipient_id=s.id,
                    recipient_name=s.full_name,
                    recipient_phone=s.phone,
                    channel=channel,
                    message_content=msg_body,
                    status="SENT",
                    trigger_source=trigger_source
                )
                db.add(reminder_log)

        delivery_results = await self.provider.send_batch(outgoing_msgs)
        if db:
            await db.commit()

        preview = outgoing_msgs[0].content if outgoing_msgs else ""
        return ReminderResult(
            success=True,
            sent_count=len(delivery_results),
            recipients=recipients_data,
            message_preview=preview,
            channel=channel
        )
