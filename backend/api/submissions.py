from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
from core.security import verify_token, TokenPayload, require_role, UserRole
from core.database import get_access_token, get_tenant_client
from core.rate_limit import limiter

# Initialize router for the Submissions service
router = APIRouter(prefix="/api/submissions", tags=["Submissions"])

# Data validation model for submitting a task
class SubmissionCreate(BaseModel):
    task_id: str
    content: str
    attachment_url: Optional[str] = None

@router.post("/")
@limiter.limit("10/minute")
def create_submission(
    submission: SubmissionCreate, 
    request: Request,
    current_user: TokenPayload = Depends(verify_token)
):
    """
    SECURITY: Allows authenticated users to submit a task.
    Automatically binds the submission to their user ID and organization.
    """
    try:
        db = get_tenant_client(get_access_token(request))
        # 1. Verify that the task actually exists and belongs to the user's organization
        task_check = db.table("tasks") \
            .select("id") \
            .eq("id", submission.task_id) \
            .eq("organization_id", current_user.organization_id) \
            .execute()
            
        if not task_check.data:
            raise HTTPException(status_code=404, detail="Task not found or unauthorized.")

        # 2. Insert the submission securely
        submission_data = {
            "task_id": submission.task_id,
            "member_id": current_user.user_id,
            "organization_id": current_user.organization_id,
            "content": submission.content,
            "attachment_url": submission.attachment_url,
            "status": "pending_review"
        }
        
        result = db.table("submissions").insert(submission_data).execute()

        return {
            "status": "success",
            "message": "Task submitted successfully.",
            "submission_id": result.data[0]['id']
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"SECURITY ALERT: Submission insertion failed for user {current_user.user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to process submission.")

@router.get("/task/{task_id}")
@limiter.limit("30/minute")
def get_task_submissions(
    task_id: str, 
    request: Request,
    # SECURITY: Only HR roles can review all submissions for a specific task
    current_user: TokenPayload = Depends(require_role([
        UserRole.ADMIN,
        UserRole.HR,
        UserRole.HR_LEADER
    ])),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=50),
):
    """
    SECURITY: Retrieves all submissions for a specific task. 
    Protected by strict RBAC (HR only) and Tenant Isolation.
    """
    try:
        db = get_tenant_client(get_access_token(request))
        # Fetch submissions restricted to the HR's organization
        response = db.table("submissions") \
            .select("id, member_id, content, attachment_url, status, submitted_at") \
            .eq("task_id", task_id) \
            .eq("organization_id", current_user.organization_id) \
            .range((page - 1) * page_size, page * page_size - 1) \
            .execute()

        return {
            "status": "success",
            "task_id": task_id,
            "submission_count": len(response.data),
            "submissions": response.data
        }

    except Exception as e:
        print(f"Fetch Submissions Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch task submissions.")