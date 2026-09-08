export type UserRole =
  | 'region_hr_head'
  | 'committee_hr_leader'
  | 'committee_head'
  | 'committee_hr_member'
  | 'committee_member'
  | 'hr_admin'
  | 'team_lead'
  | 'member';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  arabic_name?: string | null;
  role: UserRole;
  team_id?: string | null;
  team_name?: string | null;
  student_id?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserProfile;
}

export interface TeamItem {
  id: string;
  name: string;
  code: string;
  description: string;
  created_at: string;
  member_count: number;
}

export interface Student {
  id: string;
  student_code: string;
  full_name: string;
  arabic_name: string;
  email: string;
  phone: string;
  university: string;
  role: string;
  status: string;
  team_id?: string | null;
  assigned_hr_id?: string | null;
  created_at: string;
}

export interface StudentScoreSummary {
  student_id: string;
  student_name: string;
  arabic_name: string;
  on_time_attendance_count: number;
  late_attendance_count: number;
  absence_count: number;
  excused_absence_count: number;
  on_time_task_count: number;
  late_task_count: number;
  pending_task_count: number;
  average_task_quality: number;
  group_interaction_score: number;
  social_media_score: number;
  hierarchy_rules_score: number;
  polite_conduct_score: number;
  total_behavior_score: number;
  bonus_points: number;
  total_score?: number | null;
  total_score_status?: string;
  overall_rating: string;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  student_name?: string;
  arabic_name?: string;
  status: string;
  match_confidence: number;
  first_join?: string;
  last_leave?: string;
  total_duration_minutes: number;
  excuse_reason?: string;
  excuse_status?: string;
}

export interface MeetingDetail {
  id: string;
  meeting_code: string;
  title: string;
  topic: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  meet_url: string;
  status: string;
  session_number?: number | null;
  team_id?: string | null;
  total_expected: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  attendance: AttendanceRecord[];
}

export interface MemberFeedbackItem {
  id: string;
  student_id: string;
  student_name?: string;
  arabic_name?: string;
  hr_member_id?: string;
  hr_member_name?: string;
  category: string;
  content: string;
  status: 'SUBMITTED' | 'REVIEWED' | 'ACTIONED';
  notes?: string;
  reviewed_by_user_id?: string;
  reviewed_by_name?: string;
  submitted_at?: string;
  created_at?: string;
  reviewed_at?: string;
}

export interface MemberQuestionItem {
  id: string;
  student_id: string;
  student_name?: string;
  arabic_name?: string;
  team_id: string;
  title: string;
  content: string;
  status: 'OPEN' | 'ANSWERED';
  answer?: string;
  answered_by_user_id?: string;
  asked_at: string;
  answered_at?: string;
}

export interface CommitteeReportItem {
  id: string;
  team_id: string;
  submitted_by_user_id: string;
  submitted_by_name?: string;
  report_title: string;
  metrics_summary: string;
  notes?: string;
  submitted_at: string;
}

export interface EventItem {
  id: string;
  title: string;
  description?: string;
  event_type: string;
  start_time: string;
  end_time: string;
  location: string;
  meet_url?: string;
  is_mandatory: boolean;
}

export interface TaskItem {
  id: string;
  task_number: number;
  title: string;
  description: string;
  deadline: string;
  max_score?: number | null;
  score_rule?: string | null;
  submission_count: number;
  pending_count: number;
  assigned_count?: number;
}

export interface SubmissionItem {
  id: string;
  task_id: string;
  task_title?: string;
  student_id: string;
  student_name?: string;
  submitted_at?: string;
  status: string;
  score?: number;
  technical_score?: number;
  file_url?: string;
  reviewer_notes?: string;
  graded_by_user_id?: string;
}

export interface WhatsAppDirectLink {
  phone: string;
  student_id: string;
  student_name: string;
  encoded_url: string;
  message_text: string;
}

export interface OfficialWhatsAppStatus {
  configured: boolean;
  status: string;
  phone_number?: string | null;
  battery?: number | null;
  qr_code?: string | null;
}

export interface EscalationRecord {
  id: string;
  student_id: string;
  student_name: string;
  arabic_name: string;
  phone: string;
  hr_member_id: string;
  hr_member_name: string;
  flagged_reason: string;
  flagged_at: string;
  last_contacted_at?: string | null;
  days_open: number;
  status: string;
  is_escalated: boolean;
}

export interface DashboardStats {
  total_students: number;
  present_today: number;
  late_today: number;
  absent_today: number;
  attendance_rate_today: number;
  upcoming_meetings_count: number;
  pending_submissions_count: number;
  recent_actions_count: number;
}

export interface ToolCallExecution {
  tool_name: string;
  parameters: Record<string, any>;
  result: any;
  status: string;
  reasoning_summary?: string;
}

export interface PendingConfirmation {
  action_id: string;
  tool_name: string;
  description: string;
  target_count: number;
  preview_data: {
    target_count: number;
    recipients: Array<{ id: string; name: string; arabic_name?: string; phone: string }>;
    event?: { id?: string; title?: string; time?: string; meet_url?: string };
    message_preview: string;
    channel: string;
  };
}

export interface AgentChatResponse {
  conversation_id: string;
  response: string;
  tool_executions: ToolCallExecution[];
  requires_confirmation: boolean;
  pending_confirmation?: PendingConfirmation;
  audit_id?: string;
}

export interface AuditLogItem {
  id: string;
  action_id: string;
  user_id: string;
  intent: string;
  tool_name: string;
  parameters: string;
  result: string;
  requires_confirmation: boolean;
  confirmed: boolean;
  status: string;
  timestamp: string;
}

// =========================================================
// WhatsApp Chat & Real-Time Types
// =========================================================

export interface WhatsAppReaction {
  emoji: string;
  from: string;
  user_id?: string;
}

export interface WhatsAppChatMessage {
  id: string;
  openwa_message_id?: string | null;
  student_id: string;
  assigned_hr_id?: string | null;
  sender_type: 'HR' | 'STUDENT' | 'SYSTEM';
  sender_id?: string | null;
  sender_phone: string;
  recipient_phone: string;
  message_type: 'text' | 'image' | 'video' | 'document' | 'audio' | 'reaction';
  content: string;
  media_url?: string | null;
  media_filename?: string | null;
  media_mimetype?: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  ack_status: number; // 0: pending, 1: sent, 2: delivered, 3: read
  reply_to_message_id?: string | null;
  is_edited: boolean;
  reactions: WhatsAppReaction[];
  created_at: string;
  delivered_at?: string | null;
  read_at?: string | null;
}

export interface WhatsAppThreadSummary {
  student_id: string;
  student_code: string;
  full_name: string;
  arabic_name: string;
  phone: string;
  team_id?: string | null;
  assigned_hr_id?: string | null;
  assigned_hr_name?: string | null;
  last_message?: WhatsAppChatMessage | null;
  unread_count: number;
  status: string;
}

export interface WhatsAppSendMessagePayload {
  content: string;
  reply_to_message_id?: string | null;
  message_type?: string;
  media_url?: string | null;
  media_filename?: string | null;
  media_mimetype?: string | null;
}
