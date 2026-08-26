"""
Deterministic Attendance Policy Engine and Service.
"""
from typing import Optional
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.models.entities import Meeting, Student, AttendanceRecord, ParticipantSession
from app.providers.attendance_provider import AttendanceProvider, RawMeetingAttendance
from app.services.identity_matcher import IdentityMatcher


class AttendancePolicyEngine:
    """Deterministic evaluation of meeting attendance."""

    @staticmethod
    def evaluate_status(
        meeting_start: datetime,
        meeting_duration_minutes: int,
        first_join: Optional[datetime],
        total_duration_minutes: float,
        excuse_status: Optional[str] = None
    ) -> str:
        """
        Determines the attendance status based on explicit HR policies:
        - PRESENT: Total duration >= MIN_PRESENT_PERCENT (70%) and joined <= LATE_THRESHOLD (10m)
        - LATE: Joined > LATE_THRESHOLD (10m) and total duration >= MIN_LATE_PERCENT (50%)
        - EXCUSED_*: If excuse exists and is accepted/moderate/rejected
        - UNEXCUSED_ABSENT: No valid session and no approved excuse
        """
        if excuse_status:
            return excuse_status

        if not first_join or total_duration_minutes <= 0:
            return "UNEXCUSED_ABSENT"

        # Calculate join delay in minutes
        # Ensure meeting_start and first_join have comparable timezone awareness
        if meeting_start.tzinfo and not first_join.tzinfo:
            first_join = first_join.replace(tzinfo=timezone.utc)
        elif not meeting_start.tzinfo and first_join.tzinfo:
            meeting_start = meeting_start.replace(tzinfo=timezone.utc)

        delay_minutes = (first_join - meeting_start).total_seconds() / 60.0
        attendance_percent = (total_duration_minutes / max(meeting_duration_minutes, 1)) * 100.0

        if delay_minutes <= settings.ATTENDANCE_LATE_THRESHOLD_MINUTES and attendance_percent >= settings.ATTENDANCE_MIN_PRESENT_PERCENT:
            return "PRESENT"

        if attendance_percent >= settings.ATTENDANCE_MIN_LATE_PERCENT:
            return "LATE"

        return "UNEXCUSED_ABSENT"


class AttendanceService:
    """Manages attendance fetching, identity resolution, and database persistence."""

    def __init__(self, provider: AttendanceProvider):
        self.provider = provider

    async def process_meeting_attendance(
        self,
        meeting_id: str,
        db: AsyncSession
    ) -> list[AttendanceRecord]:
        """
        Fetch raw meeting logs, match participants to students, aggregate multi-sessions,
        calculate deterministic statuses, and persist to database.
        """
        # 1. Retrieve meeting
        res = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
        meeting = res.scalar_one_or_none()
        if not meeting:
            # Try finding by meeting_code
            res = await db.execute(select(Meeting).where(Meeting.meeting_code == meeting_id))
            meeting = res.scalar_one_or_none()
            if not meeting:
                raise ValueError(f"Meeting with ID/code '{meeting_id}' not found.")

        # 2. Retrieve all active students for matching
        students_res = await db.execute(select(Student))
        students = students_res.scalars().all()
        student_dicts = [
            {"id": s.id, "full_name": s.full_name, "arabic_name": s.arabic_name, "email": s.email}
            for s in students
        ]

        # 3. Retrieve raw logs from Provider
        raw_data = await self.provider.get_raw_meeting_attendance(meeting.meeting_code)
        
        # Student ID -> list of sessions
        student_sessions: dict[str, list] = {s.id: [] for s in students}
        
        if raw_data and raw_data.sessions:
            for raw_session in raw_data.sessions:
                match = IdentityMatcher.match_participant(
                    display_name=raw_session.display_name,
                    email=raw_session.email,
                    students=student_dicts
                )
                
                # Save raw session record
                p_session = ParticipantSession(
                    id=f"sess_{raw_session.join_time.timestamp()}_{match.student_id or 'unmatched'}",
                    meeting_id=meeting.id,
                    raw_display_name=raw_session.display_name,
                    raw_email=raw_session.email or "",
                    join_time=raw_session.join_time,
                    leave_time=raw_session.leave_time,
                    duration_seconds=raw_session.duration_seconds,
                    matched_student_id=match.student_id
                )
                db.add(p_session)

                if match.student_id:
                    student_sessions[match.student_id].append({
                        "session": raw_session,
                        "confidence": match.confidence
                    })

        # 4. Evaluate deterministic status for EVERY registered student
        attendance_records: list[AttendanceRecord] = []
        
        for student in students:
            sessions_info = student_sessions.get(student.id, [])
            
            if sessions_info:
                first_join = min(s["session"].join_time for s in sessions_info)
                last_leave = max(s["session"].leave_time for s in sessions_info)
                total_duration = sum(s["session"].duration_seconds for s in sessions_info) / 60.0
                confidence = max(s["confidence"] for s in sessions_info)
            else:
                first_join = None
                last_leave = None
                total_duration = 0.0
                confidence = 1.0

            status = AttendancePolicyEngine.evaluate_status(
                meeting_start=meeting.start_time,
                meeting_duration_minutes=meeting.duration_minutes,
                first_join=first_join,
                total_duration_minutes=total_duration
            )

            # Check if record already exists
            existing_rec_res = await db.execute(
                select(AttendanceRecord).where(
                    AttendanceRecord.meeting_id == meeting.id,
                    AttendanceRecord.student_id == student.id
                )
            )
            existing_rec = existing_rec_res.scalar_one_or_none()

            if existing_rec:
                existing_rec.status = status
                existing_rec.first_join = first_join
                existing_rec.last_leave = last_leave
                existing_rec.total_duration_minutes = total_duration
                existing_rec.match_confidence = confidence
                attendance_records.append(existing_rec)
            else:
                att_record = AttendanceRecord(
                    id=f"att_{meeting.id}_{student.id}",
                    meeting_id=meeting.id,
                    student_id=student.id,
                    status=status,
                    match_confidence=confidence,
                    first_join=first_join,
                    last_leave=last_leave,
                    total_duration_minutes=total_duration,
                    policy_version="v1.0"
                )
                db.add(att_record)
                attendance_records.append(att_record)

        await db.commit()
        return attendance_records
