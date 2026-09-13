from app.models.schemas import PermissionContext
"""
Agent Tool Registry and Controlled Execution Handlers.
"""
from typing import Any, Optional
from datetime import datetime, timezone
import json
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.services.identity_matcher import IdentityMatcher
from app.models.entities import Student, Meeting, Event, Task, Submission, AttendanceRecord, ScoreRecord
from app.core.time import as_utc
from app.services.attendance_service import AttendanceService, AttendancePolicyEngine
from app.services.scoring_service import ScoringService
from app.services.calendar_service import CalendarService
from app.services.reminder_service import ReminderService
from app.core.config import settings
from app.providers.attendance_provider import GoogleMeetAttendanceProvider, MockAttendanceProvider
from app.providers.calendar_provider import GoogleCalendarProvider, MockCalendarProvider
from app.providers.messaging_provider import MockMessagingProvider
from app.providers.openwa_provider import OpenWAProvider


class ToolCategory:
    READ_ONLY = "READ_ONLY"
    WRITE = "WRITE"
    EXTERNAL_ACTION = "EXTERNAL_ACTION"


# Keep offline demos and tests deterministic while using live integrations in production.
use_live_providers = settings.ENVIRONMENT.lower() == "production" or settings.MESSAGING_PROVIDER.lower() == "openwa"
meet_provider = GoogleMeetAttendanceProvider() if use_live_providers else MockAttendanceProvider()
cal_provider = GoogleCalendarProvider() if use_live_providers else MockCalendarProvider()
msg_provider = OpenWAProvider() if use_live_providers else MockMessagingProvider()

attendance_service = AttendanceService(meet_provider)
calendar_service = CalendarService(cal_provider)
reminder_service = ReminderService(msg_provider)


def escape_like(val: str) -> str:
    """Escapes SQL LIKE/ILIKE wildcards (%, _, \\) from user input."""
    return val.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# =========================================================
# Tool Implementation Handlers
# =========================================================

