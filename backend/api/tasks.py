from fastapi import APIRouter, Depends, Query, Request
from core.security import verify_token, TokenPayload
from core.database import get_access_token, get_tenant_client
from core.rate_limit import limiter

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])

@router.get("/")
@limiter.limit("30/minute")
def get_organization_tasks(
    request: Request,
    current_user: TokenPayload = Depends(verify_token),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=50),
):
    """
    SECURITY: Defense-in-depth plus an explicit server-derived tenant filter and RLS.
    """
    # Get RLS-enforced database client
    db = get_tenant_client(get_access_token(request))
    
    # Postgres strictly limits this response based on the RLS policies
    response = (
        db.table("tasks")
        .select("*")
        .eq("organization_id", current_user.organization_id)
        .range((page - 1) * page_size, page * page_size - 1)
        .execute()
    )
    
    return {"status": "success", "tasks": response.data}