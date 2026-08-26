"""
Agent Tool Registry and Controlled Execution Handlers.
"""
from typing import Any, Optional
from datetime import datetime, timezone
import json
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.entities import Student, Meeting, Event, Task, Submission, AttendanceRecord, ScoreRecord
from app.services.attendance_service import AttendanceService, AttendancePolicyEngine
from app.services.scoring_service import ScoringService
from app.services.calendar_service import CalendarService
from app.services.reminder_service import ReminderService
from app.providers.attendance_provider import MockAttendanceProvider
from app.providers.calendar_provider import MockCalendarProvider
from app.providers.messaging_provider import MockMessagingProvider


class ToolCategory:
    READ_ONLY = "READ_ONLY"
    WRITE = "WRITE"
    EXTERNAL_ACTION = "EXTERNAL_ACTION"


# Global singleton provider instances
mock_meet_provider = MockAttendanceProvider()
mock_cal_provider = MockCalendarProvider()
mock_msg_provider = MockMessagingProvider()

attendance_service = AttendanceService(mock_meet_provider)
calendar_service = CalendarService(mock_cal_provider)
reminder_service = ReminderService(mock_msg_provider)


# =========================================================
# Tool Implementation Handlers
# =========================================================

async def tool_get_student(db: AsyncSession, student_id_or_name: str) -> dict:
    """Retrieve full student profile by ID, email, or name."""
    query = student_id_or_name.strip().lower()
    res = await db.execute(
        select(Student).where(
            (Student.id == student_id_or_name) |
            (Student.email.ilike(f"%{query}%")) |
            (Student.full_name.ilike(f"%{query}%")) |
            (Student.arabic_name.ilike(f"%{query}%"))
        )
    )
    student = res.scalar_one_or_none()
    if not student:
        return {"found": False, "message": f"Student '{student_id_or_name}' not found."}
    return {
        "found": True,
        "student": {
            "id": student.id,
            "student_code": student.student_code,
            "full_name": student.full_name,
            "arabic_name": student.arabic_name,
            "email": student.email,
            "phone": student.phone,
            "role": student.role,
            "status": student.status,
            "university": student.university
        }
    }


async def tool_search_students(db: AsyncSession, query: str) -> dict:
    """Search active members across names, roles, and emails."""
    q = f"%{query.strip()}%"
    res = await db.execute(
        select(Student).where(
            (Student.full_name.ilike(q)) |
            (Student.arabic_name.ilike(q)) |
            (Student.email.ilike(q)) |
            (Student.role.ilike(q))
        )
    )
    students = res.scalars().all()
    return {
        "count": len(students),
        "students": [
            {"id": s.id, "name": s.full_name, "arabic_name": s.arabic_name, "role": s.role, "email": s.email, "phone": s.phone}
            for s in students
        ]
    }


async def tool_list_students(db: AsyncSession, role: Optional[str] = None, status: Optional[str] = None) -> dict:
    """List students with optional role or status filters."""
    query = select(Student)
    if role:
        query = query.where(Student.role.ilike(f"%{role}%"))
    if status:
        query = query.where(Student.status == status.upper())
    res = await db.execute(query)
    students = res.scalars().all()
    return {
        "count": len(students),
        "students": [
            {"id": s.id, "name": s.full_name, "arabic_name": s.arabic_name, "role": s.role, "email": s.email}
            for s in students
        ]
    }


async def tool_get_student_contacts(db: AsyncSession, student_ids: list[str]) -> dict:
    """Retrieve contact details for specified students."""
    res = await db.execute(select(Student).where(Student.id.in_(student_ids)))
    students = res.scalars().all()
    return {
        "contacts": [
            {"id": s.id, "name": s.full_name, "arabic_name": s.arabic_name, "email": s.email, "phone": s.phone}
            for s in students
        ]
    }


async def tool_get_upcoming_meetings(db: AsyncSession, limit: int = 5) -> dict:
    """Retrieve upcoming scheduled Google Meet meetings and events."""
    events = await calendar_service.get_upcoming_events(db, limit=limit)
    meetings = [e for e in events if e.event_type in ("MEETING", "CAMP", "WORKSHOP")]
    return {
        "count": len(meetings),
        "meetings": [
            {
                "id": m.id,
                "title": m.title,
                "start_time": m.start_time.isoformat(),
                "end_time": m.end_time.isoformat(),
                "location": m.location,
                "meet_url": m.meet_url
            }
            for m in meetings
        ]
    }


