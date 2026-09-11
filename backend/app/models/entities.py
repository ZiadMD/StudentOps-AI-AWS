"""
SQLAlchemy ORM Entities for StudentOps AI.
"""
from datetime import datetime, timezone
import json
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Enum as SQLEnum,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
import enum
from app.core.database import Base


class UserRole(str, enum.Enum):
    REGION_HR_HEAD = "region_hr_head"
    COMMITTEE_HR_LEADER = "committee_hr_leader"
    COMMITTEE_HEAD = "committee_head"
    COMMITTEE_HR_MEMBER = "committee_hr_member"
    COMMITTEE_MEMBER = "committee_member"

    # Backward compatibility aliases
    HR_ADMIN = "hr_admin"
    TEAM_LEAD = "team_lead"
    MEMBER = "member"


def utcnow():
    return datetime.now(timezone.utc)


class Team(Base):
    __tablename__ = "teams"

    id = Column(String(36), primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    code = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=utcnow)

    # Relationships
    members = relationship("User", back_populates="team")
    students = relationship("Student", back_populates="team")


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    arabic_name = Column(String(100), nullable=True)
    role = Column(String(50), default="member")  # "hr_admin", "team_lead", "member"
    team_id = Column(String(36), ForeignKey("teams.id"), nullable=True, index=True)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=True, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    # Relationships
    team = relationship("Team", back_populates="members")
    student = relationship("Student", foreign_keys=[student_id])


