import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from supabase import create_client

from core.database import get_tenant_client
from core.security import TokenPayload, verify_dummy_hash, verify_token
from core.rate_limit import limiter
from core.config import get_settings
from core.config import Environment
from core.telemetry import log_security_event

settings = get_settings()
router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    turnstile_token: str = ""  # القيمة الافتراضية فارغة لدعم بيئة التطوير

class RefreshRequest(BaseModel):
    refresh_token: str

@router.get("/me")
@limiter.limit("5/minute")
async def get_current_user(
    request: Request,
    current_user: TokenPayload = Depends(verify_token),
):
    """Return the validated server-side principal after a browser reload."""
    profile = (
        get_tenant_client(request.state.access_token)
        .table("profiles")
        .select("email")
        .eq("id", current_user.user_id)
        .maybe_single()
        .execute()
    )
    if not isinstance(profile.data, dict) or not profile.data.get("email"):
        raise HTTPException(status_code=401, detail="Authenticated profile is unavailable.")

    return {
        "id": current_user.user_id,
        "email": profile.data["email"],
        "role": current_user.role,
        "organization_id": current_user.organization_id,
    }

async def verify_turnstile(token: str, ip: str) -> bool:
    """
    SECURITY (T4): Server-side verification of the Turnstile token.
    Prevents brute-force and botnets before hitting the database.
    """
    # تجاوز فحص الكابتشا في بيئة التطوير المحلي إذا لم يتم إرسال توكن
    if settings.environment is Environment.DEVELOPMENT and not token:
        return True
        
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={
                "secret": settings.turnstile_secret_key, 
                "response": token, 
                "remoteip": ip
            }
        )
        result = response.json()
        return result.get("success", False)

@router.post("/login")
@limiter.limit("5/minute")
async def secure_login(request: Request, login_data: LoginRequest):
    """
    SECURITY (T4, T9): Hardened login endpoint.
    Implements Anti-Enumeration, uniform response timing, and telemetry logging.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    request_id = getattr(request.state, "request_id", "unknown-request-id")

    # 1. Human Verification (Fail Fast Principle)
    is_human = await verify_turnstile(login_data.turnstile_token, client_ip)
    if not is_human:
        log_security_event(
            "BOT_TRAFFIC_DETECTED", 
            request_id, 
            {"ip": client_ip, "email_attempted": login_data.email}
        )
        raise HTTPException(status_code=403, detail="Turnstile verification failed.")

    try:
        # 2. Authenticate against Supabase Auth securely
        # نستخدم عميل جديد هنا لأن المستخدم لا يمتلك JWT بعد لتفعيل الـ RLS
        auth_client = create_client(settings.supabase_url, settings.supabase_key)
        
        auth_response = auth_client.auth.sign_in_with_password({
            "email": login_data.email,
            "password": login_data.password
        })
        
        user = auth_response.user
        if not user:
            raise ValueError("Auth failed - no user object returned")

        session = auth_response.session
        if not session or not session.access_token:
            raise ValueError("Auth failed - no session token returned")
        # Resolve the authoritative profile through the authenticated RLS context.
        tenant_client = get_tenant_client(session.access_token)
        user_record = tenant_client.table("profiles") \
            .select("role, organization_id") \
            .eq("id", user.id) \
            .single() \
            .execute()
        
        if not user_record.data:
            raise ValueError("Incomplete user profile or missing organization_id")

        # Log successful authentication for audit trails
        log_security_event(
            "SUCCESSFUL_LOGIN", 
            request_id, 
            {"user_id": user.id, "ip": client_ip}
        )

        return {
            "status": "success",
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
            "user": {
                "id": user.id,
                "email": user.email or login_data.email,
                "role": user_record.data["role"],
                "organization_id": user_record.data["organization_id"],
            },
            "token_type": "bearer"
        }

    except Exception as e:
        # SECURITY (T4): Anti-Enumeration & Timing Attack Defense
        # تنفيذ عملية تشفير وهمية لإجبار السيرفر على استغراق نفس الوقت 
        # سواء كان الإيميل موجوداً أم لا.
        verify_dummy_hash()
        
        # SECURITY (T9): Log the actual error silently for ops and security monitoring
        log_security_event(
            "AUTH_FAILURE_OR_BRUTE_FORCE", 
            request_id, 
            {"email_attempted": login_data.email, "error": str(e), "ip": client_ip}
        )
        
        # SECURITY (T4): Always return the exact same generic error message
        raise HTTPException(
            status_code=401, 
            detail="Invalid credentials. Please verify your email and password."
        )

@router.post("/refresh")
@limiter.limit("5/minute")
async def refresh_session(request: Request, refresh_data: RefreshRequest):
    """Refresh a Supabase session without minting an application JWT."""
    try:
        if not refresh_data.refresh_token.strip():
            raise ValueError("Missing refresh token")

        auth_client = create_client(settings.supabase_url, settings.supabase_key)
        response = auth_client.auth.refresh_session(refresh_data.refresh_token)
        session = response.session
        user = response.user
        if not session or not session.access_token or not user:
            raise ValueError("Refresh did not return a session")

        tenant_client = get_tenant_client(session.access_token)
        profile = (
            tenant_client.table("profiles")
            .select("role, organization_id")
            .eq("id", user.id)
            .single()
            .execute()
        )
        if not profile.data:
            raise ValueError("Profile not found")

        return {
            "status": "success",
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email or "",
                "role": profile.data["role"],
                "organization_id": profile.data["organization_id"],
            },
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Session refresh failed.")