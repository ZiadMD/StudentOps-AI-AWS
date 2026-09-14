"""
Unit tests for dynamic meeting resolution in Agent attendance queries.

Verifies:
  1. tool_get_meeting_attendance dynamically resolves the latest meeting when meeting_id is None, 'today', or 'latest'.
  2. team_id scoping is preserved when resolving the latest meeting.
  3. Generic queries (e.g. 'Who was absent from today's meeting?') resolve the latest meeting without today_sync.
  4. Explicit meeting IDs and meeting codes are preserved and resolved correctly.
  5. When no meetings exist, a clean not-found response is returned without crashes or false positives.
"""
from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.database import Base
from app.agent.tools import tool_get_meeting_attendance
from app.agent.react_agent import agent_engine
from app.models.entities import Meeting, Student, Team, AttendanceRecord


# ---------------------------------------------------------------------------
# DB Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def empty_db():
    """Isolated in-memory database with schema created, but zero seed data."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        yield session

    await engine.dispose()


@pytest.fixture
async def populated_db(empty_db: AsyncSession):
    """Database populated with teams, students, and non-today_sync meetings."""
    db = empty_db

    # Teams
    team_tech = Team(id="team_tech", name="Technical", code="TECH")
    team_media = Team(id="team_media", name="Media", code="MEDIA")
    db.add_all([team_tech, team_media])

    # Students
    std_1 = Student(
        id="std_test_1", student_code="TEST-001", full_name="Student One",
        arabic_name="طالب واحد", email="one@test.org", phone="+201000000001",
        team_id="team_tech", status="ACTIVE"
    )
    std_2 = Student(
        id="std_test_2", student_code="TEST-002", full_name="Student Two",
        arabic_name="طالب اثنان", email="two@test.org", phone="+201000000002",
        team_id="team_media", status="ACTIVE"
    )
    db.add_all([std_1, std_2])

    # Meetings (deliberately NOT named today_sync)
    base_time = datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
    meet_early = Meeting(
        id="meet_session_1",
        meeting_code="meet_session_1",
        title="Session 1: Orientation",
        start_time=base_time,
        end_time=base_time + timedelta(hours=1),
        session_number=1,
        team_id="team_tech",
        status="COMPLETED"
    )
    meet_late = Meeting(
        id="meet_session_2",
        meeting_code="custom_code_session_2",
        title="Session 2: Architecture Review",
        start_time=base_time + timedelta(days=7),
        end_time=base_time + timedelta(days=7, hours=1),
        session_number=2,
        team_id="team_tech",
        status="COMPLETED"
    )
    meet_media_latest = Meeting(
        id="meet_media_sync",
        meeting_code="media_weekly_code",
        title="Session 3: Media Planning",
        start_time=base_time + timedelta(days=10),
        end_time=base_time + timedelta(days=10, hours=1),
        session_number=3,
        team_id="team_media",
        status="COMPLETED"
    )
    db.add_all([meet_early, meet_late, meet_media_latest])

    # Attendance records
    db.add_all([
        AttendanceRecord(
            id="att_1", meeting_id="meet_session_2", student_id="std_test_1",
            status="PRESENT", total_duration_minutes=55.0
        ),
        AttendanceRecord(
            id="att_2", meeting_id="meet_session_2", student_id="std_test_2",
            status="UNEXCUSED_ABSENT", total_duration_minutes=0.0
        ),
        AttendanceRecord(
            id="att_3", meeting_id="meet_media_sync", student_id="std_test_2",
            status="PRESENT", total_duration_minutes=60.0
        ),
    ])
    await db.commit()
    return db


# ---------------------------------------------------------------------------
# Test 1: Latest meeting resolution in tool_get_meeting_attendance
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tool_resolves_latest_meeting_dynamically(populated_db: AsyncSession):
    """
    When meeting_id is None or 'latest', the tool should dynamically resolve
    the meeting with the most recent start_time (meet_media_sync).
    """
    # Test None
    res_none = await tool_get_meeting_attendance(populated_db, meeting_id=None)
    assert res_none["success"] is True
    assert res_none["meeting"]["id"] == "meet_media_sync"
    assert res_none["meeting"]["title"] == "Session 3: Media Planning"

    # Test 'latest'
    res_latest = await tool_get_meeting_attendance(populated_db, meeting_id="latest")
    assert res_latest["success"] is True
    assert res_latest["meeting"]["id"] == "meet_media_sync"

    # Test 'today'
    res_today = await tool_get_meeting_attendance(populated_db, meeting_id="today")
    assert res_today["success"] is True
    assert res_today["meeting"]["id"] == "meet_media_sync"


# ---------------------------------------------------------------------------
# Test 2: Team scoping when resolving the latest meeting
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tool_resolves_latest_meeting_with_team_scoping(populated_db: AsyncSession):
    """
    When team_id is provided, latest resolution should pick the latest meeting
    belonging to that team (meet_session_2 for team_tech), not a newer meeting from another team.
    """
    res = await tool_get_meeting_attendance(populated_db, meeting_id=None, team_id="team_tech")
    assert res["success"] is True
    assert res["meeting"]["id"] == "meet_session_2"
    assert res["meeting"]["title"] == "Session 2: Architecture Review"


# ---------------------------------------------------------------------------
# Test 3: Generic attendance query without today_sync in database
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_generic_attendance_query_without_today_sync(populated_db: AsyncSession):
    """
    User asks 'Who was absent from today's meeting?'.
    The agent should execute get_meeting_attendance with meeting_id='latest',
    successfully resolving the latest meeting without any hardcoded 'today_sync' dependency.
    """
    agent_resp = await agent_engine.run_step(
        query="Who was absent from today's meeting?",
        conversation_id="test_conv_generic",
        db=populated_db,
        user_role="HR_LEAD"
    )
    assert agent_resp is not None
    assert len(agent_resp.tool_executions) == 1
    call = agent_resp.tool_executions[0]
    assert call.tool_name == "get_meeting_attendance"
    assert call.status == "SUCCESS"
    assert call.parameters.get("meeting_id") == "latest"

    # Verified the resolved meeting was meet_media_sync (the latest)
    result = call.result
    assert result["meeting"]["id"] == "meet_media_sync"


# ---------------------------------------------------------------------------
# Test 4: Explicit meeting ID, meeting code, or session number
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_explicit_meeting_id_and_code_still_works(populated_db: AsyncSession):
    """
    Explicitly referencing a specific meeting ID or custom meeting code must resolve
    that exact meeting even when it is older than the latest meeting.
    """
    # 1. Direct tool call by explicit meeting ID
    res_id = await tool_get_meeting_attendance(populated_db, meeting_id="meet_session_1")
    assert res_id["success"] is True
    assert res_id["meeting"]["id"] == "meet_session_1"

    # 2. Direct tool call by custom meeting code
    res_code = await tool_get_meeting_attendance(populated_db, meeting_id="custom_code_session_2")
    assert res_code["success"] is True
    assert res_code["meeting"]["id"] == "meet_session_2"

    # 3. Agent query with explicit meeting ID
    agent_resp = await agent_engine.run_step(
        query="Who was absent from meet_session_1?",
        conversation_id="test_conv_explicit",
        db=populated_db,
        user_role="HR_LEAD"
    )
    assert agent_resp is not None
    call = agent_resp.tool_executions[0]
    assert call.parameters.get("meeting_id") == "meet_session_1"
    assert call.result["meeting"]["id"] == "meet_session_1"


# ---------------------------------------------------------------------------
# Test 5: No meeting exists returns clean failure
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_meeting_exists_handled_gracefully(empty_db: AsyncSession):
    """
    When no meetings exist in the database, tool_get_meeting_attendance and agent_engine
    must return a clean error/not-found response without unhandled exceptions.
    """
    # Tool call returns failure cleanly
    res = await tool_get_meeting_attendance(empty_db, meeting_id=None)
    assert res["success"] is False
    assert "No meetings found" in res["message"]

    # Agent step returns clear user feedback
    agent_resp = await agent_engine.run_step(
        query="Who was absent from today's meeting?",
        conversation_id="test_conv_empty",
        db=empty_db,
        user_role="HR_LEAD"
    )
    assert agent_resp is not None
    assert "Could not retrieve attendance" in agent_resp.response or "لم يتم العثور" in agent_resp.response


# ---------------------------------------------------------------------------
# Test 6: Arabic attendance queries route to get_meeting_attendance
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.parametrize("query_text", [
    "مين كان غايب في آخر ميتينج؟",
    "مين غاب في آخر اجتماع؟",
    "مين كان حاضر في آخر ميتينج؟",
    "غياب آخر ميتينج",
    "مين غايب النهاردة؟",
    "مين حضر في آخر ميتينج؟"
])
async def test_arabic_attendance_queries_route_to_get_meeting_attendance(populated_db: AsyncSession, query_text: str):
    """
    Arabic dialectal and formal attendance queries must route to get_meeting_attendance
    (NOT get_upcoming_events) and resolve the latest meeting dynamically.
    """
    agent_resp = await agent_engine.run_step(
        query=query_text,
        conversation_id=f"test_conv_ar_{hash(query_text)}",
        db=populated_db,
        user_role="HR_LEAD"
    )
    assert agent_resp is not None
    assert len(agent_resp.tool_executions) == 1, f"Expected 1 tool execution for '{query_text}'"
    call = agent_resp.tool_executions[0]
    assert call.tool_name == "get_meeting_attendance", (
        f"Query '{query_text}' incorrectly routed to {call.tool_name} instead of get_meeting_attendance"
    )
    assert call.status == "SUCCESS"
    assert call.parameters.get("meeting_id") == "latest"
    assert call.result["meeting"]["id"] == "meet_media_sync"