async def tool_get_student(
    db: AsyncSession,
    context: Any = None,
    student_id_or_name: Optional[str] = None,
    **kwargs
) -> dict:
    """Retrieve full student profile by ID, code, email, or name with dynamic identity resolution and team scoping."""
    # Support flexible parameter ordering:
    # 1. tool_get_student(db, context, query)
    # 2. tool_get_student(db, query)
    # 3. tool_get_student(db, query, context=context)
    # 4. tool_get_student(db=db, context=context, student_id_or_name=query)
    if isinstance(context, str) and student_id_or_name is None:
        real_query = context
        real_context = kwargs.get("context")
    elif isinstance(context, PermissionContext):
        real_context = context
        real_query = student_id_or_name or kwargs.get("student_id_or_name", "")
    else:
        real_context = kwargs.get("context")
        real_query = student_id_or_name or (context if isinstance(context, str) else "") or kwargs.get("student_id_or_name", "")

    raw_query = real_query
    if not isinstance(raw_query, str) or not raw_query.strip():
        return {"found": False, "message": "No student identifier provided."}

    raw_query = raw_query.strip()
    query = raw_query.lower()
    escaped = escape_like(query)

    def is_scoped(student_obj) -> bool:
        if not real_context or real_context.is_admin_override:
            return True
        if not real_context.team_id:
            return False
        return student_obj.team_id == real_context.team_id

    # 1. Direct match by ID (primary key) or exact student_code
    exact_res = await db.execute(
        select(Student).where(
            (Student.id == raw_query) |
            (func.lower(Student.student_code) == query)
        )
    )
    exact_student = exact_res.scalar_one_or_none()
    if exact_student:
        if not is_scoped(exact_student):
            return {"found": False, "message": f"Student '{raw_query}' not found or outside your team scope."}
        return {
            "found": True,
            "student": {
                "id": exact_student.id,
                "student_code": exact_student.student_code,
                "full_name": exact_student.full_name,
                "arabic_name": exact_student.arabic_name,
                "email": exact_student.email,
                "phone": exact_student.phone,
                "role": exact_student.role,
                "status": exact_student.status,
                "university": exact_student.university,
                "team_id": exact_student.team_id
            }
        }

    # 2. Exact email match
    email_res = await db.execute(
        select(Student).where(func.lower(Student.email) == query)
    )
    email_student = email_res.scalar_one_or_none()
    if email_student:
        if not is_scoped(email_student):
            return {"found": False, "message": f"Student '{raw_query}' not found or outside your team scope."}
        return {
            "found": True,
            "student": {
                "id": email_student.id,
                "student_code": email_student.student_code,
                "full_name": email_student.full_name,
                "arabic_name": email_student.arabic_name,
                "email": email_student.email,
                "phone": email_student.phone,
                "role": email_student.role,
                "status": email_student.status,
                "university": email_student.university,
                "team_id": email_student.team_id
            }
        }

    # 3. Dynamic multi-tier name resolution using IdentityMatcher across students
    all_res = await db.execute(select(Student))
    all_students_unfiltered = all_res.scalars().all()
    if not all_students_unfiltered:
        return {"found": False, "message": f"Student '{raw_query}' not found."}

    all_students = [s for s in all_students_unfiltered if is_scoped(s)]
    if not all_students and real_context and not real_context.is_admin_override and real_context.team_id:
        return {"found": False, "message": f"Student '{raw_query}' not found or outside your team scope."}

    norm_query = IdentityMatcher.normalize_text(raw_query)

    exact_name_matches = []
    token_matches = []

    for s in all_students:
        norm_ar = IdentityMatcher.normalize_text(s.arabic_name or "")
        norm_en = IdentityMatcher.normalize_text(s.full_name or "")

        # Check exact normalized full name match
        if norm_query and (norm_query == norm_ar or norm_query == norm_en):
            exact_name_matches.append(s)
            continue

        # Check token matching via IdentityMatcher
        matched_ar, conf_ar = IdentityMatcher._match_name_tokens(norm_query, norm_ar)
        matched_en, conf_en = IdentityMatcher._match_name_tokens(norm_query, norm_en)

        if matched_ar or matched_en:
            conf = max(conf_ar, conf_en)
            token_matches.append((s, conf))

    # Evaluate exact normalized name matches first
    if len(exact_name_matches) == 1:
        s = exact_name_matches[0]
        return {
            "found": True,
            "student": {
                "id": s.id,
                "student_code": s.student_code,
                "full_name": s.full_name,
                "arabic_name": s.arabic_name,
                "email": s.email,
                "phone": s.phone,
                "role": s.role,
                "status": s.status,
                "university": s.university,
                "team_id": s.team_id
            }
        }
    elif len(exact_name_matches) > 1:
        return {
            "found": False,
            "ambiguous": True,
            "matches": [
                {"id": s.id, "name": s.full_name, "arabic_name": s.arabic_name, "student_code": s.student_code}
                for s in exact_name_matches
            ],
            "message": f"Multiple students found matching '{raw_query}'."
        }

    # Evaluate token matches
    if len(token_matches) == 1:
        s = token_matches[0][0]
        return {
            "found": True,
            "student": {
                "id": s.id,
                "student_code": s.student_code,
                "full_name": s.full_name,
                "arabic_name": s.arabic_name,
                "email": s.email,
                "phone": s.phone,
                "role": s.role,
                "status": s.status,
                "university": s.university,
                "team_id": s.team_id
            }
        }
    elif len(token_matches) > 1:
        token_matches.sort(key=lambda x: x[1], reverse=True)
        top_conf = token_matches[0][1]
        top_matches = [m for m in token_matches if abs(m[1] - top_conf) <= 0.001]
        if len(top_matches) == 1:
            s = top_matches[0][0]
            return {
                "found": True,
                "student": {
                    "id": s.id,
                    "student_code": s.student_code,
                    "full_name": s.full_name,
                    "arabic_name": s.arabic_name,
                    "email": s.email,
                    "phone": s.phone,
                    "role": s.role,
                    "status": s.status,
                    "university": s.university,
                    "team_id": s.team_id
                }
            }
        return {
            "found": False,
            "ambiguous": True,
            "matches": [
                {"id": s.id, "name": s.full_name, "arabic_name": s.arabic_name, "student_code": s.student_code}
                for s, _ in top_matches
            ],
            "message": f"Multiple students found matching '{raw_query}'."
        }

    # 4. Fallback SQL ILIKE substring search (safety net for partial codes or IDs)
    res = await db.execute(
        select(Student).where(
            (Student.id.ilike(f"%{escaped}%")) |
            (Student.student_code.ilike(f"%{escaped}%")) |
            (Student.email.ilike(f"%{escaped}%")) |
            (Student.full_name.ilike(f"%{escaped}%")) |
            (Student.arabic_name.ilike(f"%{escaped}%"))
        )
    )
    like_students = [s for s in res.scalars().all() if is_scoped(s)]
    if len(like_students) == 1:
        s = like_students[0]
        return {
            "found": True,
            "student": {
                "id": s.id,
                "student_code": s.student_code,
                "full_name": s.full_name,
                "arabic_name": s.arabic_name,
                "email": s.email,
                "phone": s.phone,
                "role": s.role,
                "status": s.status,
                "university": s.university,
                "team_id": s.team_id
            }
        }
    elif len(like_students) > 1:
        return {
            "found": False,
            "ambiguous": True,
            "matches": [
                {"id": s.id, "name": s.full_name, "arabic_name": s.arabic_name, "student_code": s.student_code}
                for s in like_students
            ],
            "message": f"Multiple students found matching '{raw_query}'."
        }

    return {"found": False, "message": f"Student '{raw_query}' not found or outside your team scope."}


