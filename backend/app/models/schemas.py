"""
Pydantic Schemas for API Requests, Responses, and Agent Tool payloads.
"""
from typing import Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field, EmailStr, ConfigDict


# =========================================================
# Student Schemas
# =========================================================

class StudentBase(BaseModel):
    student_code: str
    full_name: str
    arabic_name: str
    email: EmailStr
    phone: str
    university: str = "Faculty of Engineering"
    role: str = "Member"
    status: str = "ACTIVE"
    team_id: Optional[str] = None


class StudentCreate(StudentBase):
    pass


class StudentResponse(StudentBase):
    id: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class StudentScoreSummary(BaseModel):
    student_id: str
    student_name: str
    arabic_name: str
    on_time_attendance_count: int
    late_attendance_count: int
    absence_count: int
    excused_absence_count: int
    on_time_task_count: int
    late_task_count: int
    pending_task_count: int
    average_task_quality: float  # out of 10.0
    group_interaction_score: float  # /5
    social_media_score: float  # /5
    hierarchy_rules_score: float  # /5
    polite_conduct_score: float  # /8
    total_behavior_score: float  # /23
    overall_rating: str  # "Outstanding", "Good", "Needs Improvement"


# =========================================================
# Meeting & Attendance Schemas
# =========================================================

class ParticipantSessionSchema(BaseModel):
    id: str
    raw_display_name: str
    raw_email: Optional[str] = ""
    join_time: datetime
    leave_time: datetime
    duration_seconds: int
    matched_student_id: Optional[str] = None


class AttendanceRecordSchema(BaseModel):
    id: str
    student_id: str
    student_name: Optional[str] = None
    arabic_name: Optional[str] = None
    status: str  # "PRESENT", "LATE", "EXCUSED_ACCEPTED", "EXCUSED_MODERATE", "EXCUSED_REJECTED", "UNEXCUSED_ABSENT"
    match_confidence: float
    first_join: Optional[datetime] = None
    last_leave: Optional[datetime] = None
    total_duration_minutes: float
    excuse_reason: Optional[str] = None
    excuse_status: Optional[str] = None


class MeetingDetailResponse(BaseModel):
    id: str
    meeting_code: str
    title: str
    topic: str
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    meet_url: str
    status: str
    total_expected: int
    present_count: int
    late_count: int
    absent_count: int
    attendance: list[AttendanceRecordSchema] = []


# =========================================================
# Event & Calendar Schemas
# =========================================================

class EventSchema(BaseModel):
    id: str
    title: str
    description: Optional[str] = ""
    event_type: str
    start_time: datetime
    end_time: datetime
    location: str
    meet_url: Optional[str] = ""
    is_mandatory: bool = True


class EventCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    event_type: str = "MEETING"
    start_time: datetime
    end_time: datetime
    location: str = "Google Meet"
    meet_url: Optional[str] = ""
    is_mandatory: bool = True


# =========================================================
# Task & Submission Schemas
# =========================================================

class TaskSchema(BaseModel):
    id: str
    task_number: int
    title: str
    description: str
    deadline: datetime
    max_score: float
    score_rule: str
    submission_count: int = 0
    pending_count: int = 0


class SubmissionSchema(BaseModel):
    id: str
    task_id: str
    task_title: Optional[str] = None
    student_id: str
    student_name: Optional[str] = None
    submitted_at: Optional[datetime] = None
    status: str
    score: Optional[float] = None
    file_url: Optional[str] = None
    reviewer_notes: Optional[str] = None


# =========================================================
# Reminder & Action Schemas
# =========================================================

class ReminderRequest(BaseModel):
    student_ids: list[str]
    event_id: Optional[str] = None
    custom_message: Optional[str] = None
    channel: str = "WHATSAPP"


class ReminderResult(BaseModel):
    success: bool
    sent_count: int
    recipients: list[dict[str, Any]]
    message_preview: str
    channel: str


# =========================================================
# Agent Chat & Confirmation Schemas
# =========================================================

class AgentChatMessage(BaseModel):
    query: str
    conversation_id: Optional[str] = None
    user_role: str = "HR_LEAD"


class ToolCallExecution(BaseModel):
    tool_name: str
    parameters: dict[str, Any]
    result: Any
    status: str = "SUCCESS"  # "SUCCESS" | "FAILED" | "PENDING_CONFIRMATION"
    reasoning_summary: Optional[str] = None


class PendingConfirmation(BaseModel):
    action_id: str
    tool_name: str
    description: str
    target_count: int
    preview_data: dict[str, Any]


class AgentChatResponse(BaseModel):
    conversation_id: str
    response: str
    tool_executions: list[ToolCallExecution] = []
    requires_confirmation: bool = False
    pending_confirmation: Optional[PendingConfirmation] = None
    audit_id: Optional[str] = None


class ActionConfirmationRequest(BaseModel):
    action_id: str
    confirmed: bool
    user_id: str = "hr_lead"


# =========================================================
# Dashboard Summary
# =========================================================

class DashboardStats(BaseModel):
    total_students: int
    present_today: int
    late_today: int
    absent_today: int
    attendance_rate_today: float
    upcoming_meetings_count: int
    pending_submissions_count: int
    recent_actions_count: int


# =========================================================
# Team & Organization Schemas
# =========================================================

class TeamBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = ""


class TeamCreateRequest(TeamBase):
    pass


class TeamResponse(TeamBase):
    id: str
    created_at: datetime
    member_count: int = 0
    model_config = ConfigDict(from_attributes=True)


# =========================================================
# Authentication & User Schemas
# =========================================================

class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    full_name: str
    arabic_name: Optional[str] = None
    role: str = "member"  # "hr_admin", "team_lead", "member"
    team_id: Optional[str] = None


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    arabic_name: Optional[str] = None
    role: str
    team_id: Optional[str] = None
    team_name: Optional[str] = None
    student_id: Optional[str] = None
    is_active: bool = True
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str

