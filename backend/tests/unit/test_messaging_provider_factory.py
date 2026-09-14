import pytest
from unittest.mock import AsyncMock, patch
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from datetime import datetime, timezone

from app.core.config import settings
from app.models.entities import Base
from app.seed.seed_data import seed_all
from app.providers.messaging_provider import (
    get_messaging_provider,
    MockMessagingProvider,
    MessageDeliveryResult,
)
from app.providers.openwa_provider import OpenWAProvider
from app.agent.tools import tool_send_reminder, get_reminder_service


def test_factory_returns_mock_by_default():
    with patch.object(settings, 'MESSAGING_PROVIDER', 'mock'):
        provider = get_messaging_provider()
        assert isinstance(provider, MockMessagingProvider)


def test_factory_returns_openwa_when_configured():
    with patch.object(settings, 'MESSAGING_PROVIDER', 'openwa'):
        provider = get_messaging_provider()
        assert isinstance(provider, OpenWAProvider)


def test_factory_explicit_argument_overrides_settings():
    with patch.object(settings, 'MESSAGING_PROVIDER', 'mock'):
        provider = get_messaging_provider('openwa')
        assert isinstance(provider, OpenWAProvider)

    with patch.object(settings, 'MESSAGING_PROVIDER', 'openwa'):
        provider = get_messaging_provider('mock')
        assert isinstance(provider, MockMessagingProvider)


def test_factory_rejects_unsupported_provider():
    with pytest.raises(ValueError, match='Unsupported messaging provider'):
        get_messaging_provider('telegram')

    with pytest.raises(ValueError, match='Unsupported messaging provider'):
        get_messaging_provider('sms')

    with patch.object(settings, 'MESSAGING_PROVIDER', 'invalid_provider'):
        with pytest.raises(ValueError, match='Unsupported messaging provider'):
            get_messaging_provider()


@pytest.mark.asyncio
async def test_agent_reminder_path_uses_configured_openwa():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:', echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as db:
        await seed_all(db)

        with patch.object(settings, 'MESSAGING_PROVIDER', 'openwa'):
            service = get_reminder_service()
            assert isinstance(service.provider, OpenWAProvider)

            now = datetime.now(timezone.utc)
            mock_result = [
                MessageDeliveryResult(
                    success=True,
                    message_id='owa_mock_123',
                    recipient_phone='201000000000',
                    channel='WHATSAPP_OFFICIAL',
                    delivered_at=now,
                    delivery_status='DELIVERED',
                )
            ]

            with patch.object(OpenWAProvider, 'send_batch', new_callable=AsyncMock) as mock_send_batch:
                mock_send_batch.return_value = mock_result

                res = await tool_send_reminder(
                    db=db,
                    student_ids=['std_salma'],
                    is_confirmed=True
                )

                assert res['success'] is True
                assert res['sent_count'] == 1
                mock_send_batch.assert_awaited_once()


@pytest.mark.asyncio
async def test_openwa_failure_not_reported_as_success():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:', echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as db:
        await seed_all(db)

        with patch.object(settings, 'MESSAGING_PROVIDER', 'openwa'):
            now = datetime.now(timezone.utc)
            mock_failed_result = [
                MessageDeliveryResult(
                    success=False,
                    message_id='owa_err_123',
                    recipient_phone='201000000000',
                    channel='WHATSAPP_OFFICIAL',
                    delivered_at=now,
                    delivery_status='CONFIRMED_FAILED',
                    error_message='Gateway unavailable',
                )
            ]

            with patch.object(OpenWAProvider, 'send_batch', new_callable=AsyncMock) as mock_send_batch:
                mock_send_batch.return_value = mock_failed_result

                res = await tool_send_reminder(
                    db=db,
                    student_ids=['std_salma'],
                    is_confirmed=True
                )

                assert res['success'] is False
                assert res['sent_count'] == 0


@pytest.mark.asyncio
async def test_openwa_timeout_marked_uncertain_in_reminder():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:', echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as db:
        await seed_all(db)

        with patch.object(settings, 'MESSAGING_PROVIDER', 'openwa'):
            now = datetime.now(timezone.utc)
            mock_timeout_result = [
                MessageDeliveryResult(
                    success=False,
                    message_id='timeout_123',
                    recipient_phone='201000000000',
                    channel='WHATSAPP_OFFICIAL',
                    delivered_at=now,
                    delivery_status='UNKNOWN_PENDING',
                    is_uncertain=True,
                    error_message='Gateway request timed out.',
                )
            ]

            with patch.object(OpenWAProvider, 'send_batch', new_callable=AsyncMock) as mock_send_batch:
                mock_send_batch.return_value = mock_timeout_result

                res = await tool_send_reminder(
                    db=db,
                    student_ids=['std_salma'],
                    is_confirmed=True
                )

                assert res['success'] is False
                assert res['sent_count'] == 0
