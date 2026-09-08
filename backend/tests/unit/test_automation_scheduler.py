import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.database import Base
from app.models.entities import Task, Student, Submission, TaskAssignment, User, AutomationSettings
from app.services.automation_service import (
    render_template,
    AutomationEngine,
    DEFAULT_TASK_PRE_TEMPLATE,
)

def test_render_template_safe():
    template = "Hello {name}, your task {task_name} is due on {deadline}."
    rendered = render_template(template, {
        "name": "Ahmed",
        "task_name": "Task 1",
        "deadline": "Friday 10 PM",
        "malicious_eval": "__import__('os').system('dir')"
    })
    assert rendered == "Hello Ahmed, your task Task 1 is due on Friday 10 PM."
    assert "malicious_eval" not in rendered

@pytest.fixture
async def test_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        yield session
    await engine.dispose()

@pytest.mark.asyncio
async def test_automation_precedence_and_task_cycle(test_db):
    """Verify that HR AutomationSettings override defaults, and task pre-deadline reminder runs."""
    now = datetime.now(timezone.utc)
    hr_user = User(
        id="hr_lead_1", email="lead@ops.org", hashed_password="pw",
        full_name="Lead 1", role="committee_hr_leader"
    )
    test_db.add(hr_user)

    # HR custom settings
    hr_settings = AutomationSettings(
        id="as_1",
        user_id="hr_lead_1",
        task_pre_enabled=True,
        task_pre_hours=48,  # 48 hours instead of 24
        task_pre_message="تنبيه مخصص: {name} لديك مهمة {task_name}",
        whatsapp_enabled=False,  # dry-run
    )
    test_db.add(hr_settings)

    student = Student(
        id="st_auto", student_code="S_AUTO", full_name="Ziad", arabic_name="زياد",
        email="ziad@ops.org", phone="+201000000001", status="ACTIVE"
    )
    test_db.add(student)

    # Task due in 36 hours (within 48h window, but outside standard 24h default)
    task = Task(
        id="t_auto",
        task_number=201,
        title="Architecture Diagram",
        deadline=now + timedelta(hours=36),
        created_by_user_id="hr_lead_1"
    )
    test_db.add(task)
    test_db.add(TaskAssignment(id="ta_auto", task_id="t_auto", student_id="st_auto"))
    test_db.add(Submission(id="sub_auto", task_id="t_auto", student_id="st_auto", status="PENDING"))
    await test_db.commit()

    engine = AutomationEngine()
    logs = await engine.run_task_cycle(test_db)

    # Must be triggered due to 48h HR override
    assert len(logs) == 1
    assert logs[0]["type"] == "TASK_PRE"
    assert logs[0]["student_id"] == "st_auto"

    # Second run immediately must be idempotent (no duplicate reminder sent)
    logs_second = await engine.run_task_cycle(test_db)
    assert len(logs_second) == 0