async def tool_search_students(db: AsyncSession, context: PermissionContext, query: str) -> dict:
    """Search active members across names, roles, and emails. Enforces team scope."""
    escaped = escape_like(query.strip())
    q = f"%{escaped}%"
    
    q_obj = select(Student).where(
        (Student.full_name.ilike(q)) |
        (Student.arabic_name.ilike(q)) |
        (Student.email.ilike(q)) |
        (Student.role.ilike(q))
    )
    
    if not context.is_admin_override:
        if not context.team_id:
            return {"count": 0, "students": [], "message": "Unauthorized: Missing team scope."}
        q_obj = q_obj.where(Student.team_id == context.team_id)
        
    res = await db.execute(q_obj)
    students = res.scalars().all()
    return {
        "count": len(students),
        "students": [
            {"id": s.id, "name": s.full_name, "arabic_name": s.arabic_name, "role": s.role, "email": s.email, "phone": s.phone}
            for s in students
        ]
    }


async def tool_list_students(db: AsyncSession, context: PermissionContext, role: Optional[str] = None, status: Optional[str] = None) -> dict:
    """List students with optional role or status filters. Enforces team scope."""
    query = select(Student)
    
    if not context.is_admin_override:
        if not context.team_id:
            return {"count": 0, "students": [], "message": "Unauthorized: Missing team scope."}
        query = query.where(Student.team_id == context.team_id)
        
    if role:
        escaped_role = escape_like(role.strip())
        query = query.where(Student.role.ilike(f"%{escaped_role}%"))
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


async def tool_get_student_contacts(db: AsyncSession, context: PermissionContext, student_ids: list[str]) -> dict:
    """Retrieve private contact information (phone, email) for specific students. Enforces team scope."""
    q = select(Student).where(Student.id.in_(student_ids))
    
    if not context.is_admin_override:
        if not context.team_id:
            return {"contacts": [], "message": "Unauthorized: Missing team scope."}
        q = q.where(Student.team_id == context.team_id)
        
    res = await db.execute(q)
    students = res.scalars().all()
    return {
        "contacts": [
            {"id": s.id, "name": s.full_name, "phone": s.phone, "email": s.email}
            for s in students
        ]
    }


