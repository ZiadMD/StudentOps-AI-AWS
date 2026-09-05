from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from core.security import verify_token, TokenPayload, require_role, UserRole
from core.database import get_access_token, get_tenant_client
from core.audit import log_audit_event
from core.agent_registry import ToolRegistry
from core.rate_limit import limiter

router = APIRouter(prefix="/api/agent", tags=["AI Core"])

class ToolRequest(BaseModel):
    tool_name: str
    payload: dict

@router.post("/execute")
@limiter.limit("10/minute")
def execute_agent_tool(
    request: Request,
    tool_req: ToolRequest, 
    current_user: TokenPayload = Depends(require_role([UserRole.ADMIN]))
):
    """
    SECURITY: Main boundary for the LLM to interact with backend services.
    Enforces Quotas, Input/Output Schemas, and Human-in-the-Loop constraints.
    """
    raw_token = get_access_token(request)
    db = get_tenant_client(raw_token)

    # 1. Quota Check (Rate Limiting Agent calls per user to prevent billing exhaustion)
    quota_res = (
        db.table("agent_quotas")
        .select("*")
        .eq("user_id", current_user.user_id)
        .eq("organization_id", current_user.organization_id)
        .execute()
    )
    if quota_res.data and quota_res.data[0]['requests_today'] > 50:
        log_audit_event(raw_token, current_user.user_id, current_user.organization_id, "QUOTA_EXCEEDED", request.state.request_id, tool_req.tool_name)
        raise HTTPException(status_code=429, detail="Agent quota exceeded for today.")

    try:
        tool = ToolRegistry.get_tool(tool_req.tool_name)
        
        # 2. Human-in-the-loop (HITL) Interception
        if tool.requires_human_approval:
            approval_data = {
                "organization_id": current_user.organization_id,
                "requester_id": current_user.user_id,
                "tool_name": tool.name,
                "payload": tool_req.payload
            }
            approval_result = db.table("agent_approvals").insert(approval_data).execute()
            
            log_audit_event(raw_token, current_user.user_id, current_user.organization_id, "AGENT_APPROVAL_REQUESTED", request.state.request_id, tool_req.tool_name)
            approval_id = approval_result.data[0].get("id") if approval_result.data else None
            return {"status": "pending", "message": "Action requires HR approval.", "approval_id": approval_id}

        # 3. Safe Execution & Audit
        result = ToolRegistry.validate_and_execute(tool.name, tool_req.payload, current_user.organization_id)
        
        log_audit_event(raw_token, current_user.user_id, current_user.organization_id, "AGENT_TOOL_EXECUTED", request.state.request_id, tool.name, tool_req.payload)
        
        # Update Quota
        db.rpc('increment_agent_quota', {'p_user_id': current_user.user_id}).execute()
        
        return {"status": "success", "result": result}

    except Exception as e:
        log_audit_event(raw_token, current_user.user_id, current_user.organization_id, "AGENT_TOOL_FAILED", request.state.request_id, tool_req.tool_name, {"error": str(e)})
        raise HTTPException(status_code=400, detail="Tool execution blocked.")

@router.post("/approvals/{approval_id}/approve")
@limiter.limit("10/minute")
def approve_agent_action(
    request: Request,
    approval_id: str,
    # SECURITY: Only HR can approve mutating agent actions
    current_user: TokenPayload = Depends(require_role([UserRole.ADMIN]))
):
    """
    SECURITY: HR endpoint to approve and execute pending AI actions.
    """
    raw_token = get_access_token(request)
    db = get_tenant_client(raw_token)
    
    pending = (
        db.table("agent_approvals")
        .select("*")
        .eq("id", approval_id)
        .eq("organization_id", current_user.organization_id)
        .eq("status", "pending")
        .single()
        .execute()
    )
    if not pending.data:
        raise HTTPException(status_code=404, detail="Approval not found or already processed.")
        
    try:
        # Execute the action now that a human approved it
        result = ToolRegistry.validate_and_execute(pending.data['tool_name'], pending.data['payload'], current_user.organization_id)
        
        # Mark as approved
        (
            db.table("agent_approvals")
            .update({"status": "approved"})
            .eq("id", approval_id)
            .eq("organization_id", current_user.organization_id)
            .execute()
        )
        log_audit_event(raw_token, current_user.user_id, current_user.organization_id, "AGENT_ACTION_APPROVED", request.state.request_id, approval_id)
        
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to execute approved action.")