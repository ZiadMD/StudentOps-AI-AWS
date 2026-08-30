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
  TeamItem
} from '../types';

const API_BASE = '/api';
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
