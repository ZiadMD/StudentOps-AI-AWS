from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from core.database import get_access_token, get_tenant_client
from core.security import TokenPayload, UserRole, require_role, verify_token
from core.rate_limit import limiter

router = APIRouter(prefix="/api/communications", tags=["Communications"])


class CommunicationCreate(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", str_strip_whitespace=True)

    recipient_id: str = Field(min_length=1, max_length=128)
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=10000)
    channel: Literal["in_app", "whatsapp", "sms"] = "in_app"


@router.get("/")
@limiter.limit("30/minute")
def list_communications(
    request: Request,
    current_user: TokenPayload = Depends(verify_token),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=50),
):
    """List communications visible to the authenticated organization through RLS."""
    try:
        db = get_tenant_client(get_access_token(request))
        response = (
            db.table("communications")
            .select("id, recipient_id, subject, message, channel, status, created_at")
            .order("created_at", desc=True)
            .range((page - 1) * page_size, page * page_size - 1)
            .execute()
        )
        return {
            "status": "success",
            "organization_id": current_user.organization_id,
            "communications": response.data,
        }
    except Exception as exc:
        print(f"Communications read error: {str(exc)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve communications securely.")


@router.post("/")
@limiter.limit("10/minute")
def create_communication(
    communication: CommunicationCreate,
    request: Request,
    current_user: TokenPayload = Depends(
        require_role([UserRole.ADMIN, UserRole.HR, UserRole.HR_LEADER])
    ),
):
    """Queue a communication for a member in the caller's RLS tenant."""
    try:
        db = get_tenant_client(get_access_token(request))
        result = (
            db.table("communications")
            .insert(
                {
                    "organization_id": current_user.organization_id,
                    "sender_id": current_user.user_id,
                    "recipient_id": communication.recipient_id,
                    "subject": communication.subject,
                    "message": communication.message,
                    "channel": communication.channel,
                    "status": "queued",
                }
            )
            .execute()
        )
        communication_id = result.data[0].get("id") if result.data else None
        return {
            "status": "success",
            "message": "Communication queued securely.",
            "communication_id": communication_id,
        }
    except Exception as exc:
        print(f"Communications write error: {str(exc)}")
        raise HTTPException(status_code=500, detail="Failed to queue communication securely.")
