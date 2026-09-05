from fastapi import APIRouter, Depends, HTTPException, Request
from core.security import verify_token, TokenPayload, require_role, UserRole
from core.database import get_access_token, get_tenant_client
from core.rate_limit import limiter

# Initialize the router for Attendance Tools
router = APIRouter(prefix="/api/tools/attendance", tags=["Agent Tools"])

@router.get(
    "/meeting/{meeting_id}/absent", 
    # SECURITY: Only authorized HR roles can trigger this agent tool
    dependencies=[Depends(require_role([
        UserRole.ADMIN,
        UserRole.HR,
        UserRole.HR_LEADER
    ]))]
)
@limiter.limit("30/minute")
def get_absent_members_tool(meeting_id: str, request: Request, current_user: TokenPayload = Depends(verify_token)):
    """
    AGENT TOOL: Identifies absent members for a specific meeting.
    This endpoint enforces deterministic business rules outside the LLM.
    The AI Agent calls this tool to get raw, accurate data without direct DB access.
    """
    try:
        db = get_tenant_client(get_access_token(request))
        # 1. Verify the meeting belongs to the user's organization to prevent cross-tenant data leaks
        meeting_check = db.table("meetings") \
            .select("id") \
            .eq("id", meeting_id) \
            .eq("organization_id", current_user.organization_id) \
            .execute()
            
        if not meeting_check.data:
            raise HTTPException(status_code=404, detail="Meeting not found or unauthorized.")

        # 2. Fetch attendance records securely
        # Assuming attendance_records has a status column ('present', 'absent', etc.)
        attendance_data = db.table("attendance_records") \
            .select("student_id, members(name, phone_number)") \
            .eq("meeting_id", meeting_id) \
            .eq("organization_id", current_user.organization_id) \
            .eq("status", "absent") \
            .execute()

        # 3. Return structured deterministic data to the Agent
        return {
            "status": "success",
            "meeting_id": meeting_id,
            "absent_count": len(attendance_data.data),
            "absent_members": attendance_data.data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Agent Tool Error (Attendance): {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail="Failed to execute attendance tool safely."
        )