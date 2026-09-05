from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from typing import List, Optional
from core.security import verify_token, TokenPayload, UserRole, require_role
from core.database import get_access_token, get_tenant_client
from core.rate_limit import limiter

router = APIRouter(
    prefix="/api/members",
    tags=["Members"],
    dependencies=[Depends(require_role([UserRole.ADMIN]))],
)

class MemberResponse(BaseModel):
    id: str
    name: str
    role: str
    email: Optional[str] = None
    phone_number: Optional[str] = None
    created_at: str

class MembersResponse(BaseModel):
    status: str
    organization_id: str
    data: List[MemberResponse]


PRIVILEGED_ROLES = {
    UserRole.ADMIN,
}

def mask_email(email: Optional[str], role: str) -> Optional[str]:
    if role not in PRIVILEGED_ROLES and email and "@" in email:
        name, domain = email.rsplit("@", 1)
        masked_name = name[:1] + "*" * max(len(name) - 1, 0)
        return f"{masked_name}@{domain}"
    return email

def mask_phone(phone: Optional[str], role: str) -> Optional[str]:
    if role not in PRIVILEGED_ROLES and phone:
        if len(phone) > 4:
            return "*" * (len(phone) - 4) + phone[-4:]
        return "****"
    return phone

@router.get("/", response_model=MembersResponse)
@limiter.limit("30/minute")
def get_organization_members(
    request: Request, 
    current_user: TokenPayload = Depends(verify_token),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=50),
):
    """
    جلب قائمة أعضاء المؤسسة مع تطبيق سياسة Least Privilege وإخفاء الحساسات (Masking).
    """
    try:
        db = get_tenant_client(get_access_token(request))
        
        if not current_user.organization_id:
            raise HTTPException(status_code=400, detail="User is not associated with any organization.")

        # استعلام آمن ومعزول بالمؤسسة
        response = db.table("members") \
            .select("id, name, email, role, phone_number, created_at") \
            .eq("organization_id", current_user.organization_id) \
            .range((page - 1) * page_size, page * page_size - 1) \
            .execute()
            
        # تطبيق قواعد الـ Masking حسب دور المستخدم الحالي
        sanitized_data = []
        for member in response.data:
            sanitized_data.append({
                "id": member.get("id"),
                "name": member.get("name"),
                "role": member.get("role"),
                "email": mask_email(member.get("email"), current_user.role),
                "phone_number": mask_phone(member.get("phone_number"), current_user.role),
                "created_at": member.get("created_at")
            })
            
        return {
            "status": "success", 
            "organization_id": current_user.organization_id,
            "data": sanitized_data
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Database error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve members securely.")