async def tool_get_meeting(db: AsyncSession, meeting_id: str) -> dict:
    """Retrieve metadata and status for a meeting."""
    res = await db.execute(
        select(Meeting).where((Meeting.id == meeting_id) | (Meeting.meeting_code == meeting_id))
    )
    meeting = res.scalar_one_or_none()
    if not meeting:
        return {"found": False, "message": f"Meeting '{meeting_id}' not found."}
    return {
        "found": True,
        "meeting": {
            "id": meeting.id,
            "code": meeting.meeting_code,
            "title": meeting.title,
            "topic": meeting.topic,
            "start_time": meeting.start_time.isoformat(),
            "duration_minutes": meeting.duration_minutes,
            "meet_url": meeting.meet_url,
            "status": meeting.status
        }
    }


async def tool_get_meeting_attendance(db: AsyncSession, meeting_id: Optional[str] = "today_sync") -> dict:
    """
    Retrieve or compute deterministic attendance for a meeting.
    Defaults to today's sync meeting.
    """
    if not meeting_id or meeting_id == "today" or meeting_id == "latest":
        meeting_id = "today_sync"

    # Find meeting
    res = await db.execute(
        select(Meeting).where((Meeting.id == meeting_id) | (Meeting.meeting_code == meeting_id))
    )
    meeting = res.scalar_one_or_none()
    if not meeting:
        return {"success": False, "message": f"Meeting '{meeting_id}' not found."}

    # Fetch attendance records
    att_res = await db.execute(
        select(AttendanceRecord, Student)
        .join(Student, AttendanceRecord.student_id == Student.id)
        .where(AttendanceRecord.meeting_id == meeting.id)
    )
    records = att_res.all()

    # If no records yet, process with AttendanceService
    if not records:
        try:
            await attendance_service.process_meeting_attendance(meeting.id, db)
            att_res = await db.execute(
                select(AttendanceRecord, Student)
                .join(Student, AttendanceRecord.student_id == Student.id)
                .where(AttendanceRecord.meeting_id == meeting.id)
            )
            records = att_res.all()
        except Exception as e:
            return {"success": False, "error": str(e)}

    present = []
    late = []
    absent = []

    for att, std in records:
        item = {
            "student_id": std.id,
            "name": std.full_name,
            "arabic_name": std.arabic_name,
            "phone": std.phone,
            "status": att.status,
            "duration_minutes": att.total_duration_minutes,
            "match_confidence": att.match_confidence
        }
        if att.status == "PRESENT":
            present.append(item)
        elif att.status == "LATE":
            late.append(item)
        else:
            absent.append(item)

    return {
        "success": True,
        "meeting": {
            "id": meeting.id,
            "title": meeting.title,
            "date": meeting.start_time.strftime("%Y-%m-%d %H:%M UTC")
        },
        "summary": {
            "total_expected": len(records),
            "present_count": len(present),
            "late_count": len(late),
            "absent_count": len(absent)
        },
        "present_students": present,
        "late_students": late,
        "absent_students": absent
    }


async def tool_get_student_attendance(db: AsyncSession, student_id: str) -> dict:
    """Retrieve full attendance history for a single student."""
    res = await db.execute(
        select(AttendanceRecord, Meeting)
        .join(Meeting, AttendanceRecord.meeting_id == Meeting.id)
        .where(AttendanceRecord.student_id == student_id)
        .order_by(Meeting.start_time.asc())
    )
    records = res.all()
    return {
        "student_id": student_id,
        "history": [
            {
                "meeting_id": m.id,
                "title": m.title,
                "date": m.start_time.strftime("%Y-%m-%d"),
                "status": att.status,
                "duration_minutes": att.total_duration_minutes
            }
            for att, m in records
        ]
    }


async def tool_get_upcoming_events(db: AsyncSession, limit: int = 10) -> dict:
    """Retrieve upcoming calendar events and deadlines."""
    events = await calendar_service.get_upcoming_events(db, limit=limit)
    return {
        "count": len(events),
        "events": [
            {
                "id": e.id,
                "title": e.title,
                "type": e.event_type,
                "start_time": e.start_time.isoformat(),
                "location": e.location,
                "meet_url": e.meet_url
            }
            for e in events
        ]
    }


async def tool_get_tasks(db: AsyncSession) -> dict:
    """List all tasks and deadlines."""
    res = await db.execute(select(Task).order_by(Task.task_number.asc()))
    tasks = res.scalars().all()
    return {
        "count": len(tasks),
        "tasks": [
            {
                "id": t.id,
                "task_number": t.task_number,
                "title": t.title,
                "description": t.description,
                "deadline": t.deadline.isoformat(),
                "max_score": t.max_score
            }
            for t in tasks
        ]
    }


