"""Tests for automatic task follow-up eligibility and idempotency."""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.database import Base
from app.models.entities import Student, Submission, Task, TaskReminder
from app.services.task_followup_service import TaskFollowupService


@pytest.fixture
async def db_factory(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'followups.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    yield factory
    await engine.dispose()


async def add_case(factory, *, deadline, status="ACTIVE", phone="+201012345678", submitted=False, task_count=1):
    async with factory() as db:
        member = Student(
            id="std_followup", student_code="F-1", full_name="Ahmed Test", arabic_name="أحمد اختبار",
            email="ahmed.followup@example.com", phone=phone, status=status,
        )
        db.add(member)
        tasks = []
        for index in range(task_count):
            task = Task(
                id=f"task_followup_{index}", task_number=100 + index, title=f"Task {index + 1}",
                description="Test task", deadline=deadline, max_score=10, score_rule="standard",
            )
            tasks.append(task)
            db.add(task)
        if submitted:
            db.add(Submission(
                id="sub_followup", task_id=tasks[0].id, student_id=member.id,
                submitted_at=datetime.now(timezone.utc), status="ON_TIME",
            ))
        await db.commit()
    return tasks


@pytest.fixture(autouse=True)
def reminder_settings(monkeypatch):
    monkeypatch.setattr(settings, "TASK_REMINDER_ENABLED", True)
    monkeypatch.setattr(settings, "TASK_REMINDER_DELAY_HOURS", 24)
    monkeypatch.setattr(settings, "WHATSAPP_WAIT_TIME", 10)
    monkeypatch.setattr(settings, "WHATSAPP_TAB_CLOSE", True)


@pytest.mark.asyncio
async def test_submitted_task_has_no_reminder(db_factory, monkeypatch):
    monkeypatch.setattr("app.services.task_followup_service.run_whatsapp_agent", pytest.fail)
    await add_case(db_factory, deadline=datetime.now(timezone.utc) - timedelta(hours=48), submitted=True)
    async with db_factory() as db:
        result = await TaskFollowupService().check_task_followups(db)
        assert result["sent"] == 0
        assert result["eligible"] == 0


@pytest.mark.asyncio
async def test_task_not_overdue_enough_has_no_reminder(db_factory, monkeypatch):
    monkeypatch.setattr("app.services.task_followup_service.run_whatsapp_agent", pytest.fail)
    await add_case(db_factory, deadline=datetime.now(timezone.utc) - timedelta(hours=2))
    async with db_factory() as db:
        result = await TaskFollowupService().check_task_followups(db)
        assert result["sent"] == 0


@pytest.mark.asyncio
async def test_overdue_task_sends_reminder(db_factory, monkeypatch):
    calls = []

    async def send(phone, message):
        calls.append((phone, message))
        return {"success": True, "status": "sent", "recipient": phone}

    monkeypatch.setattr("app.services.task_followup_service.run_whatsapp_agent", send)
    await add_case(db_factory, deadline=datetime.now(timezone.utc) - timedelta(hours=25))
    async with db_factory() as db:
        result = await TaskFollowupService().check_task_followups(db)
        reminder = (await db.execute(select(TaskReminder))).scalar_one()
        assert result["sent"] == 1
        assert reminder.status == "SENT"
        assert calls[0][0] == "+201012345678"
        assert "Ahmed Test" in calls[0][1]
        assert "Task 1" in calls[0][1]


@pytest.mark.asyncio
async def test_existing_reminder_is_not_sent_again(db_factory, monkeypatch):
    calls = []

    async def send(phone, message):
        calls.append(phone)
        return {"success": True, "status": "sent", "recipient": phone}

    monkeypatch.setattr("app.services.task_followup_service.run_whatsapp_agent", send)
    await add_case(db_factory, deadline=datetime.now(timezone.utc) - timedelta(hours=25))
    async with db_factory() as db:
        await TaskFollowupService().check_task_followups(db)
        result = await TaskFollowupService().check_task_followups(db)
        assert result["sent"] == 0
    assert len(calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("status,phone", [("INACTIVE", "+201012345678"), ("ACTIVE", "")])
async def test_inactive_or_missing_phone_is_skipped(db_factory, monkeypatch, status, phone):
    monkeypatch.setattr("app.services.task_followup_service.run_whatsapp_agent", pytest.fail)
    await add_case(db_factory, deadline=datetime.now(timezone.utc) - timedelta(hours=25), status=status, phone=phone)
    async with db_factory() as db:
        result = await TaskFollowupService().check_task_followups(db)
        assert result["sent"] == 0
        assert (await db.execute(select(TaskReminder))).scalar_one_or_none() is None
        if status == "ACTIVE":
            assert result["skipped"] == 1


@pytest.mark.asyncio
async def test_send_failure_is_recorded_and_does_not_crash(db_factory, monkeypatch):
    async def fail(phone, message):
        return {"success": False, "status": "failed", "recipient": phone, "error": "Web unavailable"}

    monkeypatch.setattr("app.services.task_followup_service.run_whatsapp_agent", fail)
    await add_case(db_factory, deadline=datetime.now(timezone.utc) - timedelta(hours=25))
    async with db_factory() as db:
        result = await TaskFollowupService().check_task_followups(db)
        reminder = (await db.execute(select(TaskReminder))).scalar_one()
        assert result["failed"] == 1
        assert reminder.status == "FAILED"
        assert reminder.error == "Web unavailable"


@pytest.mark.asyncio
async def test_multiple_tasks_are_processed_independently(db_factory, monkeypatch):
    calls = []

    async def send(phone, message):
        calls.append(message)
        return {"success": True, "status": "sent", "recipient": phone}

    monkeypatch.setattr("app.services.task_followup_service.run_whatsapp_agent", send)
    await add_case(db_factory, deadline=datetime.now(timezone.utc) - timedelta(hours=25), task_count=2)
    async with db_factory() as db:
        result = await TaskFollowupService().check_task_followups(db)
        assert result["sent"] == 2
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_disabled_scheduler_sends_nothing(db_factory, monkeypatch):
    monkeypatch.setattr(settings, "TASK_REMINDER_ENABLED", False)
    monkeypatch.setattr("app.services.task_followup_service.run_whatsapp_agent", pytest.fail)
    await add_case(db_factory, deadline=datetime.now(timezone.utc) - timedelta(hours=25))
    async with db_factory() as db:
        result = await TaskFollowupService().check_task_followups(db)
        assert result == {"enabled": False, "eligible": 0, "sent": 0, "failed": 0, "skipped": 0}


@pytest.mark.asyncio
async def test_concurrent_claims_create_one_stage_one_reminder(db_factory):
    service = TaskFollowupService()
    tasks = await add_case(db_factory, deadline=datetime.now(timezone.utc) - timedelta(hours=25))
    async with db_factory() as db:
        member = (await db.execute(select(Student))).scalar_one()
    async with db_factory() as first, db_factory() as second:
        claims = await asyncio.gather(
            service._claim_reminder(first, tasks[0], member, "+201012345678", "Message"),
            service._claim_reminder(second, tasks[0], member, "+201012345678", "Message"),
        )
    assert sum(claim is not None for claim in claims) == 1
    async with db_factory() as db:
        reminders = (await db.execute(select(TaskReminder))).scalars().all()
        assert len(reminders) == 1
        assert reminders[0].reminder_stage == 1
