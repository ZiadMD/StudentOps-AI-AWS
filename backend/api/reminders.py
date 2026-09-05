from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from core.security import verify_token, TokenPayload, require_role, UserRole
from core.database import get_access_token, get_tenant_client
from core.rate_limit import limiter

# Initialize router for Reminders Tool
router = APIRouter(prefix="/api/tools/reminders", tags=["Agent Tools"])

# Pydantic model to strictly validate the data sent by the AI Agent
class ReminderRequest(BaseModel):
    task_id: str
    member_id: str
    message: str

@router.post(
    "/send",
    # SECURITY: Only authorized roles can trigger this agent tool
    dependencies=[Depends(require_role([
        UserRole.ADMIN,
        UserRole.HR,
        UserRole.HR_LEADER
    ]))]
)
@limiter.limit("10/minute")
def send_reminder_and_log(request: Request, reminder: ReminderRequest, current_user: TokenPayload = Depends(verify_token)):
    """
    AGENT TOOL: Triggers a task reminder and immutably logs the action.
    Prevents the LLM from executing raw queries or bypassing HR authorization.
    """
    try:
        db = get_tenant_client(get_access_token(request))
        # 1. Multi-tenant Check: Verify the task belongs to the user's organization
        task_check = db.table("tasks") \
            .select("id") \
            .eq("id", reminder.task_id) \
            .eq("organization_id", current_user.organization_id) \
            .execute()
            
        if not task_check.data:
            raise HTTPException(status_code=404, detail="Task not found or unauthorized access.")

        # 2. Insert into reminder_logs
        log_data = {
            "task_id": reminder.task_id,
            "member_id": reminder.member_id,
            "message": reminder.message,
            "status": "pending_delivery", # Can be updated later by a webhook
            "organization_id": current_user.organization_id
        }
        db.table("reminder_logs").insert(log_data).execute()

        # 3. Immutable Audit Logging for AI actions
        audit_data = {
            "agent_id": current_user.user_id,
            "action_type": "SEND_REMINDER",
            "target_table": "reminder_logs",
            "organization_id": current_user.organization_id,
            "details": f"AI Tool sent reminder to member {reminder.member_id} for task {reminder.task_id}"
        }
        db.table("agent_action_audits").insert(audit_data).execute()

        return {
            "status": "success", 
            "message": "Reminder queued and action audited securely."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Audit/Reminder Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to execute reminder tool safely.")