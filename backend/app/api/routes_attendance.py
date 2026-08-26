"""
Meeting and Attendance Endpoints.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.entities import Meeting, AttendanceRecord, Student
from app.models.schemas import MeetingDetailResponse, AttendanceRecordSchema
from app.agent.tools import attendance_service

router = APIRouter(prefix="/attendance", tags=["Attendance"])


@router.get("/meetings")
async def list_meetings(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Meeting).order_by(Meeting.start_time.desc()))
    meetings = res.scalars().all()
    results = []
    for m in meetings:
        att_res = await db.execute(
            select(AttendanceRecord).where(AttendanceRecord.meeting_id == m.id)
        )
        records = att_res.scalars().all()
        results.append({
            "id": m.id,
            "code": m.meeting_code,
            "title": m.title,
            "topic": m.topic,
            "start_time": m.start_time.isoformat(),
            "duration_minutes": m.duration_minutes,
            "meet_url": m.meet_url,
            "status": m.status,
            "total_expected": len(records),
            "present_count": sum(1 for r in records if r.status == "PRESENT"),
            "late_count": sum(1 for r in records if r.status == "LATE"),
            "absent_count": sum(1 for r in records if "ABSENT" in r.status or "REJECTED" in r.status)
        })
    return results


@router.get("/meetings/{meeting_id}", response_model=MeetingDetailResponse)
async def get_meeting_attendance(meeting_id: str, db: AsyncSession = Depends(get_db)):
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
        total_expected=len(att_schemas),
        present_count=sum(1 for a in att_schemas if a.status == "PRESENT"),
        late_count=sum(1 for a in att_schemas if a.status == "LATE"),
        absent_count=sum(1 for a in att_schemas if "ABSENT" in a.status or "REJECTED" in a.status),
        attendance=att_schemas
    )


@router.post("/meetings/{meeting_id}/process")
async def reprocess_meeting(meeting_id: str, db: AsyncSession = Depends(get_db)):
    """Triggers the deterministic attendance policy processor for a meeting."""
    records = await attendance_service.process_meeting_attendance(meeting_id, db)
    return {
        "success": True,
        "processed_count": len(records),
        "message": "Attendance evaluated and synced successfully."
    }
