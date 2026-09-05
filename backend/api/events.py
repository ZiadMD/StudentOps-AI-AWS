from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from core.security import verify_token, TokenPayload, require_role, UserRole
from core.database import get_access_token, get_tenant_client
from core.rate_limit import limiter

# Initialize router for the Events & Meetings service
router = APIRouter(prefix="/api/events", tags=["Events & Meetings"])

# Data validation model for creating an event
class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    is_online: bool = False
    meet_link: Optional[str] = None # Placeholder for Google Meet API integration

@router.post("/")
@limiter.limit("10/minute")
def create_event(
    event: EventCreate,
    request: Request,
    # SECURITY: Only authorized HR personnel can schedule events/meetings
    current_user: TokenPayload = Depends(require_role([
        UserRole.ADMIN,
        UserRole.HR,
        UserRole.HR_LEADER
    ]))
):
    """
    SECURITY: Creates a new event or meeting.
    Enforces tenant isolation by securely attaching the HR's organization_id.
    """
    try:
        db = get_tenant_client(get_access_token(request))
        event_data = {
            "title": event.title,
            "description": event.description,
            "start_time": event.start_time.isoformat(),
            "is_online": event.is_online,
            "meet_link": event.meet_link,
            "created_by": current_user.user_id,
            "organization_id": current_user.organization_id
        }
        
        result = db.table("events").insert(event_data).execute()
        
        return {
            "status": "success",
            "message": "Event created successfully.",
            "event_id": result.data[0]['id']
        }
    except Exception as e:
        print(f"SECURITY ALERT: Event Creation Error for user {current_user.user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create event.")

@router.get("/")
@limiter.limit("30/minute")
def list_organization_events(
    request: Request,
    current_user: TokenPayload = Depends(verify_token),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=50),
):
    """
    SECURITY: Allows authenticated members to view upcoming events.
    Strictly isolated to their specific organization to prevent data leaks.
    """
    try:
        db = get_tenant_client(get_access_token(request))
        # Fetch events strictly for the user's organization that are happening in the future
        response = db.table("events") \
            .select("id, title, description, start_time") \
            .eq("organization_id", current_user.organization_id) \
            .gte("start_time", datetime.utcnow().isoformat()) \
            .order("start_time") \
            .range((page - 1) * page_size, page * page_size - 1) \
            .execute()
            
        return {
            "status": "success",
            "count": len(response.data),
            "events": response.data
        }
    except Exception as e:
        print(f"Fetch Events Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve events.")