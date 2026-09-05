import os
import httpx
import pytest

# تأكد من تمرير هذه المتغيرات في البيئة قبل تشغيل pytest
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")
TENANT_A_TOKEN = os.environ.get("TENANT_A_TOKEN") 
TENANT_B_ORG_ID = os.environ.get("TENANT_B_ORG_ID")

TABLES = [
    "members", "tasks", "events", "communications", 
    "submissions", "score_records", "attendance_records", 
    "meetings", "reminder_logs", "agent_action_audits", 
    "agent_quotas", "agent_approvals", "profiles"
]

@pytest.fixture
def postgrest_client():
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {TENANT_A_TOKEN}",
        "Content-Type": "application/json"
    }
    with httpx.Client(base_url=f"{SUPABASE_URL}/rest/v1", headers=headers) as client:
        yield client

def test_postgrest_anon_completely_blocked():
    """يثبت أن الوصول بدون توكن مرفوض تماماً على الجداول"""
    headers = {"apikey": SUPABASE_ANON_KEY}
    response = httpx.get(f"{SUPABASE_URL}/rest/v1/members", headers=headers)
    assert response.status_code in [401, 403, 404], "VULNERABILITY: Anon access is not blocked!"

@pytest.mark.parametrize("table", TABLES)
def test_cross_tenant_read_isolation(postgrest_client, table):
    """
    يثبت أن مستأجر (A) لا يمكنه قراءة أي سجل لمستأجر (B) عبر استعلام PostgREST مباشر.
    RLS سيقوم بفلترة السجلات بصمت وتجاهل eq.organization_id المرسلة من العميل.
    """
    response = postgrest_client.get(f"/{table}?organization_id=eq.{TENANT_B_ORG_ID}")
    
    # 200 OK كبروتوكول HTTP، ولكن مصفوفة البيانات يجب أن تكون فارغة
    assert response.status_code == 200, f"Failed to reach {table}"
    data = response.json()
    
    if isinstance(data, list):
        assert len(data) == 0, f"CRITICAL VULNERABILITY: Cross-tenant data leak in {table}"
