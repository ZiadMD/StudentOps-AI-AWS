import os
import uuid
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

load_dotenv()

# Requires the new pydantic-settings config file (T1)
from core.config import get_settings
from core.config import Environment
from core.rate_limit import limiter
from core.telemetry import global_exception_handler
from api import members, attendance, reminders, tasks, scores, agent, auth, submissions, events, communications, external

settings = get_settings()

# Initialize application securely
app = FastAPI(
    title="StudentOps API",
    description="Enterprise-Grade Backend Services with Zero Trust Architecture.",
    docs_url="/docs" if settings.environment is Environment.DEVELOPMENT else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.environment is Environment.DEVELOPMENT else None,
)

# Attach rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_exception_handler(Exception, global_exception_handler)

# T2: Host validation remains explicit; CORS is added below so it wraps this middleware
# and can answer valid preflight requests before they reach the application routes.
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_hosts,
)

# T2: Keep origins explicit because allow_credentials=True is incompatible with '*'.
development_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]
cors_origins = list(dict.fromkeys(
    [*settings.allowed_origins, *development_origins]
    if settings.environment is Environment.DEVELOPMENT
    else settings.allowed_origins
))

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=600,
)

# T2: Edge Security & Payload Guard Middleware
class EdgeSecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id

        # Payload Guard
        if request.method in ["POST", "PUT", "PATCH"]:
            content_length = request.headers.get("content-length")
            if content_length and int(content_length) > 2_097_152:
                raise HTTPException(status_code=413, detail="Payload Too Large")

        response = await call_next(request)
        
        # Security Headers Protocol
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        
        return response

app.add_middleware(EdgeSecurityMiddleware)

# المسارات المفعلة (التي قمنا بإنشائها)
app.include_router(auth.router)
app.include_router(communications.router)


app.include_router(members.router)
app.include_router(attendance.router)
app.include_router(reminders.router)
app.include_router(tasks.router)
app.include_router(scores.router)
app.include_router(agent.router)
app.include_router(submissions.router)
app.include_router(events.router)
app.include_router(external.router)

# Health endpoint protected by rate limits
@app.get("/", tags=["Health Check"])
@limiter.limit("10/minute")
def read_root(request: Request):
    """Health check explicitly returning the trace ID for ops monitoring."""
    return {
        "status": "online", 
        "message": "StudentOps API securely running.",
        "request_id": request.state.request_id
    }