async def tool_get_upcoming_meetings(db: AsyncSession, context: PermissionContext, limit: int = 5) -> dict:
    """Retrieve upcoming meetings. Enforces team scope."""
    now = datetime.now(timezone.utc)
    q = select(Meeting).where(Meeting.start_time >= now).order_by(Meeting.start_time.asc()).limit(limit)
    
    if not context.is_admin_override:
        if not context.team_id:
            return {"count": 0, "meetings": [], "message": "Unauthorized: Missing team scope."}
        q = q.where(Meeting.team_id == context.team_id)
        
    res = await db.execute(q)
    meetings = res.scalars().all()
    return {
        "count": len(meetings),
        "meetings": [
            {
                "id": m.id,
                "code": m.meeting_code,
                "title": m.title,
                "start_time": m.start_time.isoformat(),
                "duration_minutes": m.duration_minutes,
                "location": m.location,
                "meet_url": m.meet_url
            }
            for m in meetings
        ]
    }


async def tool_get_meeting(db: AsyncSession, context: PermissionContext, meeting_id: str) -> dict:
    """Retrieve metadata and status for a meeting. Enforces context team_id."""
    query = select(Meeting).where((Meeting.id == meeting_id) | (Meeting.meeting_code == meeting_id))
    
    if not context.is_admin_override:
        if not context.team_id:
            return {"found": False, "message": "Unauthorized: Missing team scope."}
        query = query.where(Meeting.team_id == context.team_id)
        
    res = await db.execute(query)
    meeting = res.scalar_one_or_none()
    if not meeting:
        return {"found": False, "message": f"Meeting '{meeting_id}' not found or outside team scope."}
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


async def tool_get_meeting_attendance(db: AsyncSession, context: PermissionContext, meeting_id: Optional[str] = None) -> dict:
    """
    Retrieve or compute deterministic attendance for a meeting.
    Defaults to the latest relevant meeting. Enforces context team_id.
    """
    if not meeting_id or meeting_id in ("today", "latest"):
        meeting_query = select(Meeting).order_by(Meeting.start_time.desc())
        if not context.is_admin_override:
            if not context.team_id:
                return {"success": False, "message": "Unauthorized: Missing team scope."}
            meeting_query = meeting_query.where(Meeting.team_id == context.team_id)
        meeting_res = await db.execute(meeting_query)
        meetings = list(meeting_res.scalars().all())
        if not meetings:
            return {"success": False, "message": "No relevant meeting found."}
        now = datetime.now(timezone.utc)
        current = [
            m for m in meetings
            if as_utc(m.start_time) <= now
        ]
        meeting_id = (current or list(reversed(meetings)))[0].id

    # Find meeting
    res = await db.execute(
        select(Meeting).where((Meeting.id == meeting_id) | (Meeting.meeting_code == meeting_id))
    )
    meeting = res.scalar_one_or_none()
    if not meeting:
        return {"success": False, "message": f"Meeting '{meeting_id}' not found."}

    target_team_id = None if context.is_admin_override else context.team_id

    # Fetch attendance records
    att_res = await db.execute(
        select(AttendanceRecord, Student)
        .join(Student, AttendanceRecord.student_id == Student.id)
        .where(AttendanceRecord.meeting_id == meeting.id)
    )
    records = att_res.all()

    present = []
    late = []
    absent = []

    for att, std in records:
        if target_team_id and std.team_id != target_team_id:
            continue
            
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

    total = len(present) + len(late) + len(absent)
    rate = round(((len(present) + len(late)) / total * 100), 2) if total > 0 else 100.0

    return {
        "success": True,
        "meeting": {
            "id": meeting.id,
            "title": meeting.title,
            "date": meeting.start_time.strftime("%Y-%m-%d %H:%M UTC")
        },
        "summary": {
            "total_expected": total,
            "present_count": len(present),
            "late_count": len(late),
            "absent_count": len(absent),
            "attendance_rate": rate
        },
        "present_students": present,
        "late_students": late,
        "absent_students": absent
    }


async def tool_get_student_attendance(db: AsyncSession, context: PermissionContext, student_id: str) -> dict:
    """Retrieve full attendance history for a single student. Enforces context team scope."""
    if not context.is_admin_override:
        if not context.team_id:
            return {"student_id": student_id, "history": [], "message": "Unauthorized: Missing team scope."}
        # verify student belongs to team
        std_res = await db.execute(select(Student.id).where(Student.id == student_id, Student.team_id == context.team_id))
        if not std_res.scalar_one_or_none():
            return {"student_id": student_id, "history": [], "message": "Unauthorized: Student outside team scope."}
            
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