class Student(Base):
    __tablename__ = "students"

    id = Column(String(36), primary_key=True, index=True)
    student_code = Column(String(20), unique=True, index=True)
    full_name = Column(String(100), nullable=False)
    arabic_name = Column(String(100), nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    phone = Column(String(30), nullable=False)
    university = Column(String(100), default="Faculty of Engineering")
    role = Column(String(50), default="Member")  # "Member", "Head", "Vice Head", "Lead"
    status = Column(String(20), default="ACTIVE")  # "ACTIVE", "INACTIVE", "PROBATION"
    team_id = Column(String(36), ForeignKey("teams.id"), nullable=True, index=True)
    assigned_hr_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    # Relationships
    team = relationship("Team", back_populates="students")
    assigned_hr = relationship("User", foreign_keys=[assigned_hr_id])
    attendance_records = relationship("AttendanceRecord", back_populates="student", cascade="all, delete-orphan")
    submissions = relationship("Submission", back_populates="student", cascade="all, delete-orphan")
    scores = relationship("ScoreRecord", back_populates="student", cascade="all, delete-orphan")
    whatsapp_messages = relationship("WhatsAppChatMessage", back_populates="student", cascade="all, delete-orphan")
    invitations = relationship("StudentInvitation", back_populates="student", cascade="all, delete-orphan")


class StudentInvitation(Base):
    __tablename__ = "student_invitations"

    id = Column(String(36), primary_key=True, index=True)
    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    created_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_used = Column(Boolean, default=False, nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    used_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    # Relationships
    student = relationship("Student", back_populates="invitations")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    used_by = relationship("User", foreign_keys=[used_by_user_id])


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String(36), primary_key=True, index=True)
    meeting_code = Column(String(50), unique=True, index=True)
    title = Column(String(150), nullable=False)
    topic = Column(String(200), default="")
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    duration_minutes = Column(Integer, default=60)
    meet_url = Column(String(255), default="https://meet.google.com/abc-defg-hij")
    status = Column(String(20), default="COMPLETED")  # "SCHEDULED", "LIVE", "COMPLETED"
    session_number = Column(Integer, default=1)
    responsible_user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(String(36), ForeignKey("teams.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    # Relationships
    responsible_user = relationship("User", foreign_keys=[responsible_user_id])
    team = relationship("Team", foreign_keys=[team_id])
    sessions = relationship("ParticipantSession", back_populates="meeting", cascade="all, delete-orphan")
    attendance_records = relationship("AttendanceRecord", back_populates="meeting", cascade="all, delete-orphan")
    assignments = relationship("MeetingAssignment", back_populates="meeting", cascade="all, delete-orphan")


class ParticipantSession(Base):
    """Raw participant session imported directly from Google Meet Conference logs."""
    __tablename__ = "participant_sessions"

    id = Column(String(36), primary_key=True, index=True)
    meeting_id = Column(String(36), ForeignKey("meetings.id"), nullable=False, index=True)
    raw_display_name = Column(String(100), nullable=False)
    raw_email = Column(String(100), default="")
    join_time = Column(DateTime(timezone=True), nullable=False)
    leave_time = Column(DateTime(timezone=True), nullable=False)
    duration_seconds = Column(Integer, default=0)
    matched_student_id = Column(String(36), ForeignKey("students.id"), nullable=True)

    meeting = relationship("Meeting", back_populates="sessions")


class AttendanceRecord(Base):
    """Deterministic processed attendance record according to HR policies."""
    __tablename__ = "attendance_records"

    id = Column(String(36), primary_key=True, index=True)
    meeting_id = Column(String(36), ForeignKey("meetings.id"), nullable=False, index=True)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=False, index=True)
    status = Column(String(30), nullable=False)  # "PRESENT", "LATE", "EXCUSED_ACCEPTED", "EXCUSED_MODERATE", "EXCUSED_REJECTED", "UNEXCUSED_ABSENT"
    match_confidence = Column(Float, default=1.0)
    first_join = Column(DateTime(timezone=True), nullable=True)
    last_leave = Column(DateTime(timezone=True), nullable=True)
    total_duration_minutes = Column(Float, default=0.0)
    excuse_reason = Column(Text, nullable=True)
    excuse_status = Column(String(30), nullable=True)
    policy_version = Column(String(20), default="v1.0")
    recorded_at = Column(DateTime(timezone=True), default=utcnow)

    meeting = relationship("Meeting", back_populates="attendance_records")
    student = relationship("Student", back_populates="attendance_records")


class Event(Base):
    __tablename__ = "events"

    id = Column(String(36), primary_key=True, index=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, default="")
    event_type = Column(String(30), default="MEETING")  # "MEETING", "DEADLINE", "CAMP", "WORKSHOP"
    start_time = Column(DateTime(timezone=True), nullable=False, index=True)
    end_time = Column(DateTime(timezone=True), nullable=False)
    location = Column(String(100), default="Google Meet")
    meet_url = Column(String(255), default="")
    is_mandatory = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String(36), primary_key=True, index=True)
    task_number = Column(Integer, unique=True, index=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, default="")
    deadline = Column(DateTime(timezone=True), nullable=False, index=True)
    max_score = Column(Float, default=10.0)
    score_rule = Column(String(100), default="Out of 10 points based on quality and punctuality")
    created_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    team_id = Column(String(36), ForeignKey("teams.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    submissions = relationship("Submission", back_populates="task", cascade="all, delete-orphan")
    assignments = relationship("TaskAssignment", back_populates="task", cascade="all, delete-orphan")


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(String(36), primary_key=True, index=True)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=False, index=True)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=False, index=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), default="PENDING")  # "ON_TIME", "LATE", "PENDING", "MISSED"
    score = Column(Float, nullable=True)  # 0.0 - 10.0
    technical_score = Column(Float, nullable=True)
    file_url = Column(String(255), default="")
    reviewer_notes = Column(Text, default="")
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    graded_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)

    task = relationship("Task", back_populates="submissions")
    student = relationship("Student", back_populates="submissions")
    graded_by = relationship("User", foreign_keys=[graded_by_user_id])


class ScoreRecord(Base):
    """Behavior and overall engagement scores according to 8.xlsx standards."""
    __tablename__ = "score_records"

    __table_args__ = (
        UniqueConstraint("student_id", "category", "month", name="uq_score_records_student_category_month"),
    )

    id = Column(String(36), primary_key=True, index=True)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=False, index=True)
    category = Column(String(50), nullable=False)  # "GROUP_INTERACTION", "SOCIAL_MEDIA", "HIERARCHY_RULES", "POLITE_CONDUCT", "TASK_AVERAGE"
    points = Column(Float, nullable=False)
    max_points = Column(Float, nullable=False)
    month = Column(String(7), nullable=True, index=True)  # "YYYY-MM"
    graded_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    notes = Column(String(255), default="")
    updated_by = Column(String(50), default="SYSTEM")
    created_at = Column(DateTime(timezone=True), default=utcnow)

    student = relationship("Student", back_populates="scores")
    graded_by = relationship("User", foreign_keys=[graded_by_user_id])


