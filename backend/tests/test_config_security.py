import pytest
from pydantic import ValidationError

from core.config import Environment, Settings


def base_settings(**overrides):
    values = {
        "environment": Environment.DEVELOPMENT,
        "supabase_url": "https://project.supabase.co",
        "supabase_key": "anon-key",
        "turnstile_secret_key": "turnstile-key",
    }
    values.update(overrides)
    return values


def test_production_requires_hosts_and_origins():
    with pytest.raises(ValidationError):
        Settings(**base_settings(environment=Environment.PRODUCTION))


def test_production_rejects_placeholder_hosts():
    with pytest.raises(ValidationError):
        Settings(
            **base_settings(
                environment=Environment.PRODUCTION,
                allowed_hosts=["your-production-domain.com"],
                allowed_origins=["https://app.example.org"],
            )
        )


def test_production_accepts_explicit_network_policy():
    settings = Settings(
        **base_settings(
            environment=Environment.PRODUCTION,
            allowed_hosts=["api.example.org"],
            allowed_origins=["https://app.example.org"],
        )
    )
    assert settings.environment is Environment.PRODUCTION
