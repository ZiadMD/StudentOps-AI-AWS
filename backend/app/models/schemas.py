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
    assigned_hr_id: Optional[str] = None


class StudentCreate(BaseModel):
    student_code: Optional[str] = None
    full_name: str
    arabic_name: str
    email: EmailStr
    phone: str
    university: Optional[str] = "Faculty of Engineering"
    role: Optional[str] = "Member"
    status: Optional[str] = "ACTIVE"
    team_id: Optional[str] = None
    assigned_hr_id: Optional[str] = None


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
    average_task_quality: float  # out of 10.0 (graded by Committee Head)
    group_interaction_score: float  # /5 (graded by HR Member)
    social_media_score: float  # /5
    hierarchy_rules_score: float  # /5
    polite_conduct_score: float  # /8
    total_behavior_score: float  # /23 (graded by HR Member)
    bonus_points: float = 0.0  # awarded by HR Leader
    total_score: Optional[float] = None  # Kept separate without invented arithmetic weights
    total_score_status: str = "PENDING_FORMULA_DEFINITION"
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
    session_number: int = 1
    team_id: Optional[str] = None
    total_expected: int
    present_count: int
    late_count: int
    absent_count: int
    attendance: list[AttendanceRecordSchema] = []


class MeetingCreateRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=150)
    topic: Optional[str] = ""
    start_time: datetime
    duration_minutes: int = Field(default=60, ge=15, le=360)
    session_number: int = Field(default=1, ge=1)
    meet_url: Optional[str] = "https://meet.google.com/social-media-sync"
    assigned_student_ids: Optional[list[str]] = None
    team_id: Optional[str] = None


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
    max_score: Optional[float] = None
    score_rule: Optional[str] = None
    submission_count: int = 0
    pending_count: int = 0
    assigned_count: int = 0


class TaskCreateRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = ""
    deadline: datetime
    max_score: float = 10.0
    score_rule: Optional[str] = "Out of 10 points based on quality and punctuality"
    assigned_student_ids: list[str] = Field(default_factory=list)


class TaskAssignRequest(BaseModel):
    student_ids: list[str] = Field(..., min_length=1)


class AutomationSettingsSchema(BaseModel):
    attendance_enabled: bool = True
    attendance_grace_minutes: int = 10
    attendance_message: Optional[str] = None
    task_pre_enabled: bool = True
    task_pre_hours: int = 24
    task_pre_message: Optional[str] = None
    task_post_enabled: bool = True
    task_post_delay_hours: int = 2
    task_post_message: Optional[str] = None
    whatsapp_enabled: bool = True


class SubmissionSchema(BaseModel):
    id: str
    task_id: str
    task_title: Optional[str] = None
    student_id: str
    student_name: Optional[str] = None
    submitted_at: Optional[datetime] = None
    status: str
    score: Optional[float] = None
    technical_score: Optional[float] = None
    file_url: Optional[str] = None
    reviewer_notes: Optional[str] = None
    graded_by_user_id: Optional[str] = None


class TaskScoreItemSchema(BaseModel):
    """
    Score-only projection for HR score collection.
    Deliberately excludes file_url, proprietary deliverables, and submission content.
    """
    submission_id: str
    task_id: str
    task_title: Optional[str] = None
    student_id: str
    student_name: Optional[str] = None
    arabic_name: Optional[str] = None
    status: str
    score: Optional[float] = None
    technical_score: Optional[float] = None
    reviewer_notes: Optional[str] = None
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    graded_by_user_id: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class TaskSubmitRequest(BaseModel):
    file_url: str = Field(..., min_length=1, description="Deliverable or file URL for task submission")


class TechnicalScoreUpdate(BaseModel):
    score: float = Field(..., ge=0.0, description="Technical score evaluated against task max_score")
    reviewer_notes: Optional[str] = ""


class BehaviorScoreUpdate(BaseModel):
    student_id: str
    month: Optional[str] = None  # e.g. "2026-03"
    group_interaction: float = Field(..., ge=0.0, le=5.0)
    social_media: float = Field(..., ge=0.0, le=5.0)
    hierarchy_rules: float = Field(..., ge=0.0, le=5.0)
    polite_conduct: float = Field(..., ge=0.0, le=8.0)
    notes: Optional[str] = ""


class AssignCohortRequest(BaseModel):
    student_ids: list[str]
    hr_member_id: str


class StudentPhoneUpdate(BaseModel):
    phone: str = Field(..., min_length=7, max_length=25, description="International format e.g. +201012345678")


class WhatsAppDirectLinkResponse(BaseModel):
    phone: str
    student_id: str
    student_name: str
    encoded_url: str
    message_text: str


class OfficialWhatsAppStatus(BaseModel):
    configured: bool
    status: str  # "CONNECTED", "SCAN_QR_CODE", "AUTHENTICATING", "DISCONNECTED", "GATEWAY_UNAVAILABLE"
    phone_number: Optional[str] = None
    battery: Optional[int] = None
    qr_code: Optional[str] = None
    session_name: Optional[str] = None
    error: Optional[str] = None


class OfficialWhatsAppSendRequest(BaseModel):
    phone_number: str
    message: str


class WhatsAppMessageResponse(BaseModel):
    id: str
    openwa_message_id: Optional[str] = None
    student_id: str
    assigned_hr_id: Optional[str] = None
    sender_type: str  # "HR", "STUDENT", "SYSTEM"
    sender_id: Optional[str] = None
    sender_phone: str
    recipient_phone: str
    message_type: str = "text"
    content: str
    media_url: Optional[str] = None
    media_filename: Optional[str] = None
    media_mimetype: Optional[str] = None
    status: str = "pending"
    ack_status: int = 0
    reply_to_message_id: Optional[str] = None
    is_edited: bool = False
    reactions: list[dict[str, Any]] = []
    created_at: datetime
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class WhatsAppSendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1)
    reply_to_message_id: Optional[str] = None
    message_type: str = "text"
    media_url: Optional[str] = None
    media_filename: Optional[str] = None
    media_mimetype: Optional[str] = None


