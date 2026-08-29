"""
Main FastAPI Application Entry Point for StudentOps AI.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db, AsyncSessionLocal
from app.seed.seed_data import seed_all
from app.api.routes_auth import router as auth_router
from app.api.routes_agent import router as agent_router
from app.api.routes_students import router as students_router
from app.api.routes_attendance import router as attendance_router
from app.api.routes_calendar import router as calendar_router
from app.api.routes_tasks import router as tasks_router
from app.api.routes_dashboard import router as dashboard_router
from app.api.routes_audit import router as audit_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database schema and seed data
    await init_db()
    async with AsyncSessionLocal() as session:
        await seed_all(session)
    yield
    # Shutdown


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="StudentOps AI - AI-powered HR & Student Operations Platform",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for development & local testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(dashboard_router, prefix=settings.API_V1_STR)
app.include_router(agent_router, prefix=settings.API_V1_STR)
app.include_router(students_router, prefix=settings.API_V1_STR)
app.include_router(attendance_router, prefix=settings.API_V1_STR)
app.include_router(calendar_router, prefix=settings.API_V1_STR)
app.include_router(tasks_router, prefix=settings.API_V1_STR)
app.include_router(audit_router, prefix=settings.API_V1_STR)


@app.get("/")
async def root():
    return {
        "status": "healthy",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs"
    }
