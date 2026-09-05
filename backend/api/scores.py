from fastapi import APIRouter, Depends, HTTPException, Request
from core.security import verify_token, TokenPayload, require_role, UserRole
from core.database import get_access_token, get_tenant_client
from core.rate_limit import limiter

# Initialize router for Score Tools
router = APIRouter(prefix="/api/tools/scores", tags=["Agent Tools"])

@router.get(
    "/member/{member_id}",
    # SECURITY: Enforce HR-only access
    dependencies=[Depends(require_role([
        UserRole.ADMIN,
        UserRole.HR,
        UserRole.HR_LEADER
    ]))]
)
@limiter.limit("30/minute")
def get_member_scores(member_id: str, request: Request, current_user: TokenPayload = Depends(verify_token)):
    """
    AGENT TOOL: Retrieves performance score history for a specific member.
    Strictly isolated to the current user's organization to prevent data leaks.
    """
    try:
        db = get_tenant_client(get_access_token(request))
        # Secure query applying Multi-tenant logic
        response = db.table("score_records") \
            .select("id, score, reason, recorded_at") \
            .eq("member_id", member_id) \
            .eq("organization_id", current_user.organization_id) \
            .execute()

        # Calculate total score dynamically
        total_score = sum(record['score'] for record in response.data) if response.data else 0

        return {
            "status": "success",
            "member_id": member_id,
            "total_score": total_score,
            "record_count": len(response.data),
            "history": response.data
        }

    except Exception as e:
        print(f"Agent Tool Error (Scores): {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail="Failed to fetch score records securely."
        )