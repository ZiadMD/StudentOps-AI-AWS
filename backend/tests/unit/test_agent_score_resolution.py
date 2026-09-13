"""
Unit tests for P3 fix: Dynamic student identity resolution in evaluation-score intent.

Verifies that the agent NEVER falls back to a hardcoded student ID and correctly:
  - Resolves a student by full English name.
  - Resolves a student by full name when another student exists in the DB.
  - Returns NOT_FOUND for unknown names (never substituting another student's score).
  - Resolves a student by exact student_code.
  - Returns AMBIGUOUS when multiple students match a short query.

Tests call tool_get_student and agent_engine.run_step directly against an isolated
in-memory SQLite database seeded via seed_all().
"""
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.database import Base
from app.seed.seed_data import seed_all
from app.agent.tools import tool_get_student
from app.agent.react_agent import agent_engine
from app.models.entities import Student


# ---------------------------------------------------------------------------
# Shared DB fixture
# ---------------------------------------------------------------------------

@pytest.fixture
async def db():
    """Isolated in-memory database seeded with standard operational data."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        await seed_all(session)
        yield session

    await engine.dispose()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def insert_student(db: AsyncSession, **kwargs) -> Student:
    """Insert an ad-hoc student for a specific test; flush so it is queryable."""
    s = Student(**kwargs)
    db.add(s)
    await db.flush()
    return s


# ---------------------------------------------------------------------------
# Test 1: Full English name resolves to the correct student (not std_ziad)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_resolve_maurine_magdy_adly_by_full_name(db):
    """
    Seeding a student 'Maurine Magdy Adly' and querying
    'What is Maurine Magdy Adly's evaluation score?' must resolve ONLY to her
    and never to std_ziad or any other seeded student.
    """
    await insert_student(
        db,
        id="std_test_maurine",
        student_code="TEST-2026-M01",
        full_name="Maurine Magdy Adly",
        arabic_name="مورين مجدي عدلي",
        email="maurine.magdy@studentops.test",
        phone="+201000000001",
        team_id="team_tech",
        status="ACTIVE",
    )

    # Low-level: tool_get_student must find Maurine by full English name
    result = await tool_get_student(db, "Maurine Magdy Adly")
    assert result.get("found") is True, f"Expected student found, got: {result}"
    assert result["student"]["id"] == "std_test_maurine", (
        f"Expected std_test_maurine, got {result['student']['id']}"
    )

    # High-level: agent must resolve to Maurine and call get_student_score for her ID.
    agent_resp = await agent_engine.run_step(
        query="What is Maurine Magdy Adly's evaluation score?",
        conversation_id="test_conv_maurine",
        db=db,
        user_role="HR_LEAD",
    )
    assert agent_resp is not None
    score_calls = [t for t in agent_resp.tool_executions if t.tool_name == "get_student_score"]
    assert len(score_calls) == 1, f"Expected 1 get_student_score call, got {len(score_calls)}"
    called_with = score_calls[0].parameters.get("student_id_or_name")
    assert called_with == "std_test_maurine", (
        f"get_student_score was called with '{called_with}' instead of 'std_test_maurine'. "
        "Hardcoded ID fallback still present."
    )


# ---------------------------------------------------------------------------
# Test 2: Full name resolves correctly in a database with many other students
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_resolve_alaa_among_many_students(db):
    """
    'What is Alaa Mohamed Hassan's evaluation score?' must resolve only to Alaa
    even though the seeded DB contains other 'Mohamed' tokens elsewhere.
    """
    await insert_student(
        db,
        id="std_test_alaa",
        student_code="TEST-2026-A01",
        full_name="Alaa Mohamed Hassan",
        arabic_name="علاء محمد حسن",
        email="alaa.hassan@studentops.test",
        phone="+201000000002",
        team_id="team_ops",
        status="ACTIVE",
    )

    result = await tool_get_student(db, "Alaa Mohamed Hassan")
    assert result.get("found") is True, f"Expected student found, got: {result}"
    assert result["student"]["id"] == "std_test_alaa", (
        f"Expected std_test_alaa, got {result['student']['id']}"
    )

    agent_resp = await agent_engine.run_step(
        query="What is Alaa Mohamed Hassan's evaluation score?",
        conversation_id="test_conv_alaa",
        db=db,
        user_role="HR_LEAD",
    )
    score_calls = [t for t in agent_resp.tool_executions if t.tool_name == "get_student_score"]
    assert len(score_calls) == 1
    called_with = score_calls[0].parameters.get("student_id_or_name")
    assert called_with == "std_test_alaa", (
        f"get_student_score called with '{called_with}' instead of 'std_test_alaa'."
    )


# ---------------------------------------------------------------------------
# Test 3: Unknown student returns NOT_FOUND — never another student's score
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unknown_student_returns_not_found_never_std_ziad(db):
    """
    Querying an unknown student must return a NOT_FOUND message.
    The agent must NOT call get_student_score at all in this case.
    """
    agent_resp = await agent_engine.run_step(
        query="What is Ximena Totally Unknown's evaluation score?",
        conversation_id="test_conv_unknown",
        db=db,
        user_role="HR_LEAD",
    )
    assert agent_resp is not None

    # No get_student_score should have been called
    score_calls = [t for t in agent_resp.tool_executions if t.tool_name == "get_student_score"]
    assert len(score_calls) == 0, (
        f"get_student_score was unexpectedly called for an unknown student: {score_calls}"
    )

    # Response must indicate not found
    resp_lower = agent_resp.response.lower()
    assert "not found" in resp_lower or "لم يتم العثور" in agent_resp.response, (
        f"Expected 'not found' message, got: {agent_resp.response[:200]}"
    )

    # Crucially, must NOT reference std_ziad as the resolved student
    assert "std_ziad" not in agent_resp.response, (
        "Response should not reference std_ziad for an unknown student."
    )


# ---------------------------------------------------------------------------
# Test 4: Student code resolves to the correct student
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_resolve_by_student_code_core_2026_001(db):
    """
    Querying by exact student code 'CORE-2026-001' must resolve to Ziad Mohamed
    (seeded owner of that code) and call get_student_score for std_ziad.
    """
    agent_resp = await agent_engine.run_step(
        query="What is CORE-2026-001's evaluation score?",
        conversation_id="test_conv_code_ziad",
        db=db,
        user_role="HR_LEAD",
    )
    assert agent_resp is not None

    score_calls = [t for t in agent_resp.tool_executions if t.tool_name == "get_student_score"]
    assert len(score_calls) == 1, (
        f"Expected exactly 1 get_student_score call, got {len(score_calls)}"
    )
    called_with = score_calls[0].parameters.get("student_id_or_name")
    assert called_with == "std_ziad", (
        f"CORE-2026-001 should resolve to std_ziad, but got '{called_with}'"
    )


# ---------------------------------------------------------------------------
# Test 5: Ambiguous short name returns AMBIGUOUS — never silently picks first
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ambiguous_short_name_returns_disambiguation_message(db):
    """
    Seeding two students who share a token 'Farida' and querying
    'What is Farida's evaluation score?' must return an AMBIGUOUS response
    listing both candidates, without calling get_student_score.
    """
    await insert_student(
        db,
        id="std_test_farida_yasser",
        student_code="TEST-2026-F01",
        full_name="Farida Yasser",
        arabic_name="فريدة ياسر",
        email="farida.yasser@studentops.test",
        phone="+201000000010",
        team_id="team_ops",
        status="ACTIVE",
    )
    await insert_student(
        db,
        id="std_test_farida_kamal",
        student_code="TEST-2026-F02",
        full_name="Farida Kamal",
        arabic_name="فريدة كمال",
        email="farida.kamal@studentops.test",
        phone="+201000000011",
        team_id="team_tech",
        status="ACTIVE",
    )

    # Verify tool_get_student detects ambiguity
    lookup = await tool_get_student(db, "Farida")
    assert lookup.get("ambiguous") is True, (
        f"Expected ambiguous result for 'Farida', got: {lookup}"
    )
    match_ids = {m["id"] for m in lookup.get("matches", [])}
    assert "std_test_farida_yasser" in match_ids
    assert "std_test_farida_kamal" in match_ids

    # Verify agent returns disambiguation response without calling get_student_score
    agent_resp = await agent_engine.run_step(
        query="What is Farida's evaluation score?",
        conversation_id="test_conv_ambiguous_farida",
        db=db,
        user_role="HR_LEAD",
    )
    score_calls = [t for t in agent_resp.tool_executions if t.tool_name == "get_student_score"]
    assert len(score_calls) == 0, (
        f"get_student_score should NOT be called for an ambiguous match, but was called: {score_calls}"
    )

    # Response must indicate multiple matches or ask for clarification
    resp = agent_resp.response
    assert (
        "Multiple students" in resp
        or "multiple" in resp.lower()
        or "Farida" in resp
        or "Yasser" in resp
        or "Kamal" in resp
    ), f"Expected disambiguation message mentioning candidates, got: {resp[:300]}"
