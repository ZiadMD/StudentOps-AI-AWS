"""
Async Database connection and session management.
Supports local SQLite and Supabase PostgreSQL with PgBouncer transaction pooling.
"""
from typing import AsyncGenerator
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


async def init_db():
    """Initializes the database schema."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

