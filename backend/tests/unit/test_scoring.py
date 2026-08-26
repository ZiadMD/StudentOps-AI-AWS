"""
Unit tests for 8.xlsx Scoring Standards.
"""
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.database import Base
from app.seed.seed_data import seed_all
from app.services.scoring_service import ScoringService


@pytest.mark.asyncio
async def test_scoring_summary_matches_8_xlsx():
    # Setup in-memory test database
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as db:
        await seed_all(db)

        # 1. Maurine Magdy (8.xlsx: 5 On-time att, 3 tasks on time, avg quality 9.0, total behavior 23/23)
        summary_m = await ScoringService.get_student_score_summary("std_maurine", db)
        assert summary_m is not None
        assert summary_m.total_behavior_score == 23.0
        assert summary_m.on_time_task_count == 3
        assert summary_m.overall_rating == "Outstanding"

        # 2. Hanan Ahmed (8.xlsx: 2 On-time att, 3 absences, 0 tasks on time, avg quality 0.0, total behavior 18/23)
        summary_h = await ScoringService.get_student_score_summary("std_hanan", db)
        assert summary_h is not None
        assert summary_h.total_behavior_score == 18.0
        assert summary_h.absence_count >= 2
        assert summary_h.overall_rating == "Needs Improvement"
