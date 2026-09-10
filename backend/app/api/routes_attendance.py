"""
Meeting and Attendance Endpoints for Social Media Committee.
"""
from typing import Optional
import uuid
from datetime import timedelta
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_roles
from app.models.entities import Meeting, AttendanceRecord, Student, User, MeetingAssignment
from app.models.schemas import MeetingDetailResponse, AttendanceRecordSchema, MeetingCreateRequest
from app.agent.tools import attendance_service

router = APIRouter(prefix="/attendance", tags=["Attendance"])


@router.get("/meetings")
async def list_meetings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    query = select(Meeting).order_by(Meeting.start_time.desc())

    if current_user.role in ("committee_member", "member"):
        # Committee members only see meetings assigned to them or for their committee
        subq = select(MeetingAssignment.meeting_id).where(MeetingAssignment.student_id == current_user.student_id)
        if current_user.team_id:
            query = query.where((Meeting.id.in_(subq)) | (Meeting.team_id == current_user.team_id))
        else:
            query = query.where(Meeting.id.in_(subq))
    elif current_user.role in ("committee_head", "team_lead"):
        if current_user.team_id:
            query = query.where(Meeting.team_id == current_user.team_id)
    elif current_user.role in ("committee_hr_leader", "committee_hr_member"):
        if current_user.team_id:
            query = query.where(Meeting.team_id == current_user.team_id)

    res = await db.execute(query)
    meetings = res.scalars().all()
    if not meetings:
        return []

    meeting_ids = [m.id for m in meetings]

    att_res = await db.execute(
        select(AttendanceRecord).where(AttendanceRecord.meeting_id.in_(meeting_ids))
    )
    records_by_meeting = defaultdict(list)
    for r in att_res.scalars().all():
        records_by_meeting[r.meeting_id].append(r)

    assign_res = await db.execute(
        select(MeetingAssignment).where(MeetingAssignment.meeting_id.in_(meeting_ids))
    )
    assignments_by_meeting = defaultdict(list)
    for a in assign_res.scalars().all():
        assignments_by_meeting[a.meeting_id].append(a)

    results = []
    for m in meetings:
        records = records_by_meeting[m.id]
        assignments = assignments_by_meeting[m.id]

        results.append({
            "id": m.id,
            "meeting_code": m.meeting_code,
            "code": m.meeting_code,  # backwards compatibility alias
            "title": m.title,
            "topic": m.topic,
            "session_number": m.session_number or 1,
            "start_time": m.start_time.isoformat(),
            "duration_minutes": m.duration_minutes,
            "meet_url": m.meet_url,
            "status": m.status,
            "total_expected": len(records) if records else len(assignments),
            "present_count": sum(1 for r in records if r.status == "PRESENT"),
            "late_count": sum(1 for r in records if r.status == "LATE"),
            "absent_count": sum(1 for r in records if "ABSENT" in r.status or "REJECTED" in r.status)
        })
    return results


@router.post("/meetings", status_code=status.HTTP_201_CREATED)
async def create_meeting(
    body: MeetingCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_head", "team_lead", "hr_admin"]))
):
    """
    Schedules a new meeting and sets the session number and explicit member assignments.
    Social Media Committee Head owns operational meeting and session scheduling.
    """
    meeting_id = f"meet_{uuid.uuid4().hex[:10]}"
    meeting_code = f"sync_{uuid.uuid4().hex[:6]}"
    end_time = body.start_time + timedelta(minutes=body.duration_minutes)
    target_team_id = body.team_id or current_user.team_id or "team_media"

    meeting = Meeting(
        id=meeting_id,
        meeting_code=meeting_code,
        title=body.title.strip(),
        topic=body.topic or "",
        start_time=body.start_time,
        end_time=end_time,
        duration_minutes=body.duration_minutes,
        session_number=body.session_number,
        meet_url=body.meet_url or "https://meet.google.com/social-media-sync",
        status="SCHEDULED",
        responsible_user_id=current_user.id,
        team_id=target_team_id,
    )
    db.add(meeting)

    assigned_count = 0
    if body.assigned_student_ids:
        for sid in set(body.assigned_student_ids):
            db.add(MeetingAssignment(
                id=f"ma_{uuid.uuid4().hex[:12]}",
                meeting_id=meeting_id,
                student_id=sid,
            ))
            assigned_count += 1

    await db.commit()
    await db.refresh(meeting)

    return {
        "id": meeting.id,
        "meeting_code": meeting.meeting_code,
        "title": meeting.title,
        "session_number": meeting.session_number,
        "team_id": meeting.team_id,
        "start_time": meeting.start_time.isoformat(),
        "duration_minutes": meeting.duration_minutes,
        "meet_url": meeting.meet_url,
        "assigned_count": assigned_count,
        "message": f"Social Media Meeting '{meeting.title}' (Session #{meeting.session_number}) scheduled successfully."
    }


