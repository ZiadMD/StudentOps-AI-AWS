import {
  DashboardStats,
  Student,
  StudentScoreSummary,
  MeetingDetail,
  EventItem,
  TaskItem,
  SubmissionItem,
  AgentChatResponse,
  AuditLogItem
} from '../types';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'API request failed');
  }
  return res.json();
}

export const api = {
  // Dashboard
  getStats: () => fetchJson<DashboardStats>('/dashboard/stats'),

  // Agent Chat
  sendAgentQuery: (query: string, conversationId?: string) =>
    fetchJson<AgentChatResponse>('/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ query, conversation_id: conversationId }),
    }),

  confirmAction: (actionId: string, confirmed: boolean) =>
    fetchJson<{ success: boolean; message: string; result?: any }>('/agent/confirm', {
      method: 'POST',
      body: JSON.stringify({ action_id: actionId, confirmed }),
    }),

  // Students & Scoreboards
  getStudents: () => fetchJson<Student[]>('/students'),
  getScoreboard: () => fetchJson<StudentScoreSummary[]>('/students/scoreboard/all'),

  // Attendance & Meetings
  getMeetings: () => fetchJson<MeetingDetail[]>('/attendance/meetings'),
  getMeetingDetail: (meetingId: string) => fetchJson<MeetingDetail>(`/attendance/meetings/${meetingId}`),
  reprocessAttendance: (meetingId: string) =>
    fetchJson<{ success: boolean; processed_count: number }>(`/attendance/meetings/${meetingId}/process`, {
      method: 'POST',
    }),

  // Calendar
  getEvents: () => fetchJson<EventItem[]>('/calendar/events'),

  // Tasks
  getTasks: () => fetchJson<TaskItem[]>('/tasks'),
  getTaskSubmissions: (taskId: string) => fetchJson<SubmissionItem[]>(`/tasks/${taskId}/submissions`),

  // Audit Logs
  getAuditLogs: () => fetchJson<AuditLogItem[]>('/audit/logs'),
};
