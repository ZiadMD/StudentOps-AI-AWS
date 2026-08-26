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
    Event, Task, Submission, ScoreRecord, AgentActionAudit
)


async def seed_all(db: AsyncSession):
    """Populates database with complete realistic operational data seeded from 8.xlsx."""
    # Check if data already exists
    existing = await db.execute(select(Student))
    if existing.scalars().first():
        return

    now = datetime.now(timezone.utc)

    # 1. Students from 8.xlsx + cohort members
    students_data = [
        {
            "id": "std_maurine",
            "student_code": "ST-2026-001",
            "full_name": "Maurine Magdy Adly",
            "arabic_name": "مورين مجدي عدلي",
            "email": "maurine.magdy@studentops.org",
            "phone": "+201012345678",
            "university": "Faculty of Engineering",
            "role": "Vice Head",
            "status": "ACTIVE"
        },
        {
            "id": "std_alaa",
            "student_code": "ST-2026-002",
            "full_name": "Alaa Mohamed Hassan",
            "arabic_name": "الاء محمد حسن",
            "email": "alaa.mohamed@studentops.org",
            "phone": "+201098765432",
            "university": "Faculty of Engineering",
            "role": "Technical Lead",
            "status": "ACTIVE"
        },
        {
            "id": "std_hanan",
            "student_code": "ST-2026-003",
            "full_name": "Hanan Ahmed Ramadan",
            "arabic_name": "حنان احمد رمضان",
            "email": "hanan.ahmed@studentops.org",
            "phone": "+201055551234",
            "university": "Faculty of Engineering",
            "role": "Member",
            "status": "ACTIVE"
        },
        {
            "id": "std_ahmed",
            "student_code": "ST-2026-004",
            "full_name": "Ahmed Youssef Ibrahim",
            "arabic_name": "أحمد يوسف إبراهيم",
            "email": "ahmed.youssef@studentops.org",
            "phone": "+201033334444",
            "university": "Faculty of Engineering",
            "role": "Member",
            "status": "ACTIVE"
        },
        {
            "id": "std_sara",
            "student_code": "ST-2026-005",
            "full_name": "Sara Omar Mostafa",
            "arabic_name": "سارة عمر مصطفى",
            "email": "sara.omar@studentops.org",
            "phone": "+201077778888",
            "university": "Faculty of Computer & AI",
            "role": "Member",
            "status": "ACTIVE"
        }
    ]

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
        ("meet_31_07", "std_maurine", "PRESENT", 58.0),
        ("meet_31_07", "std_alaa", "PRESENT", 56.0),
        ("meet_31_07", "std_hanan", "UNEXCUSED_ABSENT", 0.0),
        ("meet_31_07", "std_ahmed", "PRESENT", 55.0),
        ("meet_31_07", "std_sara", "PRESENT", 57.0),

        # Meeting 07/08
        ("meet_07_08", "std_maurine", "PRESENT", 59.0),
        ("meet_07_08", "std_alaa", "PRESENT", 58.0),
        ("meet_07_08", "std_hanan", "EXCUSED_MODERATE", 0.0),
        ("meet_07_08", "std_ahmed", "PRESENT", 56.0),
        ("meet_07_08", "std_sara", "LATE", 35.0),

        # Meeting 14/08
        ("meet_14_08", "std_maurine", "PRESENT", 60.0),
        ("meet_14_08", "std_alaa", "PRESENT", 57.0),
        ("meet_14_08", "std_hanan", "PRESENT", 55.0),
        ("meet_14_08", "std_ahmed", "PRESENT", 58.0),
        ("meet_14_08", "std_sara", "PRESENT", 59.0),

        # Meeting 20/08 (Camp Day 1)
        ("meet_20_08", "std_maurine", "PRESENT", 119.0),
        ("meet_20_08", "std_alaa", "PRESENT", 117.0),
        ("meet_20_08", "std_hanan", "PRESENT", 116.0),
        ("meet_20_08", "std_ahmed", "PRESENT", 118.0),
        ("meet_20_08", "std_sara", "PRESENT", 115.0),

        # Meeting 21/08
        ("meet_21_08", "std_maurine", "PRESENT", 57.0),
        ("meet_21_08", "std_alaa", "PRESENT", 58.0),
        ("meet_21_08", "std_hanan", "UNEXCUSED_ABSENT", 0.0),
        ("meet_21_08", "std_ahmed", "LATE", 40.0),
        ("meet_21_08", "std_sara", "PRESENT", 55.0),

        # Today's Sync
        ("today_sync", "std_maurine", "PRESENT", 57.0),
        ("today_sync", "std_alaa", "PRESENT", 55.0),
        ("today_sync", "std_hanan", "UNEXCUSED_ABSENT", 0.0),
        ("today_sync", "std_ahmed", "PRESENT", 56.0),
        ("today_sync", "std_sara", "PRESENT", 58.0),
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

    # 5. Task Submissions & Scores from 8.xlsx
    # Maurine: T1=7, T2=10, T3=10, T4=pending, T5=pending
    # Alaa: T1=9, T2=8, T3=10, T4=pending, T5=pending
    # Hanan: T1=0, T2=0, T3=0, T4=pending, T5=pending
    submissions_data = [
        # Maurine
        {"id": "sub_m1", "task_id": "tsk_1", "student_id": "std_maurine", "status": "ON_TIME", "score": 7.0, "file_url": "https://drive.google.com/maurine_t1"},
        {"id": "sub_m2", "task_id": "tsk_2", "student_id": "std_maurine", "status": "ON_TIME", "score": 10.0, "file_url": "https://drive.google.com/maurine_t2"},
        {"id": "sub_m3", "task_id": "tsk_3", "student_id": "std_maurine", "status": "ON_TIME", "score": 10.0, "file_url": "https://drive.google.com/maurine_t3"},
        {"id": "sub_m4", "task_id": "tsk_4", "student_id": "std_maurine", "status": "PENDING", "score": None, "file_url": ""},
        {"id": "sub_m5", "task_id": "tsk_5", "student_id": "std_maurine", "status": "PENDING", "score": None, "file_url": ""},

        # Alaa
        {"id": "sub_a1", "task_id": "tsk_1", "student_id": "std_alaa", "status": "ON_TIME", "score": 9.0, "file_url": "https://drive.google.com/alaa_t1"},
        {"id": "sub_a2", "task_id": "tsk_2", "student_id": "std_alaa", "status": "ON_TIME", "score": 8.0, "file_url": "https://drive.google.com/alaa_t2"},
        {"id": "sub_a3", "task_id": "tsk_3", "student_id": "std_alaa", "status": "ON_TIME", "score": 10.0, "file_url": "https://drive.google.com/alaa_t3"},
        {"id": "sub_a4", "task_id": "tsk_4", "student_id": "std_alaa", "status": "PENDING", "score": None, "file_url": ""},
        {"id": "sub_a5", "task_id": "tsk_5", "student_id": "std_alaa", "status": "PENDING", "score": None, "file_url": ""},

        # Hanan
        {"id": "sub_h1", "task_id": "tsk_1", "student_id": "std_hanan", "status": "MISSED", "score": 0.0, "file_url": ""},
        {"id": "sub_h2", "task_id": "tsk_2", "student_id": "std_hanan", "status": "MISSED", "score": 0.0, "file_url": ""},
        {"id": "sub_h3", "task_id": "tsk_3", "student_id": "std_hanan", "status": "MISSED", "score": 0.0, "file_url": ""},
        {"id": "sub_h4", "task_id": "tsk_4", "student_id": "std_hanan", "status": "PENDING", "score": None, "file_url": ""},
        {"id": "sub_h5", "task_id": "tsk_5", "student_id": "std_hanan", "status": "PENDING", "score": None, "file_url": ""},
    ]

    for sub_data in submissions_data:
        db.add(Submission(**sub_data))

    # 6. Behavior & Discipline Scores from 8.xlsx (Total 23 pts)
    # Maurine: Group 5/5, Social 5/5, Hierarchy 5/5, Conduct 8/8 -> Total 23/23
    # Alaa: Group 5/5, Social 5/5, Hierarchy 5/5, Conduct 8/8 -> Total 23/23
    # Hanan: Group 5/5, Social 5/5, Hierarchy 3/5, Conduct 5/8 -> Total 18/23
    scores_data = [
        # Maurine
        {"id": "sc_m1", "student_id": "std_maurine", "category": "GROUP_INTERACTION", "points": 5.0, "max_points": 5.0, "notes": "Active in discussions"},
        {"id": "sc_m2", "student_id": "std_maurine", "category": "SOCIAL_MEDIA", "points": 5.0, "max_points": 5.0, "notes": "Great engagement"},
        {"id": "sc_m3", "student_id": "std_maurine", "category": "HIERARCHY_RULES", "points": 5.0, "max_points": 5.0, "notes": "Full compliance"},
        {"id": "sc_m4", "student_id": "std_maurine", "category": "POLITE_CONDUCT", "points": 8.0, "max_points": 8.0, "notes": "Highly professional"},

        # Alaa
        {"id": "sc_a1", "student_id": "std_alaa", "category": "GROUP_INTERACTION", "points": 5.0, "max_points": 5.0, "notes": "Active mentor"},
        {"id": "sc_a2", "student_id": "std_alaa", "category": "SOCIAL_MEDIA", "points": 5.0, "max_points": 5.0, "notes": "Shared key announcements"},
        {"id": "sc_a3", "student_id": "std_alaa", "category": "HIERARCHY_RULES", "points": 5.0, "max_points": 5.0, "notes": "Lead coordination"},
        {"id": "sc_a4", "student_id": "std_alaa", "category": "POLITE_CONDUCT", "points": 8.0, "max_points": 8.0, "notes": "Exemplary attitude"},

        # Hanan
        {"id": "sc_h1", "student_id": "std_hanan", "category": "GROUP_INTERACTION", "points": 5.0, "max_points": 5.0, "notes": "Responsive in chat"},
        {"id": "sc_h2", "student_id": "std_hanan", "category": "SOCIAL_MEDIA", "points": 5.0, "max_points": 5.0, "notes": "Good engagement"},
        {"id": "sc_h3", "student_id": "std_hanan", "category": "HIERARCHY_RULES", "points": 3.0, "max_points": 5.0, "notes": "Minor deadline communication delay"},
        {"id": "sc_h4", "student_id": "std_hanan", "category": "POLITE_CONDUCT", "points": 5.0, "max_points": 8.0, "notes": "Needs more proactive updates"},
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

    await db.commit()
    print("Database seeded successfully with 8.xlsx ground truth!")


if __name__ == "__main__":
    async def main():
        await init_db()
        async with AsyncSessionLocal() as session:
            await seed_all(session)

    asyncio.run(main())