class ReminderLog(Base):
    __tablename__ = "reminder_logs"

    id = Column(String(36), primary_key=True, index=True)
    recipient_id = Column(String(36), ForeignKey("students.id"), nullable=True)
    recipient_name = Column(String(100), nullable=False)
    recipient_phone = Column(String(30), nullable=False)
    channel = Column(String(20), default="WHATSAPP")  # "WHATSAPP", "SMS", "EMAIL"
    message_content = Column(Text, nullable=False)
    status = Column(String(20), default="SENT")  # "PENDING", "SENT", "FAILED"
    sent_at = Column(DateTime(timezone=True), default=utcnow)
    trigger_source = Column(String(50), default="AI_AGENT")  # "AI_AGENT", "EVENTBRIDGE", "MANUAL"


class AgentActionAudit(Base):
    """Immutable audit trail for Agent actions and tool invocations."""
    __tablename__ = "agent_action_audits"

    id = Column(String(36), primary_key=True, index=True)
    action_id = Column(String(50), unique=True, index=True)
    user_id = Column(String(50), default="hr_lead")
    intent = Column(String(100), nullable=False)
    tool_name = Column(String(100), nullable=False, index=True)
    parameters = Column(Text, default="{}")
    result = Column(Text, default="{}")
    requires_confirmation = Column(Boolean, default=False)
    confirmed = Column(Boolean, default=True)
    status = Column(String(30), default="EXECUTED")  # "PENDING_CONFIRMATION", "EXECUTED", "REJECTED", "FAILED"
    timestamp = Column(DateTime(timezone=True), default=utcnow)


class MemberFollowupStatus(Base):
    """Track 3-day SLA escalation for committee members."""
    __tablename__ = "member_followup_statuses"

    id = Column(String(36), primary_key=True, index=True)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=False, index=True)
    hr_member_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    flagged_reason = Column(String(100), nullable=False)  # e.g. "OVERDUE_TASK", "ABSENTEEISM", "LOW_BEHAVIOR"
    flagged_at = Column(DateTime(timezone=True), default=utcnow)
    last_contacted_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(30), default="PENDING")  # "PENDING", "CONTACTED", "RESOLVED", "ESCALATED"
    is_escalated = Column(Boolean, default=False)
    notes = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=utcnow)

    student = relationship("Student", foreign_keys=[student_id])
    hr_member = relationship("User", foreign_keys=[hr_member_id])


class TaskReminder(Base):
    """Tracks automated Stage-1 WhatsApp reminders sent via official org OpenWA number."""
    __tablename__ = "task_reminders"

    id = Column(String(36), primary_key=True, index=True)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=False, index=True)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=False, index=True)
    channel = Column(String(20), default="WHATSAPP_OFFICIAL")
    stage = Column(Integer, default=1)  # 1: Official automated, 2: HR personal follow-up
    status = Column(String(20), default="SENT")  # "SENT", "DELIVERED", "FAILED"
    message_text = Column(Text, nullable=False)
    sent_at = Column(DateTime(timezone=True), default=utcnow)

    task = relationship("Task")
    student = relationship("Student")


class WhatsAppChatMessage(Base):
    """Stores incoming and outgoing WhatsApp messages for individual HR-to-student conversations."""
    __tablename__ = "whatsapp_chat_messages"

    id = Column(String(36), primary_key=True, index=True)
    openwa_message_id = Column(String(100), index=True, nullable=True)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=False, index=True)
    assigned_hr_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    sender_type = Column(String(20), nullable=False)  # "HR", "STUDENT", "SYSTEM"
    sender_id = Column(String(36), nullable=True)  # user_id if HR, student_id if student
    sender_phone = Column(String(30), nullable=False)
    recipient_phone = Column(String(30), nullable=False)
    message_type = Column(String(30), default="text")  # "text", "image", "video", "document", "audio", "reaction"
    content = Column(Text, nullable=False)
    media_url = Column(Text, nullable=True)
    media_filename = Column(String(255), nullable=True)
    media_mimetype = Column(String(100), nullable=True)
    status = Column(String(20), default="pending")  # "pending", "sent", "delivered", "read", "failed"
    ack_status = Column(Integer, default=0)  # 0: pending, 1: sent, 2: delivered, 3: read
    reply_to_message_id = Column(String(100), nullable=True)
    is_edited = Column(Boolean, default=False)
    reactions = Column(Text, default="[]")  # JSON-encoded array of {emoji: str, from: str, user_id: str}
    raw_payload = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)

    student = relationship("Student", back_populates="whatsapp_messages")
    assigned_hr = relationship("User", foreign_keys=[assigned_hr_id])


