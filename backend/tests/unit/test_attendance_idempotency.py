import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from app.core.database import Base
from app.models.entities import Meeting, Student, AttendanceRecord, ParticipantSession
from app.services.attendance_service import AttendanceService, AttendancePolicyEngine
from app.providers.attendance_provider import AttendanceProvider, RawMeetingAttendance, RawParticipantSession

class DummyAttendanceProvider(AttendanceProvider):
    def __init__(self, raw_sessions=None):
        self.raw_sessions = raw_sessions or []

    async def get_raw_meeting_attendance(self, meeting_code: str) -> RawMeetingAttendance:
        return RawMeetingAttendance(
            meeting_code=meeting_code,
            title="Test Meeting",
            start_time=datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc),
            end_time=datetime(2026, 9, 1, 11, 0, tzinfo=timezone.utc),
            sessions=self.raw_sessions
        )

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
async def test_attendance_processing_is_idempotent(test_db):
    """Verify that repeatedly processing attendance for a meeting is completely idempotent and does not crash."""
    meeting_start = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
    meeting = Meeting(
        id="meet_1",
        meeting_code="abc-defg-hij",
        title="Sprint Review",
        start_time=meeting_start,
        end_time=meeting_start + timedelta(minutes=60),
        duration_minutes=60,
    )
    test_db.add(meeting)

    student1 = Student(
        id="std_1",
        student_code="S001",
        full_name="Ahmed Mohamed",
        arabic_name="أحمد محمد",
        email="ahmed@studentops.org",
        phone="+201012345678",
    )
    student2 = Student(
        id="std_2",
        student_code="S002",
        full_name="Sara Ali",
        arabic_name="سارة علي",
        email="sara@studentops.org",
        phone="+201098765432",
    )
    test_db.add(student1)
    test_db.add(student2)
    await test_db.commit()

    raw_sessions = [
        RawParticipantSession(
            display_name="Ahmed Mohamed",
            email="ahmed@studentops.org",
            join_time=meeting_start + timedelta(minutes=2),
            leave_time=meeting_start + timedelta(minutes=55),
            duration_seconds=53 * 60,
        )
    ]
    provider = DummyAttendanceProvider(raw_sessions=raw_sessions)
    service = AttendanceService(provider)

    # 1. First execution
    records_1 = await service.process_meeting_attendance(meeting.id, test_db)
    assert len(records_1) == 2

    # Verify participant session created
    p_res1 = await test_db.execute(select(ParticipantSession).where(ParticipantSession.meeting_id == meeting.id))
    p_sessions1 = p_res1.scalars().all()
    assert len(p_sessions1) == 1

    # 2. Second execution (re-processing) - MUST NOT raise IntegrityError
    records_2 = await service.process_meeting_attendance(meeting.id, test_db)
    assert len(records_2) == 2

    # Participant sessions must still be 1 (not duplicated)
    p_res2 = await test_db.execute(select(ParticipantSession).where(ParticipantSession.meeting_id == meeting.id))
    p_sessions2 = p_res2.scalars().all()
    assert len(p_sessions2) == 1

    # Total attendance records in DB must still be exactly 2
    att_res = await test_db.execute(select(AttendanceRecord).where(AttendanceRecord.meeting_id == meeting.id))
    all_att = att_res.scalars().all()
    assert len(all_att) == 2

@pytest.mark.asyncio
async def test_reprocessing_preserves_excuse(test_db):
    """Verify that re-processing attendance preserves previously accepted excuses."""
    meeting_start = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
    meeting = Meeting(
        id="meet_excuse",
        meeting_code="excuse-test",
        title="Excuse Test Meeting",
        start_time=meeting_start,
        end_time=meeting_start + timedelta(minutes=60),
        duration_minutes=60,
    )
    student = Student(
        id="std_excused",
        student_code="S003",
        full_name="Mahmoud Hassan",
        arabic_name="محمود حسن",
        email="mahmoud@studentops.org",
        phone="+201011112222",
    )
    test_db.add(meeting)
    test_db.add(student)
    await test_db.commit()

    provider = DummyAttendanceProvider(raw_sessions=[])
    service = AttendanceService(provider)

    # Initial process -> Absent
    records = await service.process_meeting_attendance(meeting.id, test_db)
    assert records[0].status == "UNEXCUSED_ABSENT"

    # HR approves excuse
    records[0].excuse_status = "EXCUSED_ACCEPTED"
    records[0].excuse_reason = "Medical emergency"
    await test_db.commit()

    # Re-process -> status should now be EXCUSED_ACCEPTED
    updated_records = await service.process_meeting_attendance(meeting.id, test_db)
    assert updated_records[0].status == "EXCUSED_ACCEPTED"
    assert updated_records[0].excuse_status == "EXCUSED_ACCEPTED"

@pytest.mark.asyncio
async def test_configurable_grace_period(test_db):
    """Verify that late_threshold_minutes dynamically adjusts PRESENT vs LATE classification."""
    meeting_start = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
    meeting = Meeting(
        id="meet_grace",
        meeting_code="grace-test",
        title="Grace Test Meeting",
        start_time=meeting_start,
        end_time=meeting_start + timedelta(minutes=60),
        duration_minutes=60,
    )
    student = Student(
        id="std_grace",
        student_code="S004",
        full_name="Omar Tarek",
        arabic_name="عمر طارق",
        email="omar@studentops.org",
        phone="+201033334444",
    )
    test_db.add(meeting)
    test_db.add(student)
    await test_db.commit()

    # Joined 12 minutes after start
    raw_sessions = [
        RawParticipantSession(
            display_name="Omar Tarek",
            email="omar@studentops.org",
            join_time=meeting_start + timedelta(minutes=12),
            leave_time=meeting_start + timedelta(minutes=58),
            duration_seconds=46 * 60,
        )
    ]
    provider = DummyAttendanceProvider(raw_sessions=raw_sessions)
    service = AttendanceService(provider)

    # Default grace threshold (10 min) -> Joined at 12m -> LATE
    records_default = await service.process_meeting_attendance(meeting.id, test_db, late_threshold_minutes=10)
    assert records_default[0].status == "LATE"

    # Custom extended grace threshold (15 min) -> Joined at 12m -> PRESENT
    records_extended = await service.process_meeting_attendance(meeting.id, test_db, late_threshold_minutes=15)
    assert records_extended[0].status == "PRESENT"
