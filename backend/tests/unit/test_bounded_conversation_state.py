import time
import pytest
from app.agent.react_agent import BoundedConversationState, CONVERSATION_STATE, agent_engine
from app.core.config import settings
from unittest.mock import patch, AsyncMock
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.models.entities import Base
from app.seed.seed_data import seed_all


def test_bounded_state_stores_and_retrieves_normally():
    state_store = BoundedConversationState(max_entries=10, ttl_seconds=60)
    state = state_store.setdefault('user1:conv1', {'history': [], 'last_absent_student_ids': []})
    assert state['history'] == []
    state['history'].append({'role': 'user', 'content': 'hello'})

    fetched = state_store.get('user1:conv1')
    assert fetched is not None
    assert fetched['history'] == [{'role': 'user', 'content': 'hello'}]
    assert 'user1:conv1' in state_store
    assert len(state_store) == 1


def test_bounded_state_expired_entries_are_removed():
    # TTL of 0.05 seconds
    state_store = BoundedConversationState(max_entries=10, ttl_seconds=0.05)
    state_store['user1:conv1'] = {'test': 123}
    assert 'user1:conv1' in state_store
    assert state_store.get('user1:conv1') == {'test': 123}

    # Wait for expiry
    time.sleep(0.08)

    # get() returns default and evicts
    assert state_store.get('user1:conv1') is None
    assert 'user1:conv1' not in state_store
    assert len(state_store) == 0


def test_bounded_state_setdefault_recreates_expired():
    state_store = BoundedConversationState(max_entries=10, ttl_seconds=0.05)
    s1 = state_store.setdefault('user1:conv1', {'count': 1})
    s1['count'] = 42

    time.sleep(0.08)

    # setdefault on expired key should discard stale data and re-initialize
    s2 = state_store.setdefault('user1:conv1', {'count': 1})
    assert s2['count'] == 1


def test_bounded_state_maximum_size_is_bounded_lru():
    # Max entries = 3
    state_store = BoundedConversationState(max_entries=3, ttl_seconds=3600)
    state_store['k1'] = {'val': 1}
    state_store['k2'] = {'val': 2}
    state_store['k3'] = {'val': 3}
    assert len(state_store) == 3

    # Add 4th entry -> oldest (k1) must be evicted
    state_store['k4'] = {'val': 4}
    assert len(state_store) == 3
    assert 'k1' not in state_store
    assert 'k2' in state_store
    assert 'k3' in state_store
    assert 'k4' in state_store


def test_active_recent_conversations_are_preserved():
    state_store = BoundedConversationState(max_entries=3, ttl_seconds=3600)
    state_store['k1'] = {'val': 1}
    state_store['k2'] = {'val': 2}
    state_store['k3'] = {'val': 3}

    # Access k1 to make it most recently used
    _ = state_store.get('k1')

    # Add k4 -> k2 (least recently used) must be evicted, k1 must be preserved
    state_store['k4'] = {'val': 4}
    assert len(state_store) == 3
    assert 'k1' in state_store
    assert 'k2' not in state_store
    assert 'k3' in state_store
    assert 'k4' in state_store


def test_cleanup_expired_explicit_method():
    state_store = BoundedConversationState(max_entries=10, ttl_seconds=0.05)
    state_store['k1'] = {'val': 1}
    state_store['k2'] = {'val': 2}

    time.sleep(0.08)
    evicted = state_store.cleanup_expired()
    assert evicted == 2
    assert len(state_store) == 0


@pytest.mark.asyncio
async def test_agent_run_step_integrates_with_bounded_state():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:', echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as db:
        await seed_all(db)

        # Clear global state
        CONVERSATION_STATE.clear()

        conv_id = 'test_bounded_agent_conv'
        resp = await agent_engine.run_step(
            query='Who was absent today?',
            conversation_id=conv_id,
            db=db,
            user_role='HR_LEAD',
            user_id='usr_test_bounded'
        )
        assert resp.conversation_id == conv_id

        # Verify state is populated in CONVERSATION_STATE
        scoped_key = 'usr_test_bounded:test_bounded_agent_conv'
        assert scoped_key in CONVERSATION_STATE
        stored = CONVERSATION_STATE.get(scoped_key)
        assert stored is not None
        assert 'last_absent_student_ids' in stored
