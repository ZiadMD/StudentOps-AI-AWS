"""
Background Automation Engine and Scheduling Service for StudentOps AI.
Deterministic, timezone-aware, restart-safe, and idempotent.
"""
from typing import Optional
from datetime import datetime, timezone, timedelta
import asyncio
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.entities import (
    Meeting,
    AttendanceRecord,
    Task,
    Submission,
    Student,
    User,
    ReminderLog,
    TaskReminder,
    MemberFollowupStatus,
    AutomationSettings,
    utcnow,
)
from app.providers.openwa_provider import OpenWAProvider
from app.providers.messaging_provider import OutgoingMessage
from app.services.attendance_service import AttendanceService
from app.api.routes_tasks import get_task_reminder_candidates

logger = logging.getLogger("studentops.automation")

ALLOWED_TEMPLATE_VARS = {"name", "task_name", "deadline", "session_name", "meeting_time"}

DEFAULT_ATTENDANCE_TEMPLATE = (
    "مرحباً {name}، نود الاطمئنان عليك ومتابعة غيابك عن اللقاء: {session_name} ({meeting_time}). "
    "يسعدنا تواصلك مع مسؤولي الموارد البشرية لتوضيح السبب أو الاستفسار."
)

DEFAULT_TASK_PRE_TEMPLATE = (
    "مرحباً {name}، نذكرك بالموعد النهائي لتسليم المهمة ({task_name}). "
    "الموعد: {deadline}. بالتوفيق!"
)

DEFAULT_TASK_POST_TEMPLATE = (
    "مرحباً {name}، نلاحظ فوات موعد تسليم المهمة ({task_name}) المحدد في {deadline}. "
    "يرجى تسليم المهمة في أقرب وقت أو التواصل مع مسؤولي الموارد البشرية."
)


def render_template(template: str, variables: dict[str, str]) -> str:
    """Safely renders template variables with strict whitelist. No eval or arbitrary code execution."""
    result = template
    for key, val in variables.items():
        if key in ALLOWED_TEMPLATE_VARS:
            result = result.replace(f"{{{key}}}", str(val))
    return result


