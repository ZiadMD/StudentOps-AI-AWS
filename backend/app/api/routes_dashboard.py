"""
Dashboard Overview Statistics Endpoint.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.entities import Student, Meeting, AttendanceRecord, Submission, Event, AgentActionAudit
from app.models.schemas import DashboardStats

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    # 1. Total Students
    std_res = await db.execute(select(func.count(Student.id)))
    total_students = std_res.scalar() or 0

    # 2. Today's Attendance
    att_res = await db.execute(
        select(AttendanceRecord).where(AttendanceRecord.meeting_id == "today_sync")
    )
    records = att_res.scalars().all()
    present_today = sum(1 for r in records if r.status == "PRESENT")
    late_today = sum(1 for r in records if r.status == "LATE")
    absent_today = sum(1 for r in records if "ABSENT" in r.status or "REJECTED" in r.status)

    total_checked = len(records)
    rate = round(((present_today + late_today) / total_checked * 100.0), 1) if total_checked > 0 else 100.0

    # 3. Upcoming Events Count
    ev_res = await db.execute(select(func.count(Event.id)))
    upcoming_meetings = ev_res.scalar() or 0

    # 4. Pending Submissions Count
    sub_res = await db.execute(
        select(func.count(Submission.id)).where(Submission.status == "PENDING")
    )
    pending_submissions = sub_res.scalar() or 0

    # 5. Recent Agent Actions Count
    act_res = await db.execute(select(func.count(AgentActionAudit.id)))
    recent_actions = act_res.scalar() or 0

    return DashboardStats(
        total_students=total_students,
        present_today=present_today,
        late_today=late_today,
        absent_today=absent_today,
        attendance_rate_today=rate,
        upcoming_meetings_count=upcoming_meetings,
        pending_submissions_count=pending_submissions,
        recent_actions_count=recent_actions
    )
