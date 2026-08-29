"""
Configuration settings for StudentOps AI Backend.
"""
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # App Settings
    PROJECT_NAME: str = "StudentOps AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./studentops.db"
    
    # CORS
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]
    
    # OpenRouter LLM
    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_MODEL: str = "nvidia/nemotron-3-super-120b-a12b:free"
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    
    # Google Workspace / APIs
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_CALENDAR_ID: Optional[str] = "primary"
    
    # Messaging
    MESSAGING_PROVIDER: str = "mock"  # "mock" | "whatsapp" | "sms"
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_PHONE_NUMBER: Optional[str] = None
    
    # Policy Thresholds
    ATTENDANCE_LATE_THRESHOLD_MINUTES: int = 10
    ATTENDANCE_MIN_PRESENT_PERCENT: float = 70.0
    ATTENDANCE_MIN_LATE_PERCENT: float = 50.0
    
    # Scoring thresholds
    BEHAVIOR_MAX_SCORE: int = 23
    TASK_MAX_SCORE: int = 10
    
    # JWT Authentication
    JWT_SECRET_KEY: str = "studentops-super-secret-jwt-key-for-dev-only-change-in-prod-12345"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
