from functools import lru_cache
from enum import StrEnum

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"

class Settings(BaseSettings):
    environment: Environment
    supabase_url: str
    supabase_key: str
    supabase_jwks_url: str | None = None
    supabase_issuer: str | None = None
    supabase_audience: str = "authenticated"
    supabase_jwt_secret: str | None = None
    turnstile_secret_key: str
    allowed_hosts: list[str] = ["localhost", "127.0.0.1", "testserver"]
    allowed_origins: list[str] = []
    
    # Fails fast at startup if .env is missing these required fields
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @model_validator(mode="after")
    def validate_production_network_policy(self):
        placeholders = {
            "your-production-domain.com",
            "example.com",
            "localhost",
            "127.0.0.1",
            "testserver",
            "*",
        }
        if self.environment is Environment.PRODUCTION:
            if not self.allowed_hosts or not self.allowed_origins:
                raise ValueError("ALLOWED_HOSTS and ALLOWED_ORIGINS are required in production.")
            if any(
                host.strip().lower() in placeholders
                or "your-production-domain" in host.strip().lower()
                or "localhost" in host.strip().lower()
                or "127.0.0.1" in host.strip().lower()
                or "testserver" in host.strip().lower()
                for host in self.allowed_hosts
            ):
                raise ValueError("ALLOWED_HOSTS contains a development or placeholder host.")
            if any(
                origin.strip().lower() in placeholders
                or "your-production-domain" in origin.strip().lower()
                or "localhost" in origin.strip().lower()
                or "127.0.0.1" in origin.strip().lower()
                or "testserver" in origin.strip().lower()
                for origin in self.allowed_origins
            ):
                raise ValueError("ALLOWED_ORIGINS contains a development or placeholder origin.")
        return self

@lru_cache
def get_settings():
    return Settings()