@router.get("/meetings/{meeting_id}", response_model=MeetingDetailResponse)
async def get_meeting_attendance(
    meeting_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieves meeting detail and attendance records scoped by role:
    - hr_admin / region_hr_head: sees all attendee records.
    - committee_head / committee_hr_leader / committee_hr_member: sees attendees for their committee.
    - member: sees only their own attendance record for this meeting.
    """
    res = await db.execute(
        select(Meeting).where((Meeting.id == meeting_id) | (Meeting.meeting_code == meeting_id))
    )
    meeting = res.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    att_res = await db.execute(
        select(AttendanceRecord, Student)
        .join(Student, AttendanceRecord.student_id == Student.id)
        .where(AttendanceRecord.meeting_id == meeting.id)
    )
    records = att_res.all()

    # If empty, process
    if not records:
        await attendance_service.process_meeting_attendance(meeting.id, db)
        att_res = await db.execute(
            select(AttendanceRecord, Student)
            .join(Student, AttendanceRecord.student_id == Student.id)
            .where(AttendanceRecord.meeting_id == meeting.id)
        )
        records = att_res.all()

    # Filter records based on role and team scoping
    if current_user.role in ("committee_head", "team_lead", "committee_hr_leader"):
        if current_user.team_id:
            records = [r for r in records if r[1].team_id == current_user.team_id]
    elif current_user.role == "committee_hr_member":
        if current_user.team_id:
            records = [r for r in records if r[1].team_id == current_user.team_id]
    elif current_user.role in ("committee_member", "member"):
        records = [r for r in records if r[1].id == current_user.student_id]

    att_schemas = [
        AttendanceRecordSchema(
            id=att.id,
            student_id=std.id,
            student_name=std.full_name,
            arabic_name=std.arabic_name,
            status=att.status,
            match_confidence=att.match_confidence,
            first_join=att.first_join,
            last_leave=att.last_leave,
            total_duration_minutes=att.total_duration_minutes,
            excuse_reason=att.excuse_reason,
            excuse_status=att.excuse_status
        )
        for att, std in records
    ]

    return MeetingDetailResponse(
        id=meeting.id,
        meeting_code=meeting.meeting_code,
        title=meeting.title,
        topic=meeting.topic,
        start_time=meeting.start_time,
        end_time=meeting.end_time,
        duration_minutes=meeting.duration_minutes,
        meet_url=meeting.meet_url,
        status=meeting.status,
        session_number=meeting.session_number or 1,
        team_id=meeting.team_id,
        total_expected=len(att_schemas),
        present_count=sum(1 for a in att_schemas if a.status == "PRESENT"),
        late_count=sum(1 for a in att_schemas if a.status == "LATE"),
        absent_count=sum(1 for a in att_schemas if "ABSENT" in a.status or "REJECTED" in a.status),
        attendance=att_schemas
    )


@router.post("/meetings/{meeting_id}/process")
async def reprocess_meeting(
    meeting_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["committee_hr_member", "hr_admin"]))
):
    """
    Triggers the deterministic attendance policy processor for a meeting.
    HR Member takes attendance, which records statuses and flags absent members for human WhatsApp follow-up.
    """
    try:
        records = await attendance_service.process_meeting_attendance(meeting_id, db)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))

    return {
        "success": True,
        "processed_count": len(records),
        "message": "Attendance evaluated and synced successfully. Absenteeism flags created for human follow-up."
    }

