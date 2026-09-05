import os
from fastapi import HTTPException, Request
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    raise ValueError("CRITICAL SECURITY ERROR: Missing Supabase environment variables in backend configuration.")

def get_access_token(request: Request) -> str:
    """Extract exactly one Bearer token for the request-scoped tenant client."""
    validated_token = getattr(request.state, "access_token", None)
    if validated_token:
        return validated_token

    authorization = request.headers.get("Authorization", "")
    scheme, separator, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not separator or not token.strip() or " " in token.strip():
        raise HTTPException(
            status_code=401,
            detail="Authentication credentials were not provided or are invalid.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token.strip()

def get_tenant_client(access_token: str) -> Client:
    """
    عميل المؤسسات المعزول (Zero-Trust Multi-Tenant Context).
    يقوم بإنشاء مثيل جديد لكل طلب مستخدم وحقن رمز التوثيق (JWT Access Token) 
    في ترويسات الطلب (PostgREST Auth Headers)، مما يجبر قاعدة البيانات على تطبيق 
    سياسات الصفوف الأمنية (Row Level Security - RLS) ومنع خطأ PGRST301 نهائياً.
    """
    if not access_token:
        raise ValueError("SECURITY ERROR: Attempted to initialize tenant client without a valid Access Token.")
    
    # إنشاء عميل جديد منعاً لتداخل الجلسات بين المستخدمين (Thread-Safe / Request-Isolated)
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    
    # تمرير وفك تشفير الـ Token بداخل طبقة الـ PostgREST لضمان مطابقة الـ JWT Secret وتفعيل RLS
    client.postgrest.auth(access_token)
    
    return client