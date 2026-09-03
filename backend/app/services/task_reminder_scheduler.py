"""Cancellable background scheduler for automatic task follow-ups."""
import asyncio
import logging

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.task_followup_service import task_followup_service


logger = logging.getLogger("studentops.task_reminder_scheduler")


async def task_reminder_scheduler(stop_event: asyncio.Event) -> None:
    """Run checks periodically outside request handling."""
    interval = max(1, settings.TASK_REMINDER_CHECK_INTERVAL_MINUTES * 60)
    logger.info("[TaskReminderScheduler] starting")
    logger.info("[TaskReminderScheduler] interval=%s", interval)
    first_tick = True
    try:
        while not stop_event.is_set():
            if first_tick:
                logger.info("[TaskReminderScheduler] first tick")
                first_tick = False
            else:
                logger.info("[TaskReminderScheduler] tick")
            try:
                logger.info("[TaskReminderScheduler] checking reminders")
                async with AsyncSessionLocal() as session:
                    test_count = await task_followup_service.count_pending_test_reminders(session)
                    logger.info("[TaskReminderScheduler] test reminders found=%s", test_count)
                    await task_followup_service.check_task_followups(session)
                logger.info("[TaskReminderScheduler] finished tick")
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("[TaskReminderScheduler] tick exception")
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=interval)
            except asyncio.TimeoutError:
                continue
    except asyncio.CancelledError:
        logger.info("[TaskReminderScheduler] stopped")
        raise
    finally:
        if stop_event.is_set():
            logger.info("[TaskReminderScheduler] stopped")