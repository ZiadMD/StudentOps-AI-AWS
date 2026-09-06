"""
Async Database connection and session management.
Supports local SQLite and Supabase PostgreSQL with PgBouncer transaction pooling.
"""
from typing import AsyncGenerator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings


def get_normalized_database_url(raw_url: str) -> str:
    """
    Normalizes database connection string:
    - Converts postgres:// or postgresql:// to postgresql+asyncpg://
    """
    url = raw_url.strip()
    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


db_url = get_normalized_database_url(settings.DATABASE_URL)

# Configure driver arguments and connection pooling
engine_kwargs = {
    "echo": False,
    "future": True,
}

if "sqlite" in db_url:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    connect_args = {}
    # Supabase Transaction Pooler (PgBouncer on port 6543) requires disabling prepared statement cache
    if "pooler.supabase.com" in db_url or "6543" in db_url:
        connect_args["statement_cache_size"] = 0
        connect_args["prepared_statement_cache_size"] = 0

    engine_kwargs["connect_args"] = connect_args
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 300

# Engine configuration
engine = create_async_engine(db_url, **engine_kwargs)

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that yields an async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


POSTGRES_SAFE_MIGRATIONS = [
    "ALTER TABLE students ADD COLUMN IF NOT EXISTS assigned_hr_id VARCHAR(36) REFERENCES users(id);",
    "CREATE INDEX IF NOT EXISTS ix_students_assigned_hr_id ON students(assigned_hr_id);",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS technical_score FLOAT;",
    "ALTER TABLE submissions ADD COLUMN IF NOT EXISTS graded_by_user_id VARCHAR(36) REFERENCES users(id);",
    "CREATE INDEX IF NOT EXISTS ix_submissions_graded_by_user_id ON submissions(graded_by_user_id);",
    "ALTER TABLE score_records ADD COLUMN IF NOT EXISTS month VARCHAR(7);",
    "ALTER TABLE score_records ADD COLUMN IF NOT EXISTS graded_by_user_id VARCHAR(36) REFERENCES users(id);",
    "CREATE INDEX IF NOT EXISTS ix_score_records_month ON score_records(month);",
    "CREATE INDEX IF NOT EXISTS ix_score_records_graded_by_user_id ON score_records(graded_by_user_id);",
]


async def init_db():
    """Initializes the database schema and verifies required incremental columns."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if engine.dialect.name == "postgresql":
            for stmt in POSTGRES_SAFE_MIGRATIONS:
                await conn.execute(text(stmt))

