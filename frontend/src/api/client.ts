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

const configuredApiBase = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/+$/, '');
export const API_BASE = configuredApiBase
  ? (configuredApiBase.endsWith('/api') ? configuredApiBase : `${configuredApiBase}/api`)
  : '/api';
const TOKEN_KEY = 'studentops_access_token';
const REFRESH_TOKEN_KEY = 'studentops_refresh_token';
const USER_KEY = 'studentops_user';

function getAuthStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function migrateSessionValue(key: string): string | null {
  const storage = getAuthStorage();
  if (!storage) return null;

  const currentValue = storage.getItem(key);
  if (currentValue) return currentValue;

  try {
    const legacyValue = window.sessionStorage.getItem(key);
    if (legacyValue) {
      storage.setItem(key, legacyValue);
      window.sessionStorage.removeItem(key);
    }
    return legacyValue;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly requestId?: string;

  constructor(message: string, status: number, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
  }
}

export function getStoredToken(): string | null {
  return migrateSessionValue(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  getAuthStorage()?.setItem(TOKEN_KEY, token);
}

function getStoredRefreshToken(): string | null {
  return migrateSessionValue(REFRESH_TOKEN_KEY);
}

function setStoredRefreshToken(token: string): void {
  getAuthStorage()?.setItem(REFRESH_TOKEN_KEY, token);
}

export function getStoredUser(): UserProfile | null {
  try {
    const raw = migrateSessionValue(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserProfile): void {
  getAuthStorage()?.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredAuth(): void {
  try {
    getAuthStorage()?.removeItem(TOKEN_KEY);
    getAuthStorage()?.removeItem(REFRESH_TOKEN_KEY);
    getAuthStorage()?.removeItem(USER_KEY);
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    window.sessionStorage.removeItem(USER_KEY);
  } catch {}
}

type RefreshWaiter = {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
};

function isUsableAccessToken(token: unknown): token is string {
  return typeof token === 'string'
    && token.trim().length > 0
    && !['null', 'none', 'undefined'].includes(token.trim().toLowerCase());
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;
const pendingRequests: RefreshWaiter[] = [];

function waitForRefresh(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    pendingRequests.push({ resolve, reject });
  });
}

function processRefreshQueue(error: Error | null, token: string | null): void {
  while (pendingRequests.length > 0) {
    const waiter = pendingRequests.shift();
    if (!waiter) continue;
    if (error || !token) {
      waiter.reject(error ?? new Error('Session refresh failed.'));
    } else {
      waiter.resolve(token);
    }
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) throw new Error('Session refresh failed.');

      const data = await response.json() as TokenResponse;
      if (!isUsableAccessToken(data.access_token)) {
        throw new Error('Session refresh returned an invalid access token.');
      }

      const newAccessToken = data.access_token.trim();
      setStoredToken(newAccessToken);
      if (data.refresh_token) setStoredRefreshToken(data.refresh_token);
      if (data.user) setStoredUser(data.user);
      processRefreshQueue(null, newAccessToken);
      return newAccessToken;
    } catch (error) {
      const refreshError = error instanceof Error
        ? error
        : new Error('Session refresh failed.');
      processRefreshQueue(refreshError, null);
      return null;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
    isRefreshing = false;
  }
}

function redirectToLogin(): void {
  clearStoredAuth();
  if (typeof window !== 'undefined' && window.location.pathname !== '/') {
    window.location.assign('/');
  }
}

async function fetchJson<T>(
  url: string,
  options?: RequestInit,
  retried = false,
  retryToken?: string,
): Promise<T> {
  const token = retryToken ?? getStoredToken();
  const headers = new Headers(options?.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  else headers.delete('Authorization');

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 && !retried && url !== '/auth/login' && url !== '/auth/refresh') {
      try {
        const refreshedToken = isRefreshing
          ? await waitForRefresh()
          : await refreshAccessToken();
        if (refreshedToken) {
          return fetchJson<T>(url, options, true, refreshedToken);
        }
      } catch {
        redirectToLogin();
        throw new ApiError('Session expired. Please sign in again.', 401);
      }
      redirectToLogin();
    } else if (res.status === 401 && url !== '/auth/login') {
      redirectToLogin();
    }
    const err = await res.json().catch(() => ({}));
    const message = typeof err.detail === 'string'
      ? err.detail
      : `API request failed (HTTP ${res.status})`;
    const requestId = res.headers.get('X-Request-ID') || undefined;
    const suffix = requestId ? ` Reference: ${requestId}` : '';
    throw new ApiError(`${message}${suffix}`, res.status, requestId);
  }
  return res.json();
}

export const api = {
  // Auth Helpers
  getToken: getStoredToken,
  getUser: getStoredUser,
  logout: clearStoredAuth,

  // Auth Endpoints
  login: async (payload: { email: string; password: string; turnstile_token: string }): Promise<TokenResponse & { user: UserProfile }> => {
    const data = await fetchJson<TokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(data.access_token);
    if (data.refresh_token) setStoredRefreshToken(data.refresh_token);
    if (!data.user) throw new ApiError('Login response did not include a user profile.', 502);
    const user: UserProfile = data.user;
    setStoredUser(user);
    data.user = user;
    return { ...data, user };
  },

  register: async (payload: {
    email: string;
    password: string;
    full_name: string;
    arabic_name?: string;
    role: string;
    team_id?: string;
  }): Promise<TokenResponse> => {
    void payload;
    throw new ApiError('Self-registration is not enabled by this backend.', 404);
  },

  getMe: async () => {
    const user = await fetchJson<UserProfile>('/auth/me');
    setStoredUser(user);
    return user;
  },
  getTeams: async (): Promise<TeamItem[]> => [],

  // Dashboard
  getStats: async (role: UserProfile['role'] = 'member'): Promise<DashboardStats> => {
    const [students, tasks, events] = await Promise.all([
      role === 'admin' ? api.getStudents() : Promise.resolve([]), api.getTasks(), api.getEvents()
    ]);
    return {
      total_students: students.length, present_today: 0, late_today: 0,
      absent_today: 0, attendance_rate_today: 0,
      upcoming_meetings_count: events.length,
      pending_submissions_count: tasks.reduce((count, task) => count + task.pending_count, 0),
      recent_actions_count: 0,
    };
  },

  // Agent Chat
  executeAgentTool: (tool_name: string, payload: Record<string, unknown>) =>
    fetchJson<AgentChatResponse>('/agent/execute', {
      method: 'POST',
      body: JSON.stringify({ tool_name, payload }),
    }),

  confirmAction: (approvalId: string) =>
    fetchJson<AgentChatResponse>(`/agent/approvals/${encodeURIComponent(approvalId)}/approve`, { method: 'POST' }),

  // Students & Scoreboards
  getStudents: async (): Promise<Student[]> => {
    const response = await fetchJson<{ data: Array<Record<string, unknown>> }>('/members/');
    return response.data.map((member) => ({
      id: String(member.id ?? ''), student_code: String(member.id ?? ''),
      full_name: String(member.name ?? ''), arabic_name: '', email: String(member.email ?? ''),
      phone: String(member.phone_number ?? ''), university: '', role: String(member.role ?? 'member'),
      status: 'active', created_at: String(member.created_at ?? ''),
    }));
  },
  getScoreboard: async (): Promise<StudentScoreSummary[]> => [],

  // Attendance & Meetings
  getMeetings: async (): Promise<MeetingDetail[]> => [],
  getMeetingDetail: async (meetingId: string): Promise<MeetingDetail> => {
    const response = await fetchJson<{ meeting_id: string; absent_count: number }>(`/tools/attendance/meeting/${encodeURIComponent(meetingId)}/absent`);
    return { id: response.meeting_id, meeting_code: response.meeting_id, title: 'Meeting', topic: '', start_time: '', end_time: '', duration_minutes: 0, meet_url: '', status: 'loaded', total_expected: response.absent_count, present_count: 0, late_count: 0, absent_count: response.absent_count, attendance: [] };
  },
  reprocessAttendance: async (meetingId: string) => ({ success: false, processed_count: 0, meetingId }),

  // Calendar
  getEvents: async (): Promise<EventItem[]> => {
    const response = await fetchJson<{ events: Array<Record<string, unknown>> }>('/events/');
    return response.events.map((event) => ({
      id: String(event.id ?? ''), title: String(event.title ?? ''),
      description: typeof event.description === 'string' ? event.description : undefined,
      event_type: event.is_online ? 'meeting' : 'event', start_time: String(event.start_time ?? ''),
      end_time: String(event.start_time ?? ''), location: event.is_online ? 'Online' : '',
      meet_url: typeof event.meet_link === 'string' ? event.meet_link : undefined, is_mandatory: false,
    }));
  },

  // Tasks
  getTasks: async (): Promise<TaskItem[]> => {
    const response = await fetchJson<{ tasks: Array<Record<string, unknown>> }>('/tasks/');
    return response.tasks.map((task, index) => ({
      id: String(task.id ?? ''), task_number: Number(task.task_number ?? index + 1),
      title: String(task.title ?? task.name ?? ''), description: String(task.description ?? ''),
      deadline: String(task.deadline ?? task.due_date ?? ''), max_score: Number(task.max_score ?? 0),
      score_rule: String(task.score_rule ?? ''), submission_count: Number(task.submission_count ?? 0),
      pending_count: Number(task.pending_count ?? 0),
    }));
  },
  getTaskSubmissions: async (taskId: string): Promise<SubmissionItem[]> => {
    const response = await fetchJson<{ submissions: Array<Record<string, unknown>> }>(`/submissions/task/${encodeURIComponent(taskId)}`);
    return response.submissions.map((submission) => ({
      id: String(submission.id ?? ''), task_id: taskId, student_id: String(submission.member_id ?? ''),
      submitted_at: typeof submission.submitted_at === 'string' ? submission.submitted_at : undefined,
      status: String(submission.status ?? 'pending'),
      file_url: typeof submission.attachment_url === 'string' ? submission.attachment_url : undefined,
    }));
  },

  // Audit Logs
  getAuditLogs: async (): Promise<AuditLogItem[]> => [],
};

