import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.database import Base
from app.models.entities import Task, Student, Submission, TaskAssignment, User
from app.api.routes_tasks import get_task_reminder_candidates

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
async def test_hr_task_with_empty_assignments_fails_closed(test_db):
    """Verify that new HR-owned tasks with empty assignments FAIL CLOSED (never broadcast to all students)."""
    now = datetime.now(timezone.utc)
    hr_user = User(
        id="hr_1",
        email="hr@studentops.org",
        hashed_password="hash",
        full_name="HR Leader",
        role="committee_hr_leader",
    )
    test_db.add(hr_user)

    student1 = Student(
        id="s1", student_code="S1", full_name="Student One", arabic_name="طالب 1",
        email="s1@test.com", phone="+201011112222", status="ACTIVE"
    )
    student2 = Student(
        id="s2", student_code="S2", full_name="Student Two", arabic_name="طالب 2",
        email="s2@test.com", phone="+201033334444", status="ACTIVE"
    )
    test_db.add(student1)
    test_db.add(student2)

    # HR-owned task with NO explicit assignments
    task_empty = Task(
        id="t_empty",
        task_number=101,
        title="Confidential Team Task",
        deadline=now + timedelta(hours=12),
        created_by_user_id="hr_1"
    )
    test_db.add(task_empty)
    await test_db.commit()

    # Fail closed: must return []
    candidates = await get_task_reminder_candidates("t_empty", test_db)
    assert candidates == []

@pytest.mark.asyncio
async def test_explicit_task_assignments_and_latest_submission_check(test_db):
    """Verify that only assigned students who have NOT submitted are returned as candidates."""
    now = datetime.now(timezone.utc)
    hr_user = User(
        id="hr_2", email="hr2@studentops.org", hashed_password="hash",
        full_name="HR Leader 2", role="committee_hr_leader"
    )
    test_db.add(hr_user)

    s1 = Student(id="st_1", student_code="ST1", full_name="Alice", arabic_name="أليس", email="a@t.com", phone="+20101", status="ACTIVE")
    s2 = Student(id="st_2", student_code="ST2", full_name="Bob", arabic_name="بوب", email="b@t.com", phone="+20102", status="ACTIVE")
    s3 = Student(id="st_3", student_code="ST3", full_name="Charlie", arabic_name="تشارلي", email="c@t.com", phone="+20103", status="ACTIVE")
    test_db.add_all([s1, s2, s3])

    task = Task(
        id="t_assigned",
        task_number=102,
        title="Project Milestone",
        deadline=now + timedelta(hours=6),
        created_by_user_id="hr_2"
    )
    test_db.add(task)

    # Explicitly assign only s1 and s2 (s3 is not assigned)
    test_db.add(TaskAssignment(id="ta_1", task_id="t_assigned", student_id="st_1"))
    test_db.add(TaskAssignment(id="ta_2", task_id="t_assigned", student_id="st_2"))

    # s1 has submitted ON_TIME
    test_db.add(Submission(id="sub_1", task_id="t_assigned", student_id="st_1", status="ON_TIME", submitted_at=now))
    # s2 has PENDING submission
    test_db.add(Submission(id="sub_2", task_id="t_assigned", student_id="st_2", status="PENDING"))

    await test_db.commit()

    candidates = await get_task_reminder_candidates("t_assigned", test_db)
    # Only s2 should be candidate
    assert len(candidates) == 1
    assert candidates[0].id == "st_2"

    # Now s2 submits late
    sub_2 = (await test_db.get(Submission, "sub_2"))
    sub_2.status = "LATE"
    await test_db.commit()

    # Re-checking latest submission -> candidates must be empty
    new_candidates = await get_task_reminder_candidates("t_assigned", test_db)
    assert new_candidates == []
