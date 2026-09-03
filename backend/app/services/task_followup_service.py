"""Automatic, stage-aware follow-ups for members with overdue tasks."""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.whatsapp_agent import normalize_phone_number, run_whatsapp_agent
from app.core.config import settings
from app.models.entities import Student, Submission, Task, TaskReminder, TaskReminderTest
from app.services.audit_service import AuditService


logger = logging.getLogger("studentops.task_followups")


class TaskFollowupService:
    """Find and process stage 1 task follow-ups safely across repeated runs."""

    def __init__(self) -> None:
        self.last_check: datetime | None = None
        self.last_reminder: datetime | None = None
        self.last_stats = {"eligible": 0, "sent": 0, "failed": 0, "skipped": 0}
        self.enabled_override: bool | None = None
        self.last_test: dict[str, Any] | None = None

    @property
    def enabled(self) -> bool:
        return self.enabled_override if self.enabled_override is not None else settings.TASK_REMINDER_ENABLED

    def set_enabled(self, enabled: bool) -> None:
        self.enabled_override = enabled

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "delay_hours": settings.TASK_REMINDER_DELAY_HOURS,
            "check_interval_minutes": settings.TASK_REMINDER_CHECK_INTERVAL_MINUTES,
            "last_check": self.last_check.isoformat() if self.last_check else None,
            "last_reminder": self.last_reminder.isoformat() if self.last_reminder else None,
            "test_mode": settings.WHATSAPP_TEST_MODE,
            "test_recipient": settings.WHATSAPP_TEST_RECIPIENT,
            "test_delay_minutes": settings.WHATSAPP_TEST_DELAY_MINUTES,
            "test": self.last_test,
            **self.last_stats,
        }

    async def check_task_followups(self, db: AsyncSession) -> dict[str, Any]:
        """Process eligible stage 1 reminders; safe to call repeatedly."""
        now = datetime.now(timezone.utc)
        self.last_check = now
        stats = {"eligible": 0, "sent": 0, "failed": 0, "skipped": 0}
        if not self.enabled:
            self.last_stats = stats
            return {"enabled": False, **stats}

        await self._process_test_reminders(db)

        deadline_cutoff = now - timedelta(hours=settings.TASK_REMINDER_DELAY_HOURS)
        tasks_result = await db.execute(select(Task).where(Task.deadline.is_not(None), Task.deadline <= deadline_cutoff))
        students_result = await db.execute(select(Student).where(Student.status == "ACTIVE"))
        students = students_result.scalars().all()

        for task in tasks_result.scalars().all():
            for member in students:
                if await self._has_submission(db, task.id, member.id):
                    stats["skipped"] += 1
                    continue
                try:
                    phone = normalize_phone_number(member.phone)
                except ValueError:
                    stats["skipped"] += 1
                    continue
                if await self._reminder_exists(db, task.id, member.id, 1):
                    stats["skipped"] += 1
                    continue

                stats["eligible"] += 1
                deadline = self._as_utc(task.deadline)
                context = {
                    "member_name": member.full_name,
                    "task_title": task.title,
                    "deadline": deadline.isoformat(),
                    "hours_overdue": max(0, int((now - deadline).total_seconds() // 3600)),
                    "reminder_stage": 1,
                }
                message = self.prepare_message(context)
                reminder = await self._claim_reminder(db, task, member, phone, message)
                if reminder is None:
                    stats["skipped"] += 1
                    continue

                try:
                    result = await run_whatsapp_agent(phone, message)
                except Exception as exc:
                    result = {"success": False, "status": "failed", "error": str(exc), "recipient": phone}
                await self._finish_reminder(db, reminder, task, member, context, result)
                if result.get("success"):
                    stats["sent"] += 1
                    self.last_reminder = now
                else:
                    stats["failed"] += 1

        self.last_stats = stats
        return {"enabled": True, **stats}

    @staticmethod
    async def count_pending_test_reminders(db: AsyncSession) -> int:
        """Return pending synthetic records for scheduler diagnostics only."""
        result = await db.execute(
            select(TaskReminderTest.id).where(TaskReminderTest.status == "PENDING")
        )
        return len(result.scalars().all())

    async def queue_test_reminder(self, db: AsyncSession, message: str) -> dict[str, Any]:
        """Queue an isolated synthetic reminder for scheduler delivery."""
        if not settings.WHATSAPP_TEST_MODE:
            raise ValueError("WhatsApp test mode is disabled. Set WHATSAPP_TEST_MODE=true first.")
        if not self.enabled:
            raise ValueError("Automatic task reminders are disabled. Set TASK_REMINDER_ENABLED=true first.")
        content = message.strip()
        if not content:
            raise ValueError("Test message cannot be empty.")
        try:
            recipient = normalize_phone_number(settings.WHATSAPP_TEST_RECIPIENT or "")
        except ValueError as exc:
            raise ValueError(f"WHATSAPP_TEST_RECIPIENT is missing or invalid: {exc}") from exc

        now = datetime.now(timezone.utc)
        reminder = TaskReminderTest(
            id=f"trt_{uuid4().hex}",
            reminder_key=f"automatic_test_{uuid4().hex}",
            recipient_phone=recipient,
            message=content,
            status="PENDING",
            available_at=now + timedelta(minutes=max(0, settings.WHATSAPP_TEST_DELAY_MINUTES)),
        )
        db.add(reminder)
        await db.commit()
        self.last_test = {
            "id": reminder.id,
            "status": "WAITING",
            "recipient": reminder.recipient_phone,
            "message": reminder.message,
            "available_at": self._as_utc(reminder.available_at).isoformat(),
        }
        return self.last_test

    async def _process_test_reminders(self, db: AsyncSession) -> None:
        """Process only synthetic records while explicit test mode remains enabled."""
        if not settings.WHATSAPP_TEST_MODE:
            return
        now = datetime.now(timezone.utc)
        query = await db.execute(
            select(TaskReminderTest).where(
                TaskReminderTest.status == "PENDING",
                TaskReminderTest.available_at <= now,
            ).order_by(TaskReminderTest.created_at.asc())
        )
        for reminder in query.scalars().all():
            claim = await db.execute(
                update(TaskReminderTest)
                .where(TaskReminderTest.id == reminder.id, TaskReminderTest.status == "PENDING")
                .values(status="SENDING")
            )
            await db.commit()
            if claim.rowcount != 1:
                continue

            try:
                configured_recipient = normalize_phone_number(settings.WHATSAPP_TEST_RECIPIENT or "")
                if configured_recipient != reminder.recipient_phone:
                    raise ValueError("Configured test recipient changed before delivery.")
            except ValueError as exc:
                result = {"success": False, "error": f"Test recipient configuration error: {exc}"}
            else:
                try:
                    result = await run_whatsapp_agent(reminder.recipient_phone, reminder.message)
                except Exception as exc:
                    result = {"success": False, "error": str(exc)}
            await self._finish_test_reminder(db, reminder, result)

    async def _finish_test_reminder(
        self, db: AsyncSession, reminder: TaskReminderTest, result: dict[str, Any]
    ) -> None:
        reminder.status = "SENT" if result.get("success") else "FAILED"
        reminder.sent_at = datetime.now(timezone.utc) if result.get("success") else None
        reminder.error = None if result.get("success") else str(result.get("error", "Message delivery failed."))
        await db.commit()
        self.last_test = {
            "id": reminder.id,
            "status": reminder.status,
            "recipient": reminder.recipient_phone,
            "sent_at": reminder.sent_at.isoformat() if reminder.sent_at else None,
            "error": reminder.error,
        }
        await AuditService.record_action(
            db=db,
            intent="AUTOMATIC_TASK_REMINDER_TEST",
            tool_name="send_whatsapp_message",
            parameters={
                "task": "synthetic_test_task",
                "member": "synthetic_test_member",
                "reminder_stage": 1,
                "recipient": reminder.recipient_phone,
                "trigger_source": "automatic_task_reminder_test",
                "is_test": True,
            },
            result={"status": reminder.status, "error": reminder.error},
            user_id="system",
            status="EXECUTED" if result.get("success") else "FAILED",
        )

    @staticmethod
    def prepare_message(context: dict[str, Any]) -> str:
        """Create a factual stage 1 message from backend-provided context only."""
        return (
            f"Hi {context['member_name']}, we noticed that you haven't submitted "
            f"{context['task_title']} yet. It was due on {context['deadline']}. "
            "Is there any issue preventing you from completing it? Please let us know if you need any help."
        )

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

    @staticmethod
    async def _has_submission(db: AsyncSession, task_id: str, member_id: str) -> bool:
        result = await db.execute(
            select(Submission.id).where(
                Submission.task_id == task_id,
                Submission.student_id == member_id,
                (Submission.submitted_at.is_not(None) | Submission.status.in_(["ON_TIME", "LATE", "SUBMITTED", "COMPLETED"])),
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def _reminder_exists(db: AsyncSession, task_id: str, member_id: str, stage: int) -> bool:
        result = await db.execute(
            select(TaskReminder.id).where(
                TaskReminder.task_id == task_id,
                TaskReminder.member_id == member_id,
                TaskReminder.reminder_stage == stage,
            ).limit(1)
        )
        return result.scalar_one_or_none() is not None

    @staticmethod
    async def _claim_reminder(
        db: AsyncSession, task: Task, member: Student, phone: str, message: str
    ) -> TaskReminder | None:
        reminder = TaskReminder(
            id=f"tr_{uuid4().hex}", task_id=task.id, member_id=member.id,
            reminder_stage=1, recipient_phone=phone, message=message, status="PENDING",
        )
        db.add(reminder)
        try:
            await db.commit()
            await db.refresh(reminder)
            return reminder
        except (IntegrityError, OperationalError):
            await db.rollback()
            return None

    @staticmethod
    async def _finish_reminder(
        db: AsyncSession, reminder: TaskReminder, task: Task, member: Student,
        context: dict[str, Any], result: dict[str, Any]
    ) -> None:
        reminder.status = "SENT" if result.get("success") else "FAILED"
        reminder.sent_at = datetime.now(timezone.utc) if result.get("success") else None
        reminder.error = None if result.get("success") else str(result.get("error", "Message delivery failed."))
        await db.commit()
        await AuditService.record_action(
            db=db,
            intent="AUTOMATIC_TASK_REMINDER",
            tool_name="send_whatsapp_message",
            parameters={
                "task_id": task.id, "task_title": task.title, "member_id": member.id,
                "member_name": member.full_name, "reminder_stage": 1,
                "recipient": reminder.recipient_phone, "trigger_source": "automatic_task_reminder",
            },
            result={"status": reminder.status, "error": reminder.error, "context": context},
            user_id="system",
            status="EXECUTED" if result.get("success") else "FAILED",
        )


task_followup_service = TaskFollowupService()