async def tool_get_upcoming_events(db: AsyncSession, context: PermissionContext, limit: int = 10) -> dict:
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


async def tool_get_tasks(db: AsyncSession, context: PermissionContext) -> dict:
    """List all tasks and deadlines. Enforces context team_id."""
    query = select(Task).order_by(Task.task_number.asc())
    if not context.is_admin_override:
        if not context.team_id:
            return {"count": 0, "tasks": [], "message": "Unauthorized: Missing team scope."}
        query = query.where(Task.team_id == context.team_id)
        
    res = await db.execute(query)
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


async def tool_get_pending_submissions(db: AsyncSession, context: PermissionContext, task_id: Optional[str] = None) -> dict:
    """List students who have pending/unsubmitted tasks. Enforces context team scope."""
    query = select(Submission, Student, Task).join(Student, Submission.student_id == Student.id).join(Task, Submission.task_id == Task.id)
    if task_id:
        query = query.where(Submission.task_id == task_id)
        
    if not context.is_admin_override:
        if not context.team_id:
            return {"pending_count": 0, "pending_submissions": [], "message": "Unauthorized: Missing team scope."}
        query = query.where(Student.team_id == context.team_id)
        
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
                "task_id": t.id,
                "task_title": t.title,
                "deadline": t.deadline.isoformat(),
                "status": sub.status
            }
            for sub, s, t in records
        ]
    }


async def tool_get_student_score(
    db: AsyncSession,
    context: Any = None,
    student_id_or_name: Optional[str] = None,
    **kwargs
) -> dict:
    """Retrieve 8.xlsx scoring summary for a student."""
    if isinstance(context, str) and student_id_or_name is None:
        real_query = context
        real_context = kwargs.get("context")
    elif isinstance(context, PermissionContext):
        real_context = context
        real_query = student_id_or_name or kwargs.get("student_id_or_name", "")
    else:
        real_context = kwargs.get("context")
        real_query = student_id_or_name or (context if isinstance(context, str) else "") or kwargs.get("student_id_or_name", "")

    # Find student ID first
    s_lookup = await tool_get_student(db, context=real_context, student_id_or_name=real_query)
    if not s_lookup.get("found"):
        if s_lookup.get("ambiguous"):
            return {
                "found": False,
                "ambiguous": True,
                "matches": s_lookup.get("matches", []),
                "message": s_lookup.get("message", f"Multiple students found matching '{real_query}'.")
            }
        return {"found": False, "message": s_lookup.get("message", f"Student '{real_query}' not found or outside your team scope.")}
    
    student_id = s_lookup["student"]["id"]
    summary = await ScoringService.get_student_score_summary(student_id, db)
    if not summary:
        return {"found": False, "message": "No score summary available."}
    return {
        "found": True,
        "score_summary": summary.model_dump()
    }


async def tool_get_scores(db: AsyncSession, context: PermissionContext) -> dict:
    """Retrieve evaluation scoreboard for all members. Enforces context team scope."""
    summaries = await ScoringService.get_all_summaries(db)
    
    if not context.is_admin_override:
        if not context.team_id:
            return {"total_members": 0, "scoreboard": [], "message": "Unauthorized: Missing team scope."}
        team_std_res = await db.execute(select(Student.id).where(Student.team_id == context.team_id))
        team_ids = set(team_std_res.scalars().all())
        summaries = [s for s in summaries if s.student_id in team_ids]
        
    return {
        "total_members": len(summaries),
        "scoreboard": [s.model_dump() for s in summaries]
    }


