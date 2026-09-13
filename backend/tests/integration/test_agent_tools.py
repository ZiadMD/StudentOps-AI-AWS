"""
Integration tests for Agent Tools and Safety Barriers.
"""
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.database import Base
from app.seed.seed_data import seed_all
from app.agent.tools import (
    tool_get_meeting_attendance,
    tool_get_upcoming_meetings,
    tool_prepare_reminder,
    tool_send_reminder,
    tool_get_student_score
)
from app.models.schemas import PermissionContext


@pytest.mark.asyncio
async def test_meeting_attendance_tool_returns_grounded_data():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as db:
        await seed_all(db)
        context = PermissionContext(
            user_id="integration_admin",
            role="hr_admin",
            is_admin_override=True,
        )

        res = await tool_get_meeting_attendance(db=db, context=context, meeting_id="today_sync")
        assert res["success"] is True
        assert res["summary"]["present_count"] >= 2
        assert res["summary"]["absent_count"] >= 1
        
        absent_ids = [s["student_id"] for s in res["absent_students"]]
        assert "std_salma" in absent_ids


@pytest.mark.asyncio
async def test_send_reminder_requires_confirmation():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as db:
        await seed_all(db)
        context = PermissionContext(
            user_id="integration_admin",
            role="hr_admin",
            is_admin_override=True,
        )

        # Calling send_reminder without is_confirmed=True MUST be intercepted
        res = await tool_send_reminder(
            db=db,
            context=context,
            student_ids=["std_salma"],
            is_confirmed=False
        )
        assert res["status"] == "REQUIRES_CONFIRMATION"
        assert "preview_data" in res
        assert res["preview_data"]["target_count"] == 1

        # Calling with is_confirmed=True executes successfully
        exec_res = await tool_send_reminder(
            db=db,
            context=context.model_copy(update={"is_confirmed_action": True}),
            student_ids=["std_salma"],
            is_confirmed=True
        )
        assert exec_res["success"] is True
        assert exec_res["sent_count"] == 1
