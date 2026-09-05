import os
import uuid
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
PASSWORD = os.getenv("SEED_USER_PASSWORD")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY or not PASSWORD:
    raise RuntimeError("SEED_USER_PASSWORD and Supabase service credentials are required.")

admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# List of all required users
users_list = [
    # Tech Organization
    ("ziad.member@studentops.org", "member", "Tech"),
    ("ziad.lead@studentops.org", "lead", "Tech"),
    ("ziad.hr@studentops.org", "hr_leader", "Tech"),
    ("ali.member@studentops.org", "member", "Tech"),
    ("ali.lead@studentops.org", "lead", "Tech"),
    ("ali.hr@studentops.org", "hr_leader", "Tech"),
    
    # Ops Organization
    ("salma.member@studentops.org", "member", "Ops"),
    ("salma.lead@studentops.org", "lead", "Ops"),
    ("salma.hr@studentops.org", "hr_leader", "Ops"),
    ("rana.member@studentops.org", "member", "Ops"),
    ("rana.lead@studentops.org", "lead", "Ops"),
    ("rana.hr@studentops.org", "hr_leader", "Ops"),
    
    # Media Organization
    ("mohamed.member@studentops.org", "member", "Media"),
    ("mohamed.lead@studentops.org", "lead", "Media"),
    ("mohamed.hr@studentops.org", "hr_leader", "Media"),
    ("khaled.member@studentops.org", "member", "Media"),
    ("khaled.lead@studentops.org", "lead", "Media"),
    ("khaled.hr@studentops.org", "hr_leader", "Media"),
]

print(f"\n🚀 Seeding {len(users_list)} users into the database...")

for email, role, org in users_list:
    # Generate organization ID matching the backend logic
    org_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{org.lower()}.studentops.org"))
    
    # استخراج الاسم الأول من الإيميل وتكبير أول حرف (مثال: Ziad)
    full_name = email.split('.')[0].capitalize()
    
    try:
        # 1. Create the account in Supabase Auth
        auth_res = admin_client.auth.admin.create_user({
            "email": email,
            "password": PASSWORD,
            "email_confirm": True
        })
        
        # 2. Link the account in the public users table with all required fields
        admin_client.table("users").upsert({
            "id": auth_res.user.id,
            "email": email,
            "full_name": full_name, # 👈 تمت إضافة عمود الاسم هنا
            "role": role,
            "organization_id": org_id,
            "hashed_password": "managed_by_supabase_auth"
        }).execute()
        
        print(f"✅ Added: {email.ljust(35)} | Name: {full_name.ljust(10)} | Role: {role.ljust(10)} | Org: {org}")
        
    except Exception as e:
        # Print the exact error if it fails
        print(f"⚠️ Failed for ({email}): {str(e)}")

print("\n🎉 Seeding complete!\n")