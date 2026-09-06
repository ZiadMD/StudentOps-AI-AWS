"""
Database Seeding Module based on 8.xlsx Ground Truth and Operational Data.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import AsyncSessionLocal, init_db
from app.models.entities import (
    Student, Meeting, ParticipantSession, AttendanceRecord,
    Event, Task, Submission, ScoreRecord, AgentActionAudit,
    Team, User, MemberFollowupStatus, TaskReminder
)
from app.core.security import get_password_hash


CORE_TEAM = [
    {"name": "Ziad", "arabic": "زياد محمد", "team_id": "team_tech"},
    {"name": "Ali", "arabic": "علي حسن", "team_id": "team_tech"},
    {"name": "Salma", "arabic": "سلمى أحمد", "team_id": "team_ops"},
    {"name": "Rana", "arabic": "رنا محمود", "team_id": "team_ops"},
    {"name": "Mohamed", "arabic": "محمد إبراهيم", "team_id": "team_media"},
    {"name": "Khaled", "arabic": "خالد يوسف", "team_id": "team_media"},
]

SYNTHETIC_PEOPLE = [
    ("Karim", "Tarek", "كريم طارق", "team_tech"),
    ("Layla", "Nabil", "ليلى نبيل", "team_tech"),
    ("Omar", "Farouk", "عمر فاروق", "team_tech"),
    ("Nour", "El-Din", "نور الدين سامي", "team_tech"),
    ("Yasmine", "Adel", "ياسمين عادل", "team_tech"),
    ("Hany", "Samir", "هاني سمير", "team_tech"),
    ("Dina", "Gamal", "دينا جمال", "team_tech"),
    ("Sherif", "Mostafa", "شريف مصطفى", "team_tech"),
    ("Reem", "Hesham", "ريم هشام", "team_tech"),
    ("Tarek", "Hamdi", "طارق حمدي", "team_tech"),
    ("Menna", "Essam", "منة عصام", "team_tech"),
    ("Mostafa", "Kamel", "مصطفى كامل", "team_tech"),
    ("Aya", "Ashraf", "آية أشرف", "team_tech"),
    ("Hazem", "Badr", "حازم بدر", "team_tech"),
    ("Farida", "Yasser", "فريدة ياسر", "team_ops"),
    ("Seif", "Eldin", "سيف الدين عمرو", "team_ops"),
    ("Malak", "Wael", "ملك وائل", "team_ops"),
    ("Mahmoud", "Reda", "محمود رضا", "team_ops"),
    ("Nada", "Hatem", "ندى حاتم", "team_ops"),
    ("Youssef", "Emad", "يوسف عماد", "team_ops"),
    ("Habiba", "Sameh", "حبيبة سامح", "team_ops"),
    ("Marwan", "Fathy", "مروان فتحي", "team_ops"),
    ("Basma", "Ezzat", "بسمة عزت", "team_ops"),
    ("Amr", "Magdy", "عمرو مجدي", "team_ops"),
    ("Lojain", "Khaled", "لوجين خالد", "team_ops"),
    ("Ziad", "Fayed", "زياد فايد", "team_ops"),
    ("Farah", "Saber", "فرح صابر", "team_ops"),
    ("Ahmed", "Qassem", "أحمد قاسم", "team_media"),
    ("Shahd", "Anwar", "شهد أنور", "team_media"),
    ("Hesham", "Raafat", "هشام رأفت", "team_media"),
    ("Mariam", "Shaker", "مريم شاكر", "team_media"),
    ("Ramy", "Nader", "رامي نادر", "team_media"),
    ("Salma", "Badawy", "سلمى بدوي", "team_media"),
    ("Tamer", "Hosny", "تامر حسني", "team_media"),
    ("Noha", "Fawzy", "نهى فوزي", "team_media"),
    ("Karim", "Mounir", "كريم منير", "team_media"),
    ("Yasmin", "Sabry", "ياسمين صبري", "team_media"),
    ("Ehab", "Galal", "إيهاب جلال", "team_media"),
    ("Radwa", "Sherif", "رضوى شريف", "team_media"),
    ("Waleed", "Mansour", "وليد منصور", "team_media"),
]


async def seed_all(db: AsyncSession, include_synthetic: bool = False, force: bool = False):
    """Populates database with complete realistic operational data seeded from 8.xlsx, plus optional synthetic cohorts."""
    # Check if data already exists
    if not force:
        existing = await db.execute(select(Student))
        if existing.scalars().first():
            return

    now = datetime.now(timezone.utc)

    # 0. Teams
    teams_data = [
        {
            "id": "team_tech",
            "name": "Technical & Engineering",
            "code": "TECH",
            "description": "Software engineering, AI systems, and infrastructure operations."
        },
        {
            "id": "team_ops",
            "name": "Operations & Logistics",
            "code": "OPS",
            "description": "Google Meet scheduling, event coordination, and logistics."
        },
        {
            "id": "team_media",
            "name": "Media & Public Relations",
            "code": "MEDIA",
            "description": "Social media, community engagement, and design."
        }
    ]
    for t_data in teams_data:
        db.add(Team(**t_data))

    # 1. User Accounts (Pre-hashed passwords for dev)
    # 1. User Accounts (Pre-hashed passwords for dev)
    users_data = [
        {
            "id": "usr_admin",
            "email": "admin@studentops.org",
            "hashed_password": get_password_hash("admin123"),
            "full_name": "HR Administrator",
            "arabic_name": "مسؤول الموارد البشرية",
            "role": "hr_admin",
            "team_id": None,
            "student_id": None,
            "is_active": True
        },
        {
            "id": "usr_lead_tech",
            "email": "lead@studentops.org",
            "hashed_password": get_password_hash("lead123"),
            "full_name": "Ali Hassan (Team Lead)",
            "arabic_name": "علي حسن",
            "role": "team_lead",
            "team_id": "team_tech",
            "student_id": "std_ali",
            "is_active": True
        },
        {
            "id": "usr_region_head",
            "email": "region.head@studentops.org",
            "hashed_password": get_password_hash("head123"),
            "full_name": "Regional HR Head",
            "arabic_name": "رئيس الموارد البشرية للإقليم",
            "role": "region_hr_head",
            "team_id": None,
            "student_id": None,
            "is_active": True
        },
        {
            "id": "usr_hr_leader",
            "email": "hr.leader@studentops.org",
            "hashed_password": get_password_hash("leader123"),
            "full_name": "HR Committee Leader",
            "arabic_name": "قائد الموارد البشرية للجنة",
            "role": "committee_hr_leader",
            "team_id": "team_tech",
            "student_id": None,
            "is_active": True
        },
        {
            "id": "usr_hr_member",
            "email": "hr.member@studentops.org",
            "hashed_password": get_password_hash("hrmember123"),
            "full_name": "Committee HR Member",
            "arabic_name": "عضو الموارد البشرية باللجنة",
            "role": "committee_hr_member",
            "team_id": "team_tech",
            "student_id": None,
            "is_active": True
        }
    ]

    core_pwd = get_password_hash("SuperSecret#1234#")
    for i, p in enumerate(CORE_TEAM, 1):
        name_lower = p["name"].lower()
        users_data.extend([
            {
                "id": f"usr_{name_lower}_member",
                "email": f"{name_lower}.member@studentops.org",
                "hashed_password": core_pwd,
                "full_name": f"{p['name']} (Member)",
                "arabic_name": p["arabic"],
                "role": "member",
                "team_id": p["team_id"],
                "student_id": f"std_{name_lower}",
                "is_active": True
            },
            {
                "id": f"usr_{name_lower}_lead",
                "email": f"{name_lower}.lead@studentops.org",
                "hashed_password": core_pwd,
                "full_name": f"{p['name']} (Team Lead)",
                "arabic_name": f"{p['arabic']} (قائد الفريق)",
                "role": "team_lead",
                "team_id": p["team_id"],
                "student_id": None,
                "is_active": True
            },
            {
                "id": f"usr_{name_lower}_hr",
                "email": f"{name_lower}.hr@studentops.org",
                "hashed_password": core_pwd,
                "full_name": f"{p['name']} (HR Leader)",
                "arabic_name": f"{p['arabic']} (مسؤول الموارد البشرية)",
                "role": "committee_hr_leader",
                "team_id": p["team_id"],
                "student_id": None,
                "is_active": True
            },
            {
                "id": f"usr_{name_lower}_region",
                "email": f"{name_lower}.region@studentops.org",
                "hashed_password": core_pwd,
                "full_name": f"{p['name']} (Regional HR Head)",
                "arabic_name": f"{p['arabic']} (رئيس الموارد البشرية بالإقليم)",
                "role": "region_hr_head",
                "team_id": None,
                "student_id": None,
                "is_active": True
            },
            {
                "id": f"usr_{name_lower}_hrmember",
                "email": f"{name_lower}.hrmember@studentops.org",
                "hashed_password": core_pwd,
                "full_name": f"{p['name']} (HR Member)",
                "arabic_name": f"{p['arabic']} (عضو الموارد البشرية)",
                "role": "committee_hr_member",
                "team_id": p["team_id"],
                "student_id": None,
                "is_active": True
            }
        ])

    if include_synthetic:
        for i, (first, last, ar_name, team_id) in enumerate(SYNTHETIC_PEOPLE, 1):
            users_data.append({
                "id": f"usr_syn_{i:03d}",
                "email": f"{first.lower()}.{last.lower()}{i}@studentops.org",
                "hashed_password": core_pwd,
                "full_name": f"{first} {last}",
                "arabic_name": ar_name,
                "role": "member",
                "team_id": team_id,
                "student_id": f"std_syn_{i:03d}",
                "is_active": True
            })

    for u_data in users_data:
        db.add(User(**u_data))

    # 2. Students from Core Team + Synthetic Cohorts
    students_data = [
        {
            "id": "std_ziad",
            "student_code": "CORE-2026-001",
            "full_name": "Ziad Mohamed",
            "arabic_name": "زياد محمد",
            "email": "ziad.member@studentops.org",
            "phone": "+201012345678",
            "university": "Faculty of Engineering",
            "role": "Vice Head",
            "status": "ACTIVE",
            "team_id": "team_tech",
            "assigned_hr_id": "usr_hr_member"
        },
        {
            "id": "std_ali",
            "student_code": "CORE-2026-002",
            "full_name": "Ali Hassan",
            "arabic_name": "علي حسن",
            "email": "ali.member@studentops.org",
            "phone": "+201098765432",
            "university": "Faculty of Engineering",
            "role": "Technical Lead",
            "status": "ACTIVE",
            "team_id": "team_tech",
            "assigned_hr_id": "usr_hr_member"
        },
        {
            "id": "std_salma",
            "student_code": "CORE-2026-003",
            "full_name": "Salma Ahmed",
            "arabic_name": "سلمى أحمد",
            "email": "salma.member@studentops.org",
            "phone": "+201055551234",
            "university": "Faculty of Engineering",
            "role": "Operations Lead",
            "status": "ACTIVE",
            "team_id": "team_ops"
        },
        {
            "id": "std_rana",
            "student_code": "CORE-2026-004",
            "full_name": "Rana Mahmoud",
            "arabic_name": "رنا محمود",
            "email": "rana.member@studentops.org",
            "phone": "+201033334444",
            "university": "Faculty of Engineering",
            "role": "Operations Member",
            "status": "ACTIVE",
            "team_id": "team_ops"
        },
        {
            "id": "std_mohamed",
            "student_code": "CORE-2026-005",
            "full_name": "Mohamed Ibrahim",
            "arabic_name": "محمد إبراهيم",
            "email": "mohamed.member@studentops.org",
            "phone": "+201077778888",
            "university": "Faculty of Computer & AI",
            "role": "Media Lead",
            "status": "ACTIVE",
            "team_id": "team_media"
        },
        {
            "id": "std_khaled",
            "student_code": "CORE-2026-006",
            "full_name": "Khaled Youssef",
            "arabic_name": "خالد يوسف",
            "email": "khaled.member@studentops.org",
            "phone": "+201088889999",
            "university": "Faculty of Engineering",
            "role": "Media Member",
            "status": "ACTIVE",
            "team_id": "team_media"
        }
    ]

    if include_synthetic:
        for i, (first, last, ar_name, team_id) in enumerate(SYNTHETIC_PEOPLE, 1):
            students_data.append({
                "id": f"std_syn_{i:03d}",
                "student_code": f"ST-2026-{100+i:03d}",
                "full_name": f"{first} {last}",
                "arabic_name": ar_name,
                "email": f"{first.lower()}.{last.lower()}{i}@studentops.org",
                "phone": f"+201055{i:06d}",
                "university": "Faculty of Engineering",
                "role": "Member",
                "status": "ACTIVE",
                "team_id": team_id
            })

    for s_data in students_data:
        db.add(Student(**s_data))


    # 2. Historical Meetings from 8.xlsx + Today's Live Meeting
    meetings_data = [
        {
            "id": "meet_31_07",
            "meeting_code": "meet_31_07",
            "title": "Meeting 31/07 - Kickoff & Setup",
            "topic": "Initial team formation and expectations",
            "start_time": datetime(2026, 7, 31, 18, 0, tzinfo=timezone.utc),
            "end_time": datetime(2026, 7, 31, 19, 0, tzinfo=timezone.utc),
            "duration_minutes": 60,
            "meet_url": "https://meet.google.com/ops-31jul",
            "status": "COMPLETED"
        },
        {
            "id": "meet_07_08",
            "meeting_code": "meet_07_08",
            "title": "Meeting 07/08 - Phase 1 Follow-up",
            "topic": "Sprint 1 deliverables and task distribution",
            "start_time": datetime(2026, 8, 7, 18, 0, tzinfo=timezone.utc),
            "end_time": datetime(2026, 8, 7, 19, 0, tzinfo=timezone.utc),
            "duration_minutes": 60,
            "meet_url": "https://meet.google.com/ops-07aug",
            "status": "COMPLETED"
        },
        {
            "id": "meet_14_08",
            "meeting_code": "meet_14_08",
            "title": "Meeting 14/08 - Mid-Sprint Checkpoint",
            "topic": "Mid-term review and workshop preparation",
            "start_time": datetime(2026, 8, 14, 18, 0, tzinfo=timezone.utc),
            "end_time": datetime(2026, 8, 14, 19, 0, tzinfo=timezone.utc),
            "duration_minutes": 60,
            "meet_url": "https://meet.google.com/ops-14aug",
            "status": "COMPLETED"
        },
        {
            "id": "meet_20_08",
            "meeting_code": "camp_day_1",
            "title": "Camp Day 1 - Camp Orientation",
            "topic": "All-hands physical and virtual camp launch",
            "start_time": datetime(2026, 8, 20, 10, 0, tzinfo=timezone.utc),
            "end_time": datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc),
            "duration_minutes": 120,
            "meet_url": "https://meet.google.com/ops-camp-d1",
            "status": "COMPLETED"
        },
        {
            "id": "meet_21_08",
            "meeting_code": "meet_21_08",
            "title": "Meeting 21/08 - Sprint 4 Sync",
            "topic": "Task 4 review and blockers",
            "start_time": datetime(2026, 8, 21, 18, 0, tzinfo=timezone.utc),
            "end_time": datetime(2026, 8, 21, 19, 0, tzinfo=timezone.utc),
            "duration_minutes": 60,
            "meet_url": "https://meet.google.com/ops-21aug",
            "status": "COMPLETED"
        },
        {
            "id": "today_sync",
            "meeting_code": "today_sync",
            "title": "Weekly Operations & Camp Sync",
            "topic": "Weekly all-hands sync and upcoming workshop review",
            "start_time": now.replace(hour=18, minute=0, second=0, microsecond=0),
            "end_time": now.replace(hour=19, minute=0, second=0, microsecond=0),
            "duration_minutes": 60,
            "meet_url": "https://meet.google.com/ops-sync-demo",
            "status": "COMPLETED"
        }
    ]

    for m_data in meetings_data:
        db.add(Meeting(**m_data))

    # 3. Attendance Records (from 8.xlsx exact matrix)
    att_history = [
        # Meeting 31/07
        ("meet_31_07", "std_ziad", "PRESENT", 58.0),
        ("meet_31_07", "std_ali", "PRESENT", 56.0),
        ("meet_31_07", "std_salma", "UNEXCUSED_ABSENT", 0.0),
        ("meet_31_07", "std_rana", "PRESENT", 55.0),
        ("meet_31_07", "std_mohamed", "PRESENT", 57.0),
        ("meet_31_07", "std_khaled", "PRESENT", 58.0),

        # Meeting 07/08
        ("meet_07_08", "std_ziad", "PRESENT", 59.0),
        ("meet_07_08", "std_ali", "PRESENT", 58.0),
        ("meet_07_08", "std_salma", "EXCUSED_MODERATE", 0.0),
        ("meet_07_08", "std_rana", "PRESENT", 56.0),
        ("meet_07_08", "std_mohamed", "LATE", 35.0),
        ("meet_07_08", "std_khaled", "PRESENT", 57.0),

        # Meeting 14/08
        ("meet_14_08", "std_ziad", "PRESENT", 60.0),
        ("meet_14_08", "std_ali", "PRESENT", 57.0),
        ("meet_14_08", "std_salma", "PRESENT", 55.0),
        ("meet_14_08", "std_rana", "PRESENT", 58.0),
        ("meet_14_08", "std_mohamed", "PRESENT", 59.0),
        ("meet_14_08", "std_khaled", "PRESENT", 60.0),

        # Meeting 20/08 (Camp Day 1)
        ("meet_20_08", "std_ziad", "PRESENT", 119.0),
        ("meet_20_08", "std_ali", "PRESENT", 117.0),
        ("meet_20_08", "std_salma", "PRESENT", 116.0),
        ("meet_20_08", "std_rana", "PRESENT", 118.0),
        ("meet_20_08", "std_mohamed", "PRESENT", 115.0),
        ("meet_20_08", "std_khaled", "PRESENT", 119.0),

        # Meeting 21/08
        ("meet_21_08", "std_ziad", "PRESENT", 57.0),
        ("meet_21_08", "std_ali", "PRESENT", 58.0),
        ("meet_21_08", "std_salma", "UNEXCUSED_ABSENT", 0.0),
        ("meet_21_08", "std_rana", "LATE", 40.0),
        ("meet_21_08", "std_mohamed", "PRESENT", 55.0),
        ("meet_21_08", "std_khaled", "PRESENT", 58.0),

        # Today's Sync
        ("today_sync", "std_ziad", "PRESENT", 57.0),
        ("today_sync", "std_ali", "PRESENT", 55.0),
        ("today_sync", "std_salma", "UNEXCUSED_ABSENT", 0.0),
        ("today_sync", "std_rana", "PRESENT", 56.0),
        ("today_sync", "std_mohamed", "PRESENT", 58.0),
        ("today_sync", "std_khaled", "PRESENT", 57.0),
    ]

    for m_id, s_id, status, dur in att_history:
        db.add(AttendanceRecord(
            id=f"att_{m_id}_{s_id}",
            meeting_id=m_id,
            student_id=s_id,
            status=status,
            match_confidence=1.0,
            first_join=now if dur > 0 else None,
            last_leave=now + timedelta(minutes=dur) if dur > 0 else None,
            total_duration_minutes=dur,
            policy_version="v1.0"
        ))

    # 4. Tasks from 8.xlsx
    tasks_data = [
        {"id": "tsk_1", "task_number": 1, "title": "Task 1 (31/07) - Research & Planning", "description": "Conduct domain research and submit proposal.", "deadline": datetime(2026, 7, 31, 23, 59, tzinfo=timezone.utc), "max_score": 10.0},
        {"id": "tsk_2", "task_number": 2, "title": "Task 2 (07/08) - System Architecture", "description": "Draft component diagram and data model.", "deadline": datetime(2026, 8, 7, 23, 59, tzinfo=timezone.utc), "max_score": 10.0},
        {"id": "tsk_3", "task_number": 3, "title": "Task 3 (14/08) - Core Implementation", "description": "Implement initial services and unit tests.", "deadline": datetime(2026, 8, 14, 23, 59, tzinfo=timezone.utc), "max_score": 10.0},
        {"id": "tsk_4", "task_number": 4, "title": "Task 4 (21/08) - Cloud Integration", "description": "Connect cloud providers and authorization flows.", "deadline": datetime(2026, 8, 21, 23, 59, tzinfo=timezone.utc), "max_score": 10.0},
        {"id": "tsk_5", "task_number": 5, "title": "Task 5 (28/08) - Final Demo & Delivery", "description": "Final polish, evaluation harness, and report.", "deadline": now + timedelta(days=3), "max_score": 10.0}
    ]

    for t_data in tasks_data:
        db.add(Task(**t_data))

    # 5. Task Submissions & Scores
    # Ziad: T1=7, T2=10, T3=10, T4=pending, T5=pending
    # Ali: T1=9, T2=8, T3=10, T4=pending, T5=pending
    # Salma: T1=0, T2=0, T3=0, T4=pending, T5=pending
    submissions_data = [
        # Ziad
        {"id": "sub_z1", "task_id": "tsk_1", "student_id": "std_ziad", "status": "ON_TIME", "score": 7.0, "file_url": "https://drive.google.com/ziad_t1"},
        {"id": "sub_z2", "task_id": "tsk_2", "student_id": "std_ziad", "status": "ON_TIME", "score": 10.0, "file_url": "https://drive.google.com/ziad_t2"},
        {"id": "sub_z3", "task_id": "tsk_3", "student_id": "std_ziad", "status": "ON_TIME", "score": 10.0, "file_url": "https://drive.google.com/ziad_t3"},
        {"id": "sub_z4", "task_id": "tsk_4", "student_id": "std_ziad", "status": "PENDING", "score": None, "file_url": ""},
        {"id": "sub_z5", "task_id": "tsk_5", "student_id": "std_ziad", "status": "PENDING", "score": None, "file_url": ""},

        # Ali
        {"id": "sub_a1", "task_id": "tsk_1", "student_id": "std_ali", "status": "ON_TIME", "score": 9.0, "file_url": "https://drive.google.com/ali_t1"},
        {"id": "sub_a2", "task_id": "tsk_2", "student_id": "std_ali", "status": "ON_TIME", "score": 8.0, "file_url": "https://drive.google.com/ali_t2"},
        {"id": "sub_a3", "task_id": "tsk_3", "student_id": "std_ali", "status": "ON_TIME", "score": 10.0, "file_url": "https://drive.google.com/ali_t3"},
        {"id": "sub_a4", "task_id": "tsk_4", "student_id": "std_ali", "status": "PENDING", "score": None, "file_url": ""},
        {"id": "sub_a5", "task_id": "tsk_5", "student_id": "std_ali", "status": "PENDING", "score": None, "file_url": ""},

        # Salma
        {"id": "sub_s1", "task_id": "tsk_1", "student_id": "std_salma", "status": "MISSED", "score": 0.0, "file_url": ""},
        {"id": "sub_s2", "task_id": "tsk_2", "student_id": "std_salma", "status": "MISSED", "score": 0.0, "file_url": ""},
        {"id": "sub_s3", "task_id": "tsk_3", "student_id": "std_salma", "status": "MISSED", "score": 0.0, "file_url": ""},
        {"id": "sub_s4", "task_id": "tsk_4", "student_id": "std_salma", "status": "PENDING", "score": None, "file_url": ""},
        {"id": "sub_s5", "task_id": "tsk_5", "student_id": "std_salma", "status": "PENDING", "score": None, "file_url": ""},
    ]

    for sub_data in submissions_data:
        db.add(Submission(**sub_data))

    # 6. Behavior & Discipline Scores (Total 23 pts)
    # Ziad: Group 5/5, Social 5/5, Hierarchy 5/5, Conduct 8/8 -> Total 23/23
    # Ali: Group 5/5, Social 5/5, Hierarchy 5/5, Conduct 8/8 -> Total 23/23
    # Salma: Group 5/5, Social 5/5, Hierarchy 3/5, Conduct 5/8 -> Total 18/23
    scores_data = [
        # Ziad
        {"id": "sc_z1", "student_id": "std_ziad", "category": "GROUP_INTERACTION", "points": 5.0, "max_points": 5.0, "notes": "Active in discussions"},
        {"id": "sc_z2", "student_id": "std_ziad", "category": "SOCIAL_MEDIA", "points": 5.0, "max_points": 5.0, "notes": "Great engagement"},
        {"id": "sc_z3", "student_id": "std_ziad", "category": "HIERARCHY_RULES", "points": 5.0, "max_points": 5.0, "notes": "Full compliance"},
        {"id": "sc_z4", "student_id": "std_ziad", "category": "POLITE_CONDUCT", "points": 8.0, "max_points": 8.0, "notes": "Highly professional"},

        # Ali
        {"id": "sc_a1", "student_id": "std_ali", "category": "GROUP_INTERACTION", "points": 5.0, "max_points": 5.0, "notes": "Active mentor"},
        {"id": "sc_a2", "student_id": "std_ali", "category": "SOCIAL_MEDIA", "points": 5.0, "max_points": 5.0, "notes": "Shared key announcements"},
        {"id": "sc_a3", "student_id": "std_ali", "category": "HIERARCHY_RULES", "points": 5.0, "max_points": 5.0, "notes": "Lead coordination"},
        {"id": "sc_a4", "student_id": "std_ali", "category": "POLITE_CONDUCT", "points": 8.0, "max_points": 8.0, "notes": "Exemplary attitude"},

        # Salma
        {"id": "sc_s1", "student_id": "std_salma", "category": "GROUP_INTERACTION", "points": 5.0, "max_points": 5.0, "notes": "Responsive in chat"},
        {"id": "sc_s2", "student_id": "std_salma", "category": "SOCIAL_MEDIA", "points": 5.0, "max_points": 5.0, "notes": "Good engagement"},
        {"id": "sc_s3", "student_id": "std_salma", "category": "HIERARCHY_RULES", "points": 3.0, "max_points": 5.0, "notes": "Minor deadline communication delay"},
        {"id": "sc_s4", "student_id": "std_salma", "category": "POLITE_CONDUCT", "points": 5.0, "max_points": 8.0, "notes": "Needs more proactive updates"},
    ]

    for sc_data in scores_data:
        db.add(ScoreRecord(**sc_data))

    # 7. Upcoming Calendar Events
    events_data = [
        {
            "id": "ev_today_sync",
            "title": "Weekly Operations & Camp Sync",
            "description": "Review week 3 attendance and upcoming Camp milestones.",
            "event_type": "MEETING",
            "start_time": now.replace(hour=18, minute=0, second=0, microsecond=0),
            "end_time": now.replace(hour=19, minute=0, second=0, microsecond=0),
            "location": "Google Meet",
            "meet_url": "https://meet.google.com/ops-sync-demo",
            "is_mandatory": True
        },
        {
            "id": "ev_camp_followup",
            "title": "Camp Logistics & Sub-team Follow-up",
            "description": "Final review before project submission.",
            "event_type": "MEETING",
            "start_time": (now + timedelta(days=2)).replace(hour=17, minute=30, second=0, microsecond=0),
            "end_time": (now + timedelta(days=2)).replace(hour=19, minute=0, second=0, microsecond=0),
            "location": "Google Meet",
            "meet_url": "https://meet.google.com/logistics-followup",
            "is_mandatory": True
        },
        {
            "id": "ev_task5_deadline",
            "title": "Task 5 Final Submission Deadline",
            "description": "Submit final MVP demo video and documentation.",
            "event_type": "DEADLINE",
            "start_time": (now + timedelta(days=3)).replace(hour=23, minute=59, second=0, microsecond=0),
            "end_time": (now + timedelta(days=3)).replace(hour=23, minute=59, second=0, microsecond=0),
            "location": "Platform Portal",
            "meet_url": "",
            "is_mandatory": True
        }
    ]

    for ev_data in events_data:
        db.add(Event(**ev_data))

    # 7. Followup & SLA Escalation Seed
    followups_data = [
        {
            "id": "fol_001",
            "student_id": "std_ziad",
            "hr_member_id": "usr_hr_member",
            "flagged_reason": "OVERDUE_TASK",
            "flagged_at": now - timedelta(days=4),
            "last_contacted_at": None,
            "status": "PENDING",
            "is_escalated": True,
            "notes": "Task 4 final submission overdue by 4 days"
        },
        {
            "id": "fol_002",
            "student_id": "std_salma",
            "hr_member_id": "usr_admin",
            "flagged_reason": "ABSENTEEISM",
            "flagged_at": now - timedelta(days=1),
            "last_contacted_at": None,
            "status": "PENDING",
            "is_escalated": False,
            "notes": "Missed yesterday's logistics sync"
        }
    ]
    for fol_item in followups_data:
        db.add(MemberFollowupStatus(**fol_item))

    await db.commit()
    print("Database seeded successfully with core team ground truth!")


if __name__ == "__main__":
    import sys

    async def main():
        force = "--force" in sys.argv or "--reset" in sys.argv
        if force:
            from app.core.database import engine, Base
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
        await init_db()
        async with AsyncSessionLocal() as session:
            await seed_all(session, include_synthetic=True, force=force)

    asyncio.run(main())
