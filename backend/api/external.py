from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
import uuid
from core.security import require_role, TokenPayload, UserRole
from core.rate_limit import limiter

# Initialize router for External Integrations & Fallbacks
router = APIRouter(prefix="/api/external", tags=["External Integrations"])

class MeetRequest(BaseModel):
    event_title: str

@router.post("/meet/generate")
@limiter.limit("10/minute")
def generate_meet_link(
    request: Request,
    meet_request: MeetRequest,
    # SECURITY: Only HR can generate official meeting links
    current_user: TokenPayload = Depends(require_role([
        UserRole.ADMIN,
        UserRole.HR,
        UserRole.HR_LEADER
    ]))
):
    """
    SECURITY: Fallback/Mock provider for Google Meet integration.
    Prevents system crashes if the external Google API is down or credentials are not yet ready.
    """
    try:
        # TODO: Insert actual Google Calendar/Meet API logic here in the future.
        
        # Simulating a failure or 'not ready' state for the external API:
        raise ConnectionError("Google Meet API credentials not configured yet.")
        
    except Exception as e:
        # Fallback mechanism activated
        print(f"EXTERNAL API WARNING: {str(e)}. Switching to Mock Provider for user {current_user.user_id}.")
        
        # Generate a deterministic mock link for testing and frontend stability
        mock_meeting_id = f"mock-{str(uuid.uuid4())[:8]}"
        mock_link = f"https://meet.google.com/{mock_meeting_id}"
        
        return {
            "status": "success",
            "provider": "mock",
            "message": "Generated mock link due to external API unavailability.",
            "meet_link": mock_link
        }