class MeetingAssignment(Base):
    """Explicit member assignment to meetings. Attendance reminders target assigned members."""
    __tablename__ = "meeting_assignments"

    id = Column(String(36), primary_key=True, index=True)
    meeting_id = Column(String(36), ForeignKey("meetings.id"), nullable=False, index=True)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=False, index=True)
    assigned_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("meeting_id", "student_id", name="uq_meeting_student_assignment"),
    )

    meeting = relationship("Meeting", back_populates="assignments")
    student = relationship("Student")

class TaskAssignment(Base):
    """Explicit member assignment to tasks. Tasks fail closed if no assignments exist."""
    __tablename__ = "task_assignments"

    id = Column(String(36), primary_key=True, index=True)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=False, index=True)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=False, index=True)
    assigned_at = Column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("task_id", "student_id", name="uq_task_student_assignment"),
    )

    task = relationship("Task", back_populates="assignments")
    student = relationship("Student")


class AutomationSettings(Base):
    """Per-HR automation configurations with inheritance and precedence rules."""
    __tablename__ = "automation_settings"

    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), unique=True, nullable=False, index=True)

    # Attendance automation
    attendance_enabled = Column(Boolean, default=True)
    attendance_grace_minutes = Column(Integer, default=10)
    attendance_message = Column(Text, nullable=True)

    # Task pre-deadline reminder
    task_pre_enabled = Column(Boolean, default=True)
    task_pre_hours = Column(Integer, default=24)
    task_pre_message = Column(Text, nullable=True)

    # Task post-deadline escalation
    task_post_enabled = Column(Boolean, default=True)
    task_post_delay_hours = Column(Integer, default=2)
    task_post_message = Column(Text, nullable=True)

    # Channels
    whatsapp_enabled = Column(Boolean, default=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User")


class MemberFeedback(Base):
    """Member feedback for HR members flowing upward to HR Leader."""
    __tablename__ = "member_feedbacks"

    id = Column(String(36), primary_key=True, index=True)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=False, index=True)
    hr_member_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    hr_member_name = Column(String(100), nullable=True)
    category = Column(String(50), default="HR_INTERACTION")  # "HR_INTERACTION", "COMMUNICATION", "ATTENDANCE_SUPPORT", "BEHAVIOR_EVALUATION", "CONDUCT"
    content = Column(Text, nullable=False)
    submitted_at = Column(DateTime(timezone=True), default=utcnow)
    reviewed_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), default="SUBMITTED")  # "SUBMITTED", "REVIEWED", "ACTIONED"
    notes = Column(Text, default="")

    student = relationship("Student", foreign_keys=[student_id])
    hr_member = relationship("User", foreign_keys=[hr_member_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id])


class MemberQuestion(Base):
    """Questions asked by members and answered by the Social Media Committee Head."""
    __tablename__ = "member_questions"

    id = Column(String(36), primary_key=True, index=True)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=False, index=True)
    team_id = Column(String(36), ForeignKey("teams.id"), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    content = Column(Text, nullable=False)
    status = Column(String(20), default="OPEN")  # "OPEN", "ANSWERED"
    asked_at = Column(DateTime(timezone=True), default=utcnow)
    answered_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    answer = Column(Text, default="")
    answered_at = Column(DateTime(timezone=True), nullable=True)

    student = relationship("Student", foreign_keys=[student_id])
    team = relationship("Team", foreign_keys=[team_id])
    answered_by = relationship("User", foreign_keys=[answered_by_user_id])


class CommitteeReport(Base):
    """Formal performance report submitted upward by HR Leader to HR Region Head."""
    __tablename__ = "committee_reports"

    id = Column(String(36), primary_key=True, index=True)
    team_id = Column(String(36), ForeignKey("teams.id"), nullable=False, index=True)
    submitted_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    report_title = Column(String(150), nullable=False)
    metrics_summary = Column(Text, default="{}")  # JSON-encoded metrics summary
    notes = Column(Text, default="")
    submitted_at = Column(DateTime(timezone=True), default=utcnow)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)

    team = relationship("Team", foreign_keys=[team_id])
    submitted_by = relationship("User", foreign_keys=[submitted_by_user_id])