class WhatsAppReactionRequest(BaseModel):
    reaction: str = Field(..., min_length=1, max_length=10)


class WhatsAppEditMessageRequest(BaseModel):
    content: str = Field(..., min_length=1)


class WhatsAppThreadSummary(BaseModel):
    student_id: str
    student_code: str
    full_name: str
    arabic_name: str
    phone: str
    team_id: Optional[str] = None
    assigned_hr_id: Optional[str] = None
    assigned_hr_name: Optional[str] = None
    last_message: Optional[WhatsAppMessageResponse] = None
    unread_count: int = 0
    status: str = "ACTIVE"
    model_config = ConfigDict(from_attributes=True)


class OpenWAWebhookPayload(BaseModel):
    event: Optional[str] = None
    data: Optional[dict[str, Any]] = None
    sessionId: Optional[str] = None
    model_config = ConfigDict(extra="allow")


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
    query: str = Field(..., min_length=1, max_length=2000, description="Chat query for the AI agent")
    conversation_id: Optional[str] = Field(None, max_length=100)
    user_role: Optional[str] = "HR_LEAD"


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
    pending_submissions_count: Optional[int] = None
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
    password: str = Field(..., min_length=8, max_length=128, description="Password must be between 8 and 128 characters")
    full_name: str = Field(..., min_length=1, max_length=100)
    arabic_name: Optional[str] = Field(None, max_length=100)
    role: Optional[str] = Field("member", description="Ignored on public registration; always creates member accounts")
    team_id: Optional[str] = Field(None, max_length=50)
    invitation_token: Optional[str] = Field(None, description="Optional single-use invitation token to link an existing Student profile")


class StudentInvitationCreateRequest(BaseModel):
    expires_in_days: Optional[int] = Field(7, ge=1, le=30, description="Token expiration window in days")


class StudentInvitationResponse(BaseModel):
    id: str
    student_id: str
    token: Optional[str] = None
    expires_at: datetime
    is_used: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class StudentLinkRequest(BaseModel):
    invitation_token: str = Field(..., min_length=10, description="Single-use invitation token issued by HR/Admin")


class UserLoginRequest(BaseModel):
    email: Optional[str] = Field(None, description="Email address or username")
    username: Optional[str] = Field(None, description="Alternative identifier field (matches username or email)")
    identifier: Optional[str] = Field(None, description="Generic identifier field")
    password: str = Field(..., min_length=1, max_length=128)


class UserRoleUpdateRequest(BaseModel):
    role: str = Field(
        ...,
        pattern="^(region_hr_head|committee_hr_leader|committee_head|committee_hr_member|committee_member|hr_admin|team_lead|member)$",
        description="Role: 5-tier role or legacy alias"
    )


class UserAdminCreateRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=100)
    arabic_name: Optional[str] = Field(None, max_length=100)
    role: str = Field(
        "committee_member",
        pattern="^(region_hr_head|committee_hr_leader|committee_head|committee_hr_member|committee_member|hr_admin|team_lead|member)$"
    )
    team_id: Optional[str] = Field(None, max_length=50)


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
    refresh_token: str = Field(..., min_length=10, max_length=1000)


# =========================================================
# Social Media Committee Workflows (Bonus, Q&A, Feedback, Reports)
# =========================================================

class BonusAwardRequest(BaseModel):
    points: float = Field(..., ge=0.5, le=10.0, description="Bonus points to award (e.g. +2.0)")
    notes: Optional[str] = ""


class FeedbackCreateRequest(BaseModel):
    hr_member_id: Optional[str] = None
    hr_member_name: Optional[str] = None
    category: str = "HR_INTERACTION"  # "HR_INTERACTION", "COMMUNICATION", "ATTENDANCE_SUPPORT", "BEHAVIOR_EVALUATION", "CONDUCT", "GENERAL_HR"
    content: str = Field(..., min_length=3, max_length=2000)


class FeedbackResponse(BaseModel):
    id: str
    student_id: str
    student_name: Optional[str] = None
    hr_member_id: Optional[str] = None
    hr_member_name: Optional[str] = None
    category: str
    content: str
    submitted_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by_name: Optional[str] = None
    status: str
    notes: Optional[str] = ""


class FeedbackStatusUpdate(BaseModel):
    status: str = "REVIEWED"  # "REVIEWED", "ACTIONED"
    notes: Optional[str] = ""


class QuestionCreateRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=150)
    content: str = Field(..., min_length=3, max_length=2000)


class QuestionAnswerRequest(BaseModel):
    answer: str = Field(..., min_length=1, max_length=3000)


class QuestionResponse(BaseModel):
    id: str
    student_id: str
    student_name: Optional[str] = None
    title: str
    content: str
    status: str
    asked_at: datetime
    answered_by_name: Optional[str] = None
    answer: Optional[str] = ""
    answered_at: Optional[datetime] = None


class CommitteeReportCreateRequest(BaseModel):
    report_title: str = Field(..., min_length=3, max_length=150)
    notes: Optional[str] = ""


class CommitteeReportResponse(BaseModel):
    id: str
    team_id: str
    team_name: Optional[str] = None
    submitted_by_name: str
    report_title: str
    metrics_summary: dict[str, Any]
    notes: str
    submitted_at: datetime
    acknowledged_at: Optional[datetime] = None

