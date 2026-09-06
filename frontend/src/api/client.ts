import {
  DashboardStats,
  Student,
  StudentScoreSummary,
  MeetingDetail,
  EventItem,
  TaskItem,
  SubmissionItem,
  AgentChatResponse,
  AuditLogItem,
  UserProfile,
  TokenResponse,
  TeamItem,
  WhatsAppDirectLink,
  OfficialWhatsAppStatus,
  EscalationRecord,
} from '../types';

export const API_BASE = ((import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/+$/, '')) || '/api';
const TOKEN_KEY = 'studentops_access_token';
const USER_KEY = 'studentops_user';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function getStoredUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserProfile): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {}
}

export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {}
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    if (res.status === 401 && token) {
      clearStoredAuth();
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API request failed (HTTP ${res.status})`);
  }
  return res.json();
}

export const api = {
  // Auth Helpers
  getToken: getStoredToken,
  getUser: getStoredUser,
  logout: clearStoredAuth,

  // Auth Endpoints
  login: async (payload: { email: string; password: string }): Promise<TokenResponse> => {
    const data = await fetchJson<TokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(data.access_token);
    setStoredUser(data.user);
    return data;
  },

  register: async (payload: {
    email: string;
    password: string;
    full_name: string;
    arabic_name?: string;
    role: string;
    team_id?: string;
  }): Promise<TokenResponse> => {
    const data = await fetchJson<TokenResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(data.access_token);
    setStoredUser(data.user);
    return data;
  },

  getMe: () => fetchJson<UserProfile>('/auth/me'),
  getTeams: () => fetchJson<TeamItem[]>('/auth/teams'),

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
  getStudents: (assignedOnly: boolean = false) =>
    fetchJson<Student[]>(`/students${assignedOnly ? '?assigned_only=true' : ''}`),
  getScoreboard: () => fetchJson<StudentScoreSummary[]>('/students/scoreboard/all'),
  updateBehaviorScore: (
    studentId: string,
    payload: {
      group_interaction: number;
      social_media: number;
      hierarchy_rules: number;
      polite_conduct: number;
      notes?: string;
      month?: string;
    }
  ) =>
    fetchJson<StudentScoreSummary>(`/students/${studentId}/behavior-score`, {
      method: 'PUT',
      body: JSON.stringify({ student_id: studentId, ...payload }),
    }),
  assignCohort: (payload: { student_ids: string[]; hr_member_id: string }) =>
    fetchJson<{ status: string; assigned_count: number }>('/students/assign-cohort', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Attendance & Meetings
  getMeetings: () => fetchJson<MeetingDetail[]>('/attendance/meetings'),
  getMeetingDetail: (meetingId: string) => fetchJson<MeetingDetail>(`/attendance/meetings/${meetingId}`),
  reprocessAttendance: (meetingId: string) =>
    fetchJson<{ success: boolean; processed_count: number }>(`/attendance/meetings/${meetingId}/process`, {
      method: 'POST',
    }),

  // Calendar
  getEvents: () => fetchJson<EventItem[]>('/calendar/events'),

  // Tasks & Submissions
  getTasks: () => fetchJson<TaskItem[]>('/tasks'),
  getTaskSubmissions: (taskId: string) => fetchJson<SubmissionItem[]>(`/tasks/${taskId}/submissions`),
  reviewTaskSubmission: (
    submissionId: string,
    payload: { score: number; reviewer_notes?: string }
  ) =>
    fetchJson<SubmissionItem>(`/tasks/submissions/${submissionId}/review`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  submitTask: (taskId: string, fileUrl: string) =>
    fetchJson<SubmissionItem>(`/tasks/${taskId}/submit?file_url=${encodeURIComponent(fileUrl)}`, {
      method: 'POST',
    }),

  // WhatsApp & Escalations
  getWhatsAppStatus: () => fetchJson<OfficialWhatsAppStatus>('/whatsapp/status'),
  getWhatsAppQr: () => fetchJson<{ qr?: string; message?: string }>('/whatsapp/qr'),
  sendOfficialWhatsApp: (payload: { phone_number: string; message: string }) =>
    fetchJson<{ success: boolean; message_id?: string; error?: string }>('/whatsapp/send-official', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  generateWhatsAppLink: (
    studentId: string,
    templateType: string = 'OVERDUE_TASK',
    taskId?: string,
    customText?: string
  ) => {
    let url = `/whatsapp/generate-link?student_id=${encodeURIComponent(studentId)}&template_type=${encodeURIComponent(templateType)}`;
    if (taskId) url += `&task_id=${encodeURIComponent(taskId)}`;
    if (customText) url += `&custom_text=${encodeURIComponent(customText)}`;
    return fetchJson<WhatsAppDirectLink>(url, { method: 'POST' });
  },
  getSlaEscalations: () => fetchJson<EscalationRecord[]>('/whatsapp/escalations'),

  // Audit Logs
  getAuditLogs: () => fetchJson<AuditLogItem[]>('/audit/logs'),
};