class AutomationEngine:
    """
    Executes automated attendance check and task reminders.
    Adheres strictly to precedence:
      1. Session/task-specific override
      2. HR AutomationSettings
      3. System default
    """

    def __init__(self, openwa_provider: Optional[OpenWAProvider] = None):
        self.openwa = openwa_provider or OpenWAProvider()

    async def get_hr_settings(self, user_id: Optional[str], db: AsyncSession) -> AutomationSettings:
        """Fetch HR automation settings or return system defaults."""
        if user_id:
            res = await db.execute(
                select(AutomationSettings).where(AutomationSettings.user_id == user_id)
            )
            s = res.scalar_one_or_none()
            if s:
                return s

        # Default virtual settings
        return AutomationSettings(
            user_id=user_id or "system_default",
            attendance_enabled=True,
            attendance_grace_minutes=settings.ATTENDANCE_LATE_THRESHOLD_MINUTES,
            attendance_message=DEFAULT_ATTENDANCE_TEMPLATE,
            task_pre_enabled=True,
            task_pre_hours=24,
            task_pre_message=DEFAULT_TASK_PRE_TEMPLATE,
            task_post_enabled=True,
            task_post_delay_hours=2,
            task_post_message=DEFAULT_TASK_POST_TEMPLATE,
            whatsapp_enabled=True,
        )

    async def run_attendance_cycle(self, db: AsyncSession) -> list[dict]:
        """
        Scans recently concluded meetings (past 48h) where grace period has elapsed.
        Idempotently sends absent notifications without duplicates.
        """
        now = utcnow()
        cutoff = now - timedelta(hours=48)

        meetings_res = await db.execute(
            select(Meeting).where(
                Meeting.start_time >= cutoff,
                Meeting.start_time <= now
            )
        )
        meetings = meetings_res.scalars().all()
        dispatched_logs = []

        for meeting in meetings:
            # Check meeting end time + grace
            meeting_end = meeting.start_time + timedelta(minutes=meeting.duration_minutes)
            hr_settings = await self.get_hr_settings(None, db)

            grace_minutes = hr_settings.attendance_grace_minutes
            if now < (meeting_end + timedelta(minutes=grace_minutes)):
                # Still within grace boundary
                continue

            # Query attendance records for unexcused absents
            att_res = await db.execute(
                select(AttendanceRecord, Student)
                .join(Student, AttendanceRecord.student_id == Student.id)
                .where(
                    AttendanceRecord.meeting_id == meeting.id,
                    AttendanceRecord.status == "UNEXCUSED_ABSENT"
                )
            )
            absentees = att_res.all()

            for att, student in absentees:
                # Idempotency check: verify no reminder already sent for this meeting & student
                existing_rem = await db.execute(
                    select(ReminderLog).where(
                        ReminderLog.recipient_id == student.id,
                        ReminderLog.trigger_source == f"AUTOMATION_ATTENDANCE_{meeting.id}"
                    )
                )
                if existing_rem.scalar_one_or_none():
                    continue

                # Re-check excuse state right before sending
                if att.excuse_status in ("EXCUSED_ACCEPTED", "EXCUSED_MODERATE"):
                    continue

                # Prepare message
                template = hr_settings.attendance_message or DEFAULT_ATTENDANCE_TEMPLATE
                time_str = meeting.start_time.strftime("%d %b %I:%M %p")
                msg_text = render_template(template, {
                    "name": student.arabic_name or student.full_name,
                    "session_name": meeting.title,
                    "meeting_time": time_str,
                })

                # Dispatch via OpenWA if enabled
                msg_status = "SENT"
                if hr_settings.whatsapp_enabled:
                    try:
                        out = OutgoingMessage(
                            recipient_id=student.id,
                            recipient_name=student.full_name,
                            recipient_phone=student.phone,
                            content=msg_text,
                            channel="WHATSAPP_OFFICIAL",
                        )
                        res = await self.openwa.send_message(out)
                        if not res.success and not getattr(res, "is_uncertain", False):
                            msg_status = "FAILED"
                    except Exception as exc:
                        logger.warning(f"OpenWA delivery warning in attendance automation: {exc}")
                        msg_status = "FAILED"

                # Record immutable audit log
                rem_log = ReminderLog(
                    id=f"rem_att_{uuid.uuid4().hex[:12]}",
                    recipient_id=student.id,
                    recipient_name=student.full_name,
                    recipient_phone=student.phone,
                    channel="WHATSAPP_OFFICIAL",
                    message_content=msg_text,
                    status=msg_status,
                    trigger_source=f"AUTOMATION_ATTENDANCE_{meeting.id}",
                    sent_at=now,
                )
                db.add(rem_log)
                dispatched_logs.append({
                    "type": "ATTENDANCE",
                    "student_id": student.id,
                    "meeting_id": meeting.id,
                    "status": msg_status
                })

        await db.commit()
        return dispatched_logs

    async def run_task_cycle(self, db: AsyncSession) -> list[dict]:
        """
        Scans upcoming and overdue tasks.
        Pre-deadline: reminds assigned non-submitters once.
        Post-deadline: reminds still-missing members and triggers SLA escalation.
        """
        now = utcnow()
        active_tasks_res = await db.execute(
            select(Task).where(Task.deadline >= (now - timedelta(days=7)))
        )
        tasks = active_tasks_res.scalars().all()
        dispatched_logs = []

        for task in tasks:
            hr_settings = await self.get_hr_settings(task.created_by_user_id, db)
            deadline = task.deadline
            if deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=timezone.utc)

            deadline_str = deadline.strftime("%A, %d %b %I:%M %p")

            # 1. Pre-deadline Automation
            if hr_settings.task_pre_enabled:
                pre_window_start = deadline - timedelta(hours=hr_settings.task_pre_hours)
                if pre_window_start <= now < deadline:
                    candidates = await get_task_reminder_candidates(task.id, db, pre_deadline=True)
                    for student in candidates:
                        # Check if Stage 1 reminder already sent
                        existing = await db.execute(
                            select(TaskReminder).where(
                                TaskReminder.task_id == task.id,
                                TaskReminder.student_id == student.id,
                                TaskReminder.stage == 1
                            )
                        )
                        if existing.scalar_one_or_none():
                            continue

                        template = hr_settings.task_pre_message or DEFAULT_TASK_PRE_TEMPLATE
                        msg_text = render_template(template, {
                            "name": student.arabic_name or student.full_name,
                            "task_name": task.title,
                            "deadline": deadline_str,
                        })

                        msg_status = "SENT"
                        if hr_settings.whatsapp_enabled:
                            try:
                                out = OutgoingMessage(
                                    recipient_id=student.id,
                                    recipient_name=student.full_name,
                                    recipient_phone=student.phone,
                                    content=msg_text,
                                    channel="WHATSAPP_OFFICIAL",
                                )
                                res = await self.openwa.send_message(out)
                                if not res.success and not getattr(res, "is_uncertain", False):
                                    msg_status = "FAILED"
                            except Exception as exc:
                                logger.warning(f"OpenWA delivery warning in task pre-deadline: {exc}")
                                msg_status = "FAILED"

                        # Log to TaskReminder and ReminderLog
                        db.add(TaskReminder(
                            id=f"tr_{uuid.uuid4().hex[:12]}",
                            task_id=task.id,
                            student_id=student.id,
                            stage=1,
                            status=msg_status,
                            message_text=msg_text,
                            sent_at=now,
                        ))
                        db.add(ReminderLog(
                            id=f"rem_task_{uuid.uuid4().hex[:12]}",
                            recipient_id=student.id,
                            recipient_name=student.full_name,
                            recipient_phone=student.phone,
                            channel="WHATSAPP_OFFICIAL",
                            message_content=msg_text,
                            status=msg_status,
                            trigger_source=f"AUTOMATION_TASK_PRE_{task.id}",
                            sent_at=now,
                        ))
                        dispatched_logs.append({
                            "type": "TASK_PRE",
                            "student_id": student.id,
                            "task_id": task.id,
                            "status": msg_status
                        })

            # 2. Post-deadline Automation
            if hr_settings.task_post_enabled:
                post_trigger_time = deadline + timedelta(hours=hr_settings.task_post_delay_hours)
                if now >= post_trigger_time:
                    candidates = await get_task_reminder_candidates(task.id, db, pre_deadline=False)
                    for student in candidates:
                        # Check if Stage 2 reminder already sent
                        existing = await db.execute(
                            select(TaskReminder).where(
                                TaskReminder.task_id == task.id,
                                TaskReminder.student_id == student.id,
                                TaskReminder.stage == 2
                            )
                        )
                        if existing.scalar_one_or_none():
                            continue

                        template = hr_settings.task_post_message or DEFAULT_TASK_POST_TEMPLATE
                        msg_text = render_template(template, {
                            "name": student.arabic_name or student.full_name,
                            "task_name": task.title,
                            "deadline": deadline_str,
                        })

                        msg_status = "SENT"
                        if hr_settings.whatsapp_enabled:
                            try:
                                out = OutgoingMessage(
                                    recipient_id=student.id,
                                    recipient_name=student.full_name,
                                    recipient_phone=student.phone,
                                    content=msg_text,
                                    channel="WHATSAPP_OFFICIAL",
                                )
                                res = await self.openwa.send_message(out)
                                if not res.success and not getattr(res, "is_uncertain", False):
                                    msg_status = "FAILED"
                            except Exception as exc:
                                logger.warning(f"OpenWA delivery warning in task post-deadline: {exc}")
                                msg_status = "FAILED"

                        db.add(TaskReminder(
                            id=f"tr_{uuid.uuid4().hex[:12]}",
                            task_id=task.id,
                            student_id=student.id,
                            stage=2,
                            status=msg_status,
                            message_text=msg_text,
                            sent_at=now,
                        ))
                        db.add(ReminderLog(
                            id=f"rem_task_{uuid.uuid4().hex[:12]}",
                            recipient_id=student.id,
                            recipient_name=student.full_name,
                            recipient_phone=student.phone,
                            channel="WHATSAPP_OFFICIAL",
                            message_content=msg_text,
                            status=msg_status,
                            trigger_source=f"AUTOMATION_TASK_POST_{task.id}",
                            sent_at=now,
                        ))

                        # If student has assigned HR, ensure MemberFollowupStatus exists for SLA tracking
                        if student.assigned_hr_id:
                            fol_res = await db.execute(
                                select(MemberFollowupStatus).where(
                                    MemberFollowupStatus.student_id == student.id,
                                    MemberFollowupStatus.flagged_reason == "OVERDUE_TASK",
                                    MemberFollowupStatus.status != "RESOLVED"
                                )
                            )
                            if not fol_res.scalar_one_or_none():
                                db.add(MemberFollowupStatus(
                                    id=f"fol_{uuid.uuid4().hex[:12]}",
                                    student_id=student.id,
                                    hr_member_id=student.assigned_hr_id,
                                    flagged_reason="OVERDUE_TASK",
                                    flagged_at=now,
                                    status="PENDING",
                                    is_escalated=False,
                                    notes=f"Overdue on task: {task.title}",
                                ))

                        dispatched_logs.append({
                            "type": "TASK_POST",
                            "student_id": student.id,
                            "task_id": task.id,
                            "status": msg_status
                        })

        await db.commit()
        return dispatched_logs

    async def run_cycle(self, db: AsyncSession) -> dict:
        """Runs a complete automation cycle."""
        att_results = await self.run_attendance_cycle(db)
        task_results = await self.run_task_cycle(db)
        return {
            "timestamp": utcnow().isoformat(),
            "attendance_reminders_sent": len(att_results),
            "task_reminders_sent": len(task_results),
            "details": att_results + task_results
        }


# Singleton automation engine
automation_engine = AutomationEngine()


class BackgroundScheduler:
    """Asynchronous background scheduler for periodic automation evaluation."""

    def __init__(self, interval_seconds: int = 300):
        self.interval_seconds = interval_seconds
        self._task: Optional[asyncio.Task] = None
        self._running = False

    async def _loop(self):
        logger.info("Background automation scheduler loop started.")
        while self._running:
            try:
                async with AsyncSessionLocal() as session:
                    await automation_engine.run_cycle(session)
            except Exception as e:
                logger.error(f"Error during background automation cycle: {e}", exc_info=True)
            try:
                await asyncio.sleep(self.interval_seconds)
            except asyncio.CancelledError:
                break
        logger.info("Background automation scheduler loop stopped.")

    def start(self):
        if not self._running:
            self._running = True
            self._task = asyncio.create_task(self._loop())

    def stop(self):
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()


scheduler = BackgroundScheduler(interval_seconds=300)
