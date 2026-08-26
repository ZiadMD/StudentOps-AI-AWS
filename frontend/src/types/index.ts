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
  total_expected: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  attendance: AttendanceRecord[];
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
  max_score: number;
  score_rule: string;
  submission_count: number;
  pending_count: number;
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
  file_url?: string;
  reviewer_notes?: string;
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
