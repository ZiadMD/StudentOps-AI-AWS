"""
Database Seeding Module based on 8.xlsx Ground Truth and Operational Data.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import AsyncSessionLocal, init_db
from app.models.entities import (
    Student, Meeting, ParticipantSession, AttendanceRecord,
    Event, Task, Submission, ScoreRecord, AgentActionAudit,
    Team, User, MemberFollowupStatus, TaskReminder,
    MeetingAssignment, TaskAssignment, AutomationSettings,
    MemberFeedback, MemberQuestion, CommitteeReport
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
    # Check if students are already seeded in the database
    existing_students = False
    if not force:
        res = await db.execute(select(Student.id).limit(1))
        existing_students = res.scalar() is not None

    now = datetime.now(timezone.utc)

    # 0. Teams (Primary: Social Media Committee)
    teams_data = [
        {
            "id": "team_media",
            "name": "Social Media Committee",
            "code": "MEDIA",
            "description": "Social media campaigns, content creation, community engagement, and analytics."
        },
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
        }
    ]
    for t_data in teams_data:
        t_res = await db.execute(select(Team).where(Team.id == t_data["id"]))
        existing_t = t_res.scalar_one_or_none()
        if not existing_t:
            db.add(Team(**t_data))
        else:
            existing_t.name = t_data["name"]
            existing_t.code = t_data["code"]
            existing_t.description = t_data["description"]

    # 1. User Accounts (5 Authoritative Operational Account Types)
    users_data = [
        # Role 1: HR Region / HR Head (Oversight & Reports)
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
            "id": "usr_ziad_region",
            "email": "ziad.region@studentops.org",
            "hashed_password": get_password_hash("head123"),
            "full_name": "Ziad Mohamed (Regional Head)",
            "arabic_name": "زياد محمد",
            "role": "region_hr_head",
            "team_id": None,
            "student_id": None,
            "is_active": True
        },
        # Role 2: HR Leader (Social Media Committee)
        {
            "id": "usr_hr_leader",
            "email": "hr.leader@studentops.org",
            "hashed_password": get_password_hash("leader123"),
            "full_name": "Social Media HR Leader",
            "arabic_name": "قائد الموارد البشرية للجنة",
            "role": "committee_hr_leader",
            "team_id": "team_media",
            "student_id": None,
            "is_active": True
        },
        # Role 3: Social Media Committee Head (Sets tasks, meetings, scores submissions)
        {
            "id": "usr_media_head",
            "email": "media.head@studentops.org",
            "hashed_password": get_password_hash("lead123"),
            "full_name": "Social Media Committee Head",
            "arabic_name": "رئيس لجنة السوشيال ميديا",
            "role": "committee_head",
            "team_id": "team_media",
            "student_id": None,
            "is_active": True
        },
        {
            "id": "usr_lead_tech",
            "email": "lead@studentops.org",
            "hashed_password": get_password_hash("lead123"),
            "full_name": "Ali Hassan (Tech Lead)",
            "arabic_name": "علي حسن",
            "role": "team_lead",
            "team_id": "team_tech",
            "student_id": "std_ali",
            "is_active": True
        },
        # Role 4: Social Media HR Member (Attendance, Reminders, Behavior Scores, Flags)
        {
            "id": "usr_hr_member",
            "email": "hr.member@studentops.org",
            "hashed_password": get_password_hash("hrmember123"),
            "full_name": "Social Media HR Member",
            "arabic_name": "عضو الموارد البشرية باللجنة",
            "role": "committee_hr_member",
            "team_id": "team_media",
            "student_id": None,
            "is_active": True
        },
        # Role 5: Social Media Committee Member (Attends meetings, submits tasks, asks questions)
        {
            "id": "usr_member",
            "email": "member@studentops.org",
            "hashed_password": get_password_hash("member123"),
            "full_name": "Social Media Committee Member",
            "arabic_name": "عضو لجنة السوشيال ميديا",
            "role": "committee_member",
            "team_id": "team_media",
            "student_id": "std_mohamed",
            "is_active": True
        },
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
        }
    ]

    core_pwd = get_password_hash("member123")
    existing_emails = {u["email"] for u in users_data}
    existing_ids = {u["id"] for u in users_data}

    for i, p in enumerate(CORE_TEAM, 1):
        name_lower = p["name"].lower()
        candidate_users = [
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
                "full_name": f"{p['name']} (Committee Head)",
                "arabic_name": f"{p['arabic']} (رئيس اللجنة)",
                "role": "committee_head",
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
        ]
        for cu in candidate_users:
            if cu["email"] not in existing_emails and cu["id"] not in existing_ids:
                users_data.append(cu)
                existing_emails.add(cu["email"])
                existing_ids.add(cu["id"])

    if include_synthetic:
        for i, (first, last, ar_name, team_id) in enumerate(SYNTHETIC_PEOPLE, 1):
            email = f"{first.lower()}.{last.lower()}{i}@studentops.org"
            uid = f"usr_syn_{i:03d}"
            if email not in existing_emails and uid not in existing_ids:
                users_data.append({
                    "id": uid,
                    "email": email,
                    "hashed_password": core_pwd,
                    "full_name": f"{first} {last}",
                    "arabic_name": ar_name,
                    "role": "committee_member",
                    "team_id": team_id,
                    "student_id": f"std_syn_{i:03d}",
                    "is_active": True
                })
                existing_emails.add(email)
                existing_ids.add(uid)

    for u_data in users_data:
        u_res = await db.execute(
            select(User).where(
                (User.id == u_data["id"]) |
                (func.lower(User.email) == u_data["email"].lower())
            )
        )
        existing_u = u_res.scalar_one_or_none()
        if not existing_u:
            db.add(User(**u_data))
        else:
            existing_u.hashed_password = u_data["hashed_password"]
            existing_u.role = u_data["role"]
            existing_u.team_id = u_data["team_id"]
            existing_u.full_name = u_data["full_name"]
            existing_u.arabic_name = u_data["arabic_name"]
            if u_data.get("student_id") is not None:
                existing_u.student_id = u_data["student_id"]
            existing_u.is_active = True

    # If students and operational data are already populated and force is not set,
    # safely commit updated users/teams and return idempotently.
    if existing_students and not force:
        await db.commit()
        print("Database verified: all 5 Social Media demo accounts and teams synchronized successfully!")
        return

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
            "team_id": "team_media",
            "assigned_hr_id": "usr_hr_member"
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
            "team_id": "team_media",
            "assigned_hr_id": "usr_hr_member"
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


    # 2. Historical Meetings from 8.xlsx + Today's Live Meeting (Social Media Committee)
    meetings_data = [
        {
            "id": "meet_31_07",
            "meeting_code": "meet_31_07",
            "title": "Session 1: Campaign Kickoff & Strategy",
            "topic": "Social media strategy, committee goals, and brand guidelines",
            "start_time": datetime(2026, 7, 31, 18, 0, tzinfo=timezone.utc),
            "end_time": datetime(2026, 7, 31, 19, 0, tzinfo=timezone.utc),
            "duration_minutes": 60,
            "meet_url": "https://meet.google.com/ops-31jul",
            "status": "COMPLETED",
            "session_number": 1,
            "team_id": "team_media",
            "responsible_user_id": "usr_media_head"
        },
        {
            "id": "meet_07_08",
            "meeting_code": "meet_07_08",
            "title": "Session 2: Visual Identity & Design Sprint",
            "topic": "Canva/Figma templates, color palettes, and copywriting guidelines",
            "start_time": datetime(2026, 8, 7, 18, 0, tzinfo=timezone.utc),
            "end_time": datetime(2026, 8, 7, 19, 0, tzinfo=timezone.utc),
            "duration_minutes": 60,
            "meet_url": "https://meet.google.com/ops-07aug",
            "status": "COMPLETED",
            "session_number": 2,
            "team_id": "team_media",
            "responsible_user_id": "usr_media_head"
        },
        {
            "id": "meet_14_08",
            "meeting_code": "meet_14_08",
            "title": "Session 3: Content Scheduling & Reels Production",
            "topic": "Short-form video ideation, TikTok/Instagram reel calendar",
            "start_time": datetime(2026, 8, 14, 18, 0, tzinfo=timezone.utc),
            "end_time": datetime(2026, 8, 14, 19, 0, tzinfo=timezone.utc),
            "duration_minutes": 60,
            "meet_url": "https://meet.google.com/ops-14aug",
            "status": "COMPLETED",
            "session_number": 3,
            "team_id": "team_media",
            "responsible_user_id": "usr_media_head"
        },
        {
            "id": "meet_20_08",
            "meeting_code": "camp_day_1",
            "title": "Session 4: Camp Day 1 Live Coverage",
            "topic": "All-hands on-ground social media coverage & story reporting",
            "start_time": datetime(2026, 8, 20, 10, 0, tzinfo=timezone.utc),
            "end_time": datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc),
            "duration_minutes": 120,
            "meet_url": "https://meet.google.com/ops-camp-d1",
            "status": "COMPLETED",
            "session_number": 4,
            "team_id": "team_media",
            "responsible_user_id": "usr_media_head"
        },
        {
            "id": "meet_21_08",
            "meeting_code": "meet_21_08",
            "title": "Session 5: Analytics & Community Engagement Sync",
            "topic": "Review post reach, impression statistics, and audience feedback",
            "start_time": datetime(2026, 8, 21, 18, 0, tzinfo=timezone.utc),
            "end_time": datetime(2026, 8, 21, 19, 0, tzinfo=timezone.utc),
            "duration_minutes": 60,
            "meet_url": "https://meet.google.com/ops-21aug",
            "status": "COMPLETED",
            "session_number": 5,
            "team_id": "team_media",
            "responsible_user_id": "usr_media_head"
        },
        {
            "id": "today_sync",
            "meeting_code": "today_sync",
            "title": "Session 6: Weekly Media Committee Sync",
            "topic": "Weekly review, upcoming campaign sprint, and Q&A",
            "start_time": now.replace(hour=18, minute=0, second=0, microsecond=0),
            "end_time": now.replace(hour=19, minute=0, second=0, microsecond=0),
            "duration_minutes": 60,
            "meet_url": "https://meet.google.com/ops-sync-demo",
            "status": "COMPLETED",
            "session_number": 6,
            "team_id": "team_media",
            "responsible_user_id": "usr_media_head"
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

        # Mohamed (Media Member)
        {"id": "sub_m1", "task_id": "tsk_1", "student_id": "std_mohamed", "status": "ON_TIME", "score": 8.0, "technical_score": 8.0, "file_url": "https://drive.google.com/mohamed_t1"},
        {"id": "sub_m2", "task_id": "tsk_2", "student_id": "std_mohamed", "status": "ON_TIME", "score": 9.0, "technical_score": 9.0, "file_url": "https://drive.google.com/mohamed_t2"},
        {"id": "sub_m3", "task_id": "tsk_3", "student_id": "std_mohamed", "status": "ON_TIME", "score": 8.5, "technical_score": 8.5, "file_url": "https://drive.google.com/mohamed_t3"},
        {"id": "sub_m4", "task_id": "tsk_4", "student_id": "std_mohamed", "status": "PENDING", "score": None, "technical_score": None, "file_url": ""},
        {"id": "sub_m5", "task_id": "tsk_5", "student_id": "std_mohamed", "status": "PENDING", "score": None, "technical_score": None, "file_url": ""},

        # Khaled (Media Member)
        {"id": "sub_k1", "task_id": "tsk_1", "student_id": "std_khaled", "status": "ON_TIME", "score": 9.0, "technical_score": 9.0, "file_url": "https://drive.google.com/khaled_t1"},
        {"id": "sub_k2", "task_id": "tsk_2", "student_id": "std_khaled", "status": "ON_TIME", "score": 8.5, "technical_score": 8.5, "file_url": "https://drive.google.com/khaled_t2"},
        {"id": "sub_k3", "task_id": "tsk_3", "student_id": "std_khaled", "status": "ON_TIME", "score": 9.5, "technical_score": 9.5, "file_url": "https://drive.google.com/khaled_t3"},
        {"id": "sub_k4", "task_id": "tsk_4", "student_id": "std_khaled", "status": "PENDING", "score": None, "technical_score": None, "file_url": ""},
        {"id": "sub_k5", "task_id": "tsk_5", "student_id": "std_khaled", "status": "PENDING", "score": None, "technical_score": None, "file_url": ""},
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
        {"id": "sc_z_bonus", "student_id": "std_ziad", "category": "BONUS", "points": 2.0, "max_points": 5.0, "notes": "Bonus awarded by HR Leader for exceptional campaign initiative"},

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

    # 8. Automated Task Reminders Seed
    reminders_data = [
        {
            "id": "rem_001",
            "task_id": "tsk_4",
            "student_id": "std_ziad",
            "channel": "WHATSAPP_OFFICIAL",
            "stage": 1,
            "status": "SENT",
            "message_text": "Reminder: Task 4 submission deadline is approaching. Please submit your work on time.",
            "sent_at": now - timedelta(days=2),
        },
        {
            "id": "rem_002",
            "task_id": "tsk_4",
            "student_id": "std_salma",
            "channel": "WHATSAPP_OFFICIAL",
            "stage": 1,
            "status": "SENT",
            "message_text": "Reminder: Task 4 submission deadline is approaching. Please submit your work on time.",
            "sent_at": now - timedelta(days=2),
        },
    ]
    for rem_item in reminders_data:
        db.add(TaskReminder(**rem_item))

    # 9. Social Media Committee Explicit Assignments (Meetings & Tasks)
    member_student_ids = ["std_ziad", "std_ali", "std_salma", "std_rana", "std_mohamed", "std_khaled"]
    
    # Meeting Assignments for each meeting
    for m_item in meetings_data:
        for sid in member_student_ids:
            db.add(MeetingAssignment(
                id=f"ma_{m_item['id']}_{sid}",
                meeting_id=m_item["id"],
                student_id=sid,
                assigned_at=now - timedelta(days=20)
            ))

    # Task Assignments for each task
    for t_item in tasks_data:
        for sid in member_student_ids:
            db.add(TaskAssignment(
                id=f"ta_{t_item['id']}_{sid}",
                task_id=t_item["id"],
                student_id=sid,
                assigned_at=now - timedelta(days=20)
            ))

    # 10. Sample Member Feedback (Flows to HR Leader)
    sample_feedbacks = [
        {
            "id": "fb_001",
            "student_id": "std_ziad",
            "category": "MEETING",
            "content": "The social media campaign workshop was very informative. Would love more practical case studies on audience analytics!",
            "status": "REVIEWED",
            "notes": "Acknowledged by HR Leader. Passed to Committee Head for next sprint.",
            "reviewed_by_user_id": "usr_hr_leader",
            "reviewed_at": now - timedelta(days=1)
        },
        {
            "id": "fb_002",
            "student_id": "std_salma",
            "category": "TASK",
            "content": "Deadline for the visual assets design was a bit tight with midterm exams.",
            "status": "SUBMITTED",
            "notes": "",
            "reviewed_by_user_id": None,
            "reviewed_at": None
        }
    ]
    for fb_item in sample_feedbacks:
        db.add(MemberFeedback(**fb_item))

    # 11. Sample Member Questions (Answered by Committee Head)
    sample_questions = [
        {
            "id": "q_001",
            "student_id": "std_ziad",
            "team_id": "team_media",
            "title": "Which color palette should we prioritize for the Instagram campaign?",
            "content": "Should we strictly use the IEEE brand guide navy/blue, or can we use modern gradients for the student spotlight posts?",
            "status": "ANSWERED",
            "answered_by_user_id": "usr_lead_tech",
            "answer": "Use primary navy for official announcements, and vibrant gradient accents for student spotlight posts.",
            "asked_at": now - timedelta(days=3),
            "answered_at": now - timedelta(days=2)
        },
        {
            "id": "q_002",
            "student_id": "std_mohamed",
            "team_id": "team_media",
            "title": "Where can we find high-res raw photo assets from Camp Day 1?",
            "content": "Looking for raw photos to prepare the recap carousel.",
            "status": "OPEN",
            "answered_by_user_id": None,
            "answer": "",
            "asked_at": now - timedelta(hours=5),
            "answered_at": None
        }
    ]
    for q_item in sample_questions:
        db.add(MemberQuestion(**q_item))

    # 12. Sample Committee Performance Report (HR Leader -> HR Head)
    sample_report = CommitteeReport(
        id="rep_001",
        team_id="team_media",
        submitted_by_user_id="usr_hr_leader",
        report_title="Social Media Committee Sprint 4 Performance & Health Report",
        metrics_summary='{"total_members": 6, "total_sessions": 6, "attendance_rate_percent": 91.7, "task_submission_rate_percent": 88.9, "open_followup_flags": 1, "feedback_submissions_count": 2, "total_bonuses_awarded": 4.0}',
        notes="Strong performance across the social media committee. Task delivery punctuality has improved following HR follow-ups.",
        submitted_at=now - timedelta(days=1)
    )
    db.add(sample_report)


    # 9. Sync Organization Members (if members table exists in Supabase PostgreSQL)
    try:
        from sqlalchemy import text
        check_table = await db.execute(text("SELECT to_regclass('public.members');"))
        if check_table.scalar():
            org_res = await db.execute(text("SELECT id FROM organizations LIMIT 1;"))
            org_id = org_res.scalar()
            if not org_id:
                org_id = "a6bbd5c1-354a-4b4a-8459-0911e1bc086f"
                await db.execute(text(
                    f"INSERT INTO organizations (id, name) VALUES ('{org_id}', 'EYE / IEEE Student Activity') ON CONFLICT DO NOTHING;"
                ))

            await db.execute(text(f"""
                INSERT INTO members (id, organization_id, name, email, role, phone_number, created_at)
                SELECT 
                    gen_random_uuid(),
                    '{org_id}'::uuid,
                    s.full_name,
                    s.email,
                    s.role,
                    s.phone,
                    s.created_at
                FROM students s
                ON CONFLICT (email) DO UPDATE SET
                    name = EXCLUDED.name,
                    role = EXCLUDED.role,
                    phone_number = EXCLUDED.phone_number;
            """))
            await db.execute(text(f"""
                INSERT INTO members (id, organization_id, name, email, role, phone_number, created_at)
                SELECT 
                    gen_random_uuid(),
                    '{org_id}'::uuid,
                    u.full_name,
                    u.email,
                    u.role,
                    NULL,
                    u.created_at
                FROM users u
                ON CONFLICT (email) DO UPDATE SET
                    name = EXCLUDED.name,
                    role = EXCLUDED.role;
            """))
    except Exception:
        pass

    await db.commit()
    print("Database seeded successfully with core team ground truth and members!")


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
