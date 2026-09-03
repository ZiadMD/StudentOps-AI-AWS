"""Tests for isolated automated WhatsApp reminder test mode."""
import asyncio
from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.database import Base
from app.models.entities import TaskReminderTest
from app.services.task_followup_service import TaskFollowupService


@pytest.fixture
async def db_factory(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test_mode.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest.fixture(autouse=True)
def test_settings(monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_TEST_MODE", True)
    monkeypatch.setattr(settings, "WHATSAPP_TEST_RECIPIENT", "+201099999999")
    monkeypatch.setattr(settings, "WHATSAPP_TEST_DELAY_MINUTES", 0)
    monkeypatch.setattr(settings, "TASK_REMINDER_ENABLED", True)


async def queue(factory, message="Automated test message"):
    async with factory() as db:
        return await TaskFollowupService().queue_test_reminder(db, message)


@pytest.mark.asyncio
async def test_test_mode_uses_only_configured_recipient(db_factory, monkeypatch):
    calls = []

    async def send(phone, message):
        calls.append(phone)
        return {"success": True, "status": "sent", "recipient": phone}

    monkeypatch.setattr("app.services.task_followup_service.run_whatsapp_agent", send)
    await queue(db_factory)
    async with db_factory() as db:
        await TaskFollowupService().check_task_followups(db)
    assert calls == ["+201099999999"]


@pytest.mark.asyncio
async def test_missing_or_invalid_test_recipient_never_sends(db_factory, monkeypatch):
    monkeypatch.setattr("app.services.task_followup_service.run_whatsapp_agent", pytest.fail)
    for recipient in (None, "+20invalid"):
        monkeypatch.setattr(settings, "WHATSAPP_TEST_RECIPIENT", recipient)
        with pytest.raises(ValueError, match="missing or invalid"):
            await queue(db_factory)
    async with db_factory() as db:
        assert (await db.execute(select(TaskReminderTest))).scalars().all() == []


@pytest.mark.asyncio
async def test_production_mode_rejects_test_queue(db_factory):
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(settings, "WHATSAPP_TEST_MODE", False)
    try:
        with pytest.raises(ValueError, match="test mode is disabled"):
            await queue(db_factory)
    finally:
        monkeypatch.undo()


@pytest.mark.asyncio
async def test_test_reminder_is_sent_once(db_factory, monkeypatch):
    calls = []

    async def send(phone, message):
        calls.append(phone)
        return {"success": True, "status": "sent", "recipient": phone}

    monkeypatch.setattr("app.services.task_followup_service.run_whatsapp_agent", send)
    await queue(db_factory)
    service = TaskFollowupService()
    async with db_factory() as db:
        await service.check_task_followups(db)
        await service.check_task_followups(db)
        reminder = (await db.execute(select(TaskReminderTest))).scalar_one()
    assert calls == ["+201099999999"]
    assert reminder.status == "SENT"


@pytest.mark.asyncio
async def test_pywhatkit_failure_marks_test_failed(db_factory, monkeypatch):
    async def fail(phone, message):
        return {"success": False, "status": "failed", "error": "WhatsApp Web unavailable"}

    monkeypatch.setattr("app.services.task_followup_service.run_whatsapp_agent", fail)
    await queue(db_factory)
    async with db_factory() as db:
        await TaskFollowupService().check_task_followups(db)
        reminder = (await db.execute(select(TaskReminderTest))).scalar_one()
    assert reminder.status == "FAILED"
    assert reminder.error == "WhatsApp Web unavailable"


@pytest.mark.asyncio
async def test_concurrent_test_claims_send_once(db_factory, monkeypatch):
    calls = []

    async def send(phone, message):
        calls.append(phone)
        return {"success": True, "status": "sent", "recipient": phone}

    monkeypatch.setattr("app.services.task_followup_service.run_whatsapp_agent", send)
    await queue(db_factory)
    first_service = TaskFollowupService()
    second_service = TaskFollowupService()
    async with db_factory() as first, db_factory() as second:
        await asyncio.gather(
            first_service.check_task_followups(first),
            second_service.check_task_followups(second),
        )
    assert calls == ["+201099999999"]
