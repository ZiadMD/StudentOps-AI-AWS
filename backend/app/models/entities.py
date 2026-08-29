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
)
from sqlalchemy.orm import relationship
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Team(Base):
    __tablename__ = "teams"

    id = Column(String(36), primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    code = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)

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
    created_at = Column(DateTime, default=utcnow)

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
    created_at = Column(DateTime, default=utcnow)

    # Relationships
    team = relationship("Team", back_populates="students")
    attendance_records = relationship("AttendanceRecord", back_populates="student", cascade="all, delete-orphan")
    submissions = relationship("Submission", back_populates="student", cascade="all, delete-orphan")
    scores = relationship("ScoreRecord", back_populates="student", cascade="all, delete-orphan")


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String(36), primary_key=True, index=True)
    meeting_code = Column(String(50), unique=True, index=True)
    title = Column(String(150), nullable=False)
    topic = Column(String(200), default="")
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    duration_minutes = Column(Integer, default=60)
    meet_url = Column(String(255), default="https://meet.google.com/abc-defg-hij")
    status = Column(String(20), default="COMPLETED")  # "SCHEDULED", "LIVE", "COMPLETED"
    created_at = Column(DateTime, default=utcnow)

    # Relationships
    sessions = relationship("ParticipantSession", back_populates="meeting", cascade="all, delete-orphan")
    attendance_records = relationship("AttendanceRecord", back_populates="meeting", cascade="all, delete-orphan")


class ParticipantSession(Base):
    """Raw participant session imported directly from Google Meet Conference logs."""
    __tablename__ = "participant_sessions"

    id = Column(String(36), primary_key=True, index=True)
    meeting_id = Column(String(36), ForeignKey("meetings.id"), nullable=False, index=True)
    raw_display_name = Column(String(100), nullable=False)
    raw_email = Column(String(100), default="")
    join_time = Column(DateTime, nullable=False)
    leave_time = Column(DateTime, nullable=False)
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
    first_join = Column(DateTime, nullable=True)
    last_leave = Column(DateTime, nullable=True)
    total_duration_minutes = Column(Float, default=0.0)
    excuse_reason = Column(Text, nullable=True)
    excuse_status = Column(String(30), nullable=True)
    policy_version = Column(String(20), default="v1.0")
    recorded_at = Column(DateTime, default=utcnow)

    meeting = relationship("Meeting", back_populates="attendance_records")
    student = relationship("Student", back_populates="attendance_records")


class Event(Base):
    __tablename__ = "events"

    id = Column(String(36), primary_key=True, index=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, default="")
    event_type = Column(String(30), default="MEETING")  # "MEETING", "DEADLINE", "CAMP", "WORKSHOP"
    start_time = Column(DateTime, nullable=False, index=True)
    end_time = Column(DateTime, nullable=False)
    location = Column(String(100), default="Google Meet")
    meet_url = Column(String(255), default="")
    is_mandatory = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String(36), primary_key=True, index=True)
    task_number = Column(Integer, unique=True, index=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, default="")
    deadline = Column(DateTime, nullable=False, index=True)
    max_score = Column(Float, default=10.0)
    score_rule = Column(String(100), default="Out of 10 points based on quality and punctuality")
    created_at = Column(DateTime, default=utcnow)

    submissions = relationship("Submission", back_populates="task", cascade="all, delete-orphan")


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(String(36), primary_key=True, index=True)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=False, index=True)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=False, index=True)
    submitted_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="PENDING")  # "ON_TIME", "LATE", "PENDING", "MISSED"
    score = Column(Float, nullable=True)  # 0.0 - 10.0
    file_url = Column(String(255), default="")
    reviewer_notes = Column(Text, default="")
    reviewed_at = Column(DateTime, nullable=True)

    task = relationship("Task", back_populates="submissions")
    student = relationship("Student", back_populates="submissions")


class ScoreRecord(Base):
    """Behavior and overall engagement scores according to 8.xlsx standards."""
    __tablename__ = "score_records"

    id = Column(String(36), primary_key=True, index=True)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=False, index=True)
    category = Column(String(50), nullable=False)  # "GROUP_INTERACTION", "SOCIAL_MEDIA", "HIERARCHY_RULES", "POLITE_CONDUCT", "TASK_AVERAGE"
    points = Column(Float, nullable=False)
    max_points = Column(Float, nullable=False)
    notes = Column(String(255), default="")
    updated_by = Column(String(50), default="SYSTEM")
    created_at = Column(DateTime, default=utcnow)

    student = relationship("Student", back_populates="scores")


class ReminderLog(Base):
    __tablename__ = "reminder_logs"

    id = Column(String(36), primary_key=True, index=True)
    recipient_id = Column(String(36), ForeignKey("students.id"), nullable=True)
    recipient_name = Column(String(100), nullable=False)
    recipient_phone = Column(String(30), nullable=False)
    channel = Column(String(20), default="WHATSAPP")  # "WHATSAPP", "SMS", "EMAIL"
    message_content = Column(Text, nullable=False)
    status = Column(String(20), default="SENT")  # "PENDING", "SENT", "FAILED"
    sent_at = Column(DateTime, default=utcnow)
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
    timestamp = Column(DateTime, default=utcnow)