async def tool_prepare_reminder(db: AsyncSession, context: PermissionContext,
    student_ids: list[str],
    event_id: Optional[str] = None,
    custom_message: Optional[str] = None
) -> dict:
    """
    Drafts a reminder message for specified students without sending.
    Enforces context team scope.
    """
    query = select(Student).where(Student.id.in_(student_ids))
    if not context.is_admin_override:
        if not context.team_id:
            return {"success": False, "message": "Unauthorized: Missing team scope."}
        query = query.where(Student.team_id == context.team_id)
        
    res = await db.execute(query)
    students = res.scalars().all()
    if not students:
        return {"success": False, "message": "No valid students found for reminder."}

    # Fetch event
    event = None
    if event_id:
        evt_res = await db.execute(
            select(Meeting).where((Meeting.id == event_id) | (Meeting.meeting_code == event_id))
        )
        event = evt_res.scalar_one_or_none()
        
    # Generate generic draft
    msg = custom_message if custom_message else "This is an automated reminder regarding your upcoming tasks or meetings. Please check your dashboard."
    
    return {
        "success": True,
        "target_count": len(students),
        "event": {"id": event.id, "title": event.title} if event else None,
        "message_preview": msg,
        "student_ids_verified": [s.id for s in students]
    }

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


async def tool_send_reminder(db: AsyncSession, context: PermissionContext,
    student_ids: list[str],
    event_id: Optional[str] = None,
    custom_message: Optional[str] = None,
    channel: str = "WHATSAPP",
    is_confirmed: bool = False
) -> dict:
    """
    Sends reminders to students.
    EXTERNAL ACTION: Requires confirmation before sending. Enforces context team scope.
    """
    if not context.is_confirmed_action:
        # Intercept and demand confirmation
        prep = await tool_prepare_reminder(db, context, student_ids, event_id, custom_message)
        if not prep.get("success"):
            return prep
        return {
            "status": "REQUIRES_CONFIRMATION",
            "message": f"Confirmation required before sending reminders to {prep['target_count']} recipient(s).",
            "preview_data": prep
        }

    # Fetch students
    query = select(Student).where(Student.id.in_(student_ids))
    if not context.is_admin_override:
        if not context.team_id:
            return {"success": False, "message": "Unauthorized: Missing team scope."}
        query = query.where(Student.team_id == context.team_id)
        
    res = await db.execute(query)
    students = res.scalars().all()
    if not students:
        return {"success": False, "message": "No students found in allowed scope."}

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
        "description": "Retrieves the deterministic attendance record for a meeting.",
        "category": ToolCategory.READ_ONLY,
        "required_roles": ["region_hr_head", "hr_admin", "committee_head", "committee_hr_leader", "committee_hr_member", "team_lead"],
        "parameters": {
            "type": "object",
            "properties": {
                "meeting_id": {"type": "string"}
            }
        }
    },
    {
        "name": "get_upcoming_meetings",
        "description": "Retrieves upcoming Google Meet / Calendar meetings.",
        "category": ToolCategory.READ_ONLY,
        "required_roles": ["region_hr_head", "hr_admin", "committee_head", "committee_hr_leader", "committee_hr_member", "team_lead", "committee_member", "member"],
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer"}
            }
        }
    },
    {
        "name": "get_student_contacts",
        "description": "Retrieves verified contact channels (phone, email) for specific student IDs.",
        "category": ToolCategory.READ_ONLY,
        "required_roles": ["region_hr_head", "hr_admin", "committee_head", "committee_hr_leader", "team_lead"],
        "parameters": {
            "type": "object",
            "properties": {
                "student_ids": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["student_ids"]
        }
    },
    {
        "name": "prepare_reminder",
        "description": "Drafts a reminder message for specified students.",
        "category": ToolCategory.READ_ONLY,
        "required_roles": ["region_hr_head", "hr_admin", "committee_head", "committee_hr_leader", "team_lead"],
        "parameters": {
            "type": "object",
            "properties": {
                "student_ids": {"type": "array", "items": {"type": "string"}},
                "event_id": {"type": "string"},
                "custom_message": {"type": "string"}
            },
            "required": ["student_ids"]
        }
    },
    {
        "name": "send_reminder",
        "description": "Dispatches prepared reminders via official WhatsApp API.",
        "category": ToolCategory.EXTERNAL_ACTION,
        "required_roles": ["region_hr_head", "hr_admin", "committee_head", "committee_hr_leader"],
        "parameters": {
            "type": "object",
            "properties": {
                "student_ids": {"type": "array", "items": {"type": "string"}},
                "event_id": {"type": "string"},
                "custom_message": {"type": "string"},
                "is_confirmed": {"type": "boolean"}
            },
            "required": ["student_ids", "is_confirmed"]
        }
    },
    {
        "name": "get_student_score",
        "description": "Retrieves the detailed performance scorecard for a member.",
        "category": ToolCategory.READ_ONLY,
        "required_roles": ["region_hr_head", "hr_admin", "committee_head", "committee_hr_leader", "committee_hr_member", "team_lead", "committee_member", "member"],
        "parameters": {
            "type": "object",
            "properties": {
                "student_id_or_name": {"type": "string"}
            },
            "required": ["student_id_or_name"]
        }
    },
    {
        "name": "get_scores",
        "description": "Retrieves the scoreboard for multiple members.",
        "category": ToolCategory.READ_ONLY,
        "required_roles": ["region_hr_head", "hr_admin", "committee_head", "committee_hr_leader", "team_lead"],
        "parameters": {
            "type": "object",
            "properties": {
            }
        }
    },
    {
        "name": "get_pending_submissions",
        "description": "Lists students with pending task submissions.",
        "category": ToolCategory.READ_ONLY,
        "required_roles": ["region_hr_head", "hr_admin", "committee_head", "committee_hr_leader", "team_lead"],
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"}
            }
        }
    },
    {
        "name": "search_students",
        "description": "Search active members.",
        "category": ToolCategory.READ_ONLY,
        "required_roles": ["region_hr_head", "hr_admin", "committee_head", "committee_hr_leader", "team_lead"],
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_student",
        "description": "Retrieve full student profile.",
        "category": ToolCategory.READ_ONLY,
        "required_roles": ["region_hr_head", "hr_admin", "committee_head", "committee_hr_leader", "team_lead"],
        "parameters": {
            "type": "object",
            "properties": {
                "student_id_or_name": {"type": "string"}
            },
            "required": ["student_id_or_name"]
        }
    },
    {
        "name": "list_students",
        "description": "List students.",
        "category": ToolCategory.READ_ONLY,
        "required_roles": ["region_hr_head", "hr_admin", "committee_head", "committee_hr_leader", "team_lead"],
        "parameters": {
            "type": "object",
            "properties": {
                "role": {"type": "string"},
                "status": {"type": "string"}
            }
        }
    },
    {
        "name": "get_upcoming_events",
        "description": "Retrieve upcoming calendar events.",
        "category": ToolCategory.READ_ONLY,
        "required_roles": ["region_hr_head", "hr_admin", "committee_head", "committee_hr_leader", "committee_hr_member", "team_lead", "committee_member", "member"],
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer"}
            }
        }
    },
    {
        "name": "get_tasks",
        "description": "List all tasks.",
        "category": ToolCategory.READ_ONLY,
        "required_roles": ["region_hr_head", "hr_admin", "committee_head", "committee_hr_leader", "committee_hr_member", "team_lead", "committee_member", "member"],
        "parameters": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_student_attendance",
        "description": "Retrieve student attendance.",
        "category": ToolCategory.READ_ONLY,
        "required_roles": ["region_hr_head", "hr_admin", "committee_head", "committee_hr_leader", "committee_hr_member", "team_lead", "committee_member", "member"],
        "parameters": {
            "type": "object",
            "properties": {
                "student_id": {"type": "string"}
            },
            "required": ["student_id"]
        }
    }
]



TOOL_REGISTRY = {
    'get_student': tool_get_student,
    'search_students': tool_search_students,
    'list_students': tool_list_students,
    'get_student_contacts': tool_get_student_contacts,
    'get_upcoming_meetings': tool_get_upcoming_meetings,
    'get_meeting': tool_get_meeting,
    'get_meeting_attendance': tool_get_meeting_attendance,
    'get_student_attendance': tool_get_student_attendance,
    'get_upcoming_events': tool_get_upcoming_events,
    'get_tasks': tool_get_tasks,
    'get_pending_submissions': tool_get_pending_submissions,
    'get_student_score': tool_get_student_score,
    'get_scores': tool_get_scores,
    'prepare_reminder': tool_prepare_reminder,
    'send_reminder': tool_send_reminder,
}
