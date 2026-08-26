"""
Evaluation Suite: Multi-turn primary demo scenario.
Story:
1. HR asks: "Who was absent from today's meeting?"
2. Agent executes `get_meeting_attendance` -> identifies Hanan Ahmed Ramadan.
3. HR asks: "Remind them about the next meeting."
4. Agent executes `get_upcoming_meetings` & `prepare_reminder` -> raises Confirmation Barrier.
5. User confirms -> dispatches reminder via provider and updates Audit Trail.
"""
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.database import Base
from app.seed.seed_data import seed_all
from app.agent.react_agent import agent_engine
from app.models.entities import AgentActionAudit
from sqlalchemy import select


@pytest.mark.asyncio
async def test_primary_demo_workflow_end_to_end():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as db:
        await seed_all(db)

        conv_id = "eval_conv_demo_1"

        # Turn 1: HR asks about absence
        turn1_resp = await agent_engine.run_step(
            query="Who was absent from today's meeting?",
            conversation_id=conv_id,
            db=db,
            user_role="HR_LEAD"
        )
        assert turn1_resp.conversation_id == conv_id
        assert len(turn1_resp.tool_executions) == 1
        assert turn1_resp.tool_executions[0].tool_name == "get_meeting_attendance"
        assert "Hanan" in turn1_resp.response or "حنان" in turn1_resp.response
        assert turn1_resp.requires_confirmation is False

        # Turn 2: HR asks to remind absent members
        turn2_resp = await agent_engine.run_step(
            query="Remind them about the next meeting",
            conversation_id=conv_id,
            db=db,
            user_role="HR_LEAD"
        )
        assert turn2_resp.requires_confirmation is True
        assert turn2_resp.pending_confirmation is not None
        assert turn2_resp.pending_confirmation.tool_name == "send_reminder"
        assert turn2_resp.pending_confirmation.target_count == 1
        
        # Verify Tool Executions in Turn 2
        tool_names = [t.tool_name for t in turn2_resp.tool_executions]
        assert "get_upcoming_meetings" in tool_names
        assert "prepare_reminder" in tool_names

        # Verify Audit Log
        audit_res = await db.execute(select(AgentActionAudit).where(AgentActionAudit.intent == "SEND_REMINDER"))
        audit_entry = audit_res.scalar_one_or_none()
        assert audit_entry is not None
        assert audit_entry.status == "PENDING_CONFIRMATION"
        assert audit_entry.requires_confirmation is True