async def tool_get_pending_submissions(db: AsyncSession, task_id: Optional[str] = None) -> dict:
    """List students who have pending/unsubmitted tasks."""
    query = select(Submission, Student, Task).join(Student, Submission.student_id == Student.id).join(Task, Submission.task_id == Task.id)
    if task_id:
        query = query.where(Submission.task_id == task_id)
    query = query.where(Submission.status.in_(["PENDING", "MISSED"]))
    res = await db.execute(query)
    records = res.all()
    return {
        "pending_count": len(records),
        "pending_submissions": [
            {
                "student_id": s.id,
                "student_name": s.full_name,
                "arabic_name": s.arabic_name,
                "phone": s.phone,
                "task_number": t.task_number,
                "task_title": t.title,
                "status": sub.status,
                "deadline": t.deadline.isoformat()
            }
            for sub, s, t in records
        ]
    }


async def tool_get_student_score(db: AsyncSession, student_id_or_name: str) -> dict:
    """Retrieve 8.xlsx scoring summary for a student."""
    # Find student ID first
    s_lookup = await tool_get_student(db, student_id_or_name)
    if not s_lookup.get("found"):
        return {"found": False, "message": f"Student '{student_id_or_name}' not found."}
    
    student_id = s_lookup["student"]["id"]
    summary = await ScoringService.get_student_score_summary(student_id, db)
    if not summary:
        return {"found": False, "message": "No score summary available."}
    return {
        "found": True,
        "score_summary": summary.model_dump()
    }


async def tool_get_scores(db: AsyncSession) -> dict:
    """Retrieve evaluation scoreboard for all members."""
    summaries = await ScoringService.get_all_summaries(db)
    return {
        "total_members": len(summaries),
        "scoreboard": [s.model_dump() for s in summaries]
    }


async def tool_prepare_reminder(
    db: AsyncSession,
    student_ids: list[str],
    event_id: Optional[str] = None,
    custom_message: Optional[str] = None
) -> dict:
    """
    Drafts a reminder message for specified students without sending.
    Safe read-only operation.
    """
    # Fetch students
    res = await db.execute(select(Student).where(Student.id.in_(student_ids)))
    students = res.scalars().all()
    if not students:
        return {"success": False, "message": "No valid students found for reminder."}

    # Fetch event
    event = None
    if event_id:
        ev_res = await db.execute(select(Event).where(Event.id == event_id))
        event = ev_res.scalar_one_or_none()
    if not event:
        # Fallback to next meeting
        event_schema = await calendar_service.get_next_meeting(db)
        if event_schema:
            ev_res = await db.execute(select(Event).where(Event.id == event_schema.id))
            event = ev_res.scalar_one_or_none()

    preview_text = reminder_service.generate_meeting_reminder_text(
        student_name=students[0].arabic_name or students[0].full_name,
        event_title=event.title if event else "الاجتماع القادم",
        event_time=event.start_time if event else datetime.now(timezone.utc),
        meet_url=event.meet_url if event else ""
    )

    return {
        "success": True,
        "target_count": len(students),
        "recipients": [
            {"id": s.id, "name": s.full_name, "arabic_name": s.arabic_name, "phone": s.phone}
            for s in students
        ],
        "event": {
            "id": event.id if event else None,
            "title": event.title if event else None,
            "time": event.start_time.isoformat() if event else None,
            "meet_url": event.meet_url if event else None
        } if event else None,
        "message_preview": preview_text,
        "channel": "WHATSAPP",
        "requires_confirmation": True
    }


async def tool_send_reminder(
    db: AsyncSession,
    student_ids: list[str],
    event_id: Optional[str] = None,
    custom_message: Optional[str] = None,
    channel: str = "WHATSAPP",
    is_confirmed: bool = False
) -> dict:
    """
    Sends reminders to students.
    EXTERNAL ACTION: Requires confirmation before sending.
    """
    if not is_confirmed:
        # Intercept and demand confirmation
        prep = await tool_prepare_reminder(db, student_ids, event_id, custom_message)
        return {
            "status": "REQUIRES_CONFIRMATION",
            "message": f"Confirmation required before sending reminders to {prep['target_count']} recipient(s).",
            "preview_data": prep
        }

    # Fetch students
    res = await db.execute(select(Student).where(Student.id.in_(student_ids)))
    students = res.scalars().all()
    if not students:
        return {"success": False, "message": "No students found."}

    event = None
    if event_id:
        ev_res = await db.execute(select(Event).where(Event.id == event_id))
        event = ev_res.scalar_one_or_none()

    result = await reminder_service.send_reminders(
        students=list(students),
        event=event,
        custom_message=custom_message,
        channel=channel,
        db=db
    )
    return result.model_dump()


