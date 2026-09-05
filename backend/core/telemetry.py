import logging
import sentry_sdk
from fastapi import Request
from fastapi.responses import JSONResponse
from core.config import get_settings

settings = get_settings()

# Configure internal security logger
logging.basicConfig(level=logging.INFO)
security_logger = logging.getLogger("studentops_security")

# SECURITY: Initialize Sentry for error tracking
# send_default_pii=False prevents leaking JWTs, cookies, or IP addresses to third-party logs
if hasattr(settings, "sentry_dsn") and settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        send_default_pii=False, 
        traces_sample_rate=1.0
    )

async def global_exception_handler(request: Request, exc: Exception):
    """
    SECURITY: Global Exception Interceptor (T9).
    Prevents stack trace leaks (Information Disclosure).
    Routes full technical details to Sentry/Logs, and returns a generic JSON to the client.
    """
    request_id = getattr(request.state, "request_id", "unknown-request-id")
    
    # 1. Log the actual exception internally with full stack trace for debugging
    security_logger.error(
        f"Unhandled Exception [ReqID: {request_id}] at {request.method} {request.url.path}: {str(exc)}", 
        exc_info=True
    )
    
    # 2. Return a sanitized, generic response to the external client
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": "An internal system error occurred. Our engineering team has been notified.",
            "request_id": request_id
        }
    )

def log_security_event(event_type: str, request_id: str, details: dict):
    """
    SECURITY: Dedicated logging channel for authorization failures, 
    rate limit trips, and suspected attacks.
    """
    security_logger.warning(f"SECURITY EVENT [{event_type}] - ReqID: {request_id} - Details: {details}")