# =========================================================
# Tool Metadata Registry
# =========================================================

TOOL_DEFINITIONS = [
    {
        "name": "get_meeting_attendance",
        "description": "Retrieves the deterministic attendance record for a meeting (defaults to today's sync). Identifies present, late, and absent students.",
        "category": ToolCategory.READ_ONLY,
        "parameters": {
            "type": "object",
            "properties": {
                "meeting_id": {
                    "type": "string",
                    "description": "The ID or code of the meeting (e.g., 'today_sync', 'meet_21_08')."
                }
            }
        }
    },
    {
        "name": "get_upcoming_meetings",
        "description": "Retrieves upcoming Google Meet / Calendar meetings.",
        "category": ToolCategory.READ_ONLY,
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Maximum number of meetings to return (default 5)."}
            }
        }
    },
    {
        "name": "get_student_contacts",
        "description": "Retrieves verified contact channels (phone, email) for specific student IDs.",
        "category": ToolCategory.READ_ONLY,
        "parameters": {
            "type": "object",
            "properties": {
                "student_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of student IDs."
                }
            },
            "required": ["student_ids"]
        }
    },
    {
        "name": "prepare_reminder",
        "description": "Drafts and previews a reminder message for students without sending it.",
        "category": ToolCategory.READ_ONLY,
        "parameters": {
            "type": "object",
            "properties": {
                "student_ids": {"type": "array", "items": {"type": "string"}},
                "event_id": {"type": "string", "description": "Target event/meeting ID."},
                "custom_message": {"type": "string", "description": "Optional custom message text."}
            },
            "required": ["student_ids"]
        }
    },
    {
        "name": "send_reminder",
        "description": "Sends an automated reminder message to target students via WhatsApp/SMS. SENSITIVE: Requires human confirmation.",
        "category": ToolCategory.EXTERNAL_ACTION,
        "parameters": {
            "type": "object",
            "properties": {
                "student_ids": {"type": "array", "items": {"type": "string"}},
                "event_id": {"type": "string", "description": "Target event/meeting ID."},
                "custom_message": {"type": "string", "description": "Optional custom message text."},
                "channel": {"type": "string", "enum": ["WHATSAPP", "SMS"]}
            },
            "required": ["student_ids"]
        }
    },
    {
        "name": "get_student_score",
        "description": "Retrieves the exact 8.xlsx evaluation scorecard for a student (Attendance, Tasks /10, Behavior /23).",
        "category": ToolCategory.READ_ONLY,
        "parameters": {
            "type": "object",
            "properties": {
                "student_id_or_name": {"type": "string", "description": "Student ID or full/Arabic name."}
            },
            "required": ["student_id_or_name"]
        }
    },
    {
        "name": "get_scores",
        "description": "Retrieves the full evaluation summary board across all members.",
        "category": ToolCategory.READ_ONLY,
        "parameters": {"type": "object", "properties": {}}
    },
    {
        "name": "get_pending_submissions",
        "description": "Retrieves students who have not submitted a task deadline.",
        "category": ToolCategory.READ_ONLY,
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "Optional task ID."}
            }
        }
    },
    {
        "name": "search_students",
        "description": "Searches students by name, email, or role.",
        "category": ToolCategory.READ_ONLY,
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search keyword."}
            },
            "required": ["query"]
        }
    }
]


# Tool dispatcher map
TOOL_REGISTRY = {
    "get_meeting_attendance": tool_get_meeting_attendance,
    "get_upcoming_meetings": tool_get_upcoming_meetings,
    "get_student_contacts": tool_get_student_contacts,
    "prepare_reminder": tool_prepare_reminder,
    "send_reminder": tool_send_reminder,
    "get_student_score": tool_get_student_score,
    "get_scores": tool_get_scores,
    "get_pending_submissions": tool_get_pending_submissions,
    "search_students": tool_search_students,
    "get_student": tool_get_student,
    "list_students": tool_list_students,
    "get_upcoming_events": tool_get_upcoming_events,
    "get_tasks": tool_get_tasks,
    "get_student_attendance": tool_get_student_attendance,
}
