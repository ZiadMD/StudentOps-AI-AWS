import {
  DashboardStats,
  Student,
  StudentCreatePayload,
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
  WhatsAppChatMessage,
  WhatsAppThreadSummary,
  WhatsAppSendMessagePayload,
  MemberFeedbackItem,
  MemberQuestionItem,
  CommitteeReportItem,
} from '../types';

import { memoryCache } from './cache';

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
  memoryCache.clear();
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

  // In-memory Cache
  cache: memoryCache,

  // Students & Scoreboards
  getStudents: (assignedOnly: boolean = false) =>
    fetchJson<Student[]>(`/students${assignedOnly ? '?assigned_only=true' : ''}`),
  createStudent: async (payload: StudentCreatePayload) => {
    const res = await fetchJson<Student>('/students', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    memoryCache.invalidate('students');
    return res;
  },
  getScoreboard: () => fetchJson<StudentScoreSummary[]>('/students/scoreboard/all'),
  updateBehaviorScore: async (
    studentId: string,
    payload: {
      group_interaction: number;
      social_media: number;
      hierarchy_rules: number;
      polite_conduct: number;
      notes?: string;
      month?: string;
    }
  ) => {
    const res = await fetchJson<StudentScoreSummary>(`/students/${studentId}/behavior-score`, {
      method: 'PUT',
      body: JSON.stringify({ student_id: studentId, ...payload }),
    });
    memoryCache.invalidate('scoreboard');
    memoryCache.invalidate('students');
    return res;
  },
  assignCohort: async (payload: { student_ids: string[]; hr_member_id: string }) => {
    const res = await fetchJson<{ status: string; assigned_count: number }>('/students/assign-cohort', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    memoryCache.invalidate('students');
    return res;
  },
  updateStudentPhone: async (studentId: string, phone: string) => {
    const res = await fetchJson<Student>(`/students/${studentId}/phone`, {
      method: 'PATCH',
      body: JSON.stringify({ phone }),
    });
    memoryCache.invalidate('students');
    return res;
  },

  awardBonus: (
    studentId: string,
    payload: { points: number; max_points?: number; notes?: string }
  ) =>
    fetchJson<StudentScoreSummary>(`/students/${studentId}/bonus`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Attendance & Meetings
  getMeetings: () => fetchJson<MeetingDetail[]>('/attendance/meetings'),
  getMeetingDetail: (meetingId: string) => fetchJson<MeetingDetail>(`/attendance/meetings/${meetingId}`),
  createMeeting: (payload: {
    title: string;
    topic?: string;
    start_time: string;
    end_time: string;
    duration_minutes?: number;
    meet_url?: string;
    session_number?: number;
    student_ids?: string[];
  }) =>
    fetchJson<MeetingDetail>('/attendance/meetings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  reprocessAttendance: (meetingId: string) =>
    fetchJson<{ success: boolean; processed_count: number }>(`/attendance/meetings/${meetingId}/process`, {
      method: 'POST',
    }),

  // Calendar
  getEvents: () => fetchJson<EventItem[]>('/calendar/events'),

  // Tasks & Submissions
  getTasks: () => fetchJson<TaskItem[]>('/tasks'),
  createTask: (payload: {
    title: string;
    description?: string;
    deadline: string;
    max_score?: number;
    task_number?: number;
    student_ids?: string[];
  }) =>
    fetchJson<TaskItem>('/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
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
    fetchJson<SubmissionItem>(`/tasks/${taskId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ file_url: fileUrl }),
    }),

  // Member Feedback (Flows to HR Leader)
  getFeedback: (studentId?: string, status?: string) => {
    let url = '/feedback';
    const params: string[] = [];
    if (studentId) params.push(`student_id=${encodeURIComponent(studentId)}`);
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    if (params.length) url += `?${params.join('&')}`;
    return fetchJson<MemberFeedbackItem[]>(url);
  },
  submitFeedback: (payload: { hr_member_id?: string; hr_member_name?: string; category: string; content: string }) =>
    fetchJson<MemberFeedbackItem>('/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateFeedbackStatus: (feedbackId: string, payload: { status: string; notes?: string }) =>
    fetchJson<MemberFeedbackItem>(`/feedback/${feedbackId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Member Questions (Answered by Committee Head)
  getQuestions: (status?: string) =>
    fetchJson<MemberQuestionItem[]>(`/questions${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  askQuestion: (payload: { title: string; content: string; team_id?: string }) =>
    fetchJson<MemberQuestionItem>('/questions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  answerQuestion: (questionId: string, answer: string) =>
    fetchJson<MemberQuestionItem>(`/questions/${questionId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    }),

  // Committee Performance Reports (HR Leader -> HR Head)
  getCommitteeSummary: () => fetchJson<any>('/reports/committee/summary'),
  submitCommitteeReport: (payload: { report_title: string; notes?: string }) =>
    fetchJson<CommitteeReportItem>('/reports/submit-to-head', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getCommitteeReports: () => fetchJson<CommitteeReportItem[]>('/reports'),

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

  // WhatsApp Per-HR Chat & Real-Time Threads
  getWhatsAppThreads: (oversight: boolean = false) =>
    fetchJson<WhatsAppThreadSummary[]>(`/whatsapp/threads${oversight ? '?oversight=true' : ''}`),
  getThreadMessages: (studentId: string) =>
    fetchJson<WhatsAppChatMessage[]>(`/whatsapp/threads/${encodeURIComponent(studentId)}/messages`),
  sendThreadMessage: (studentId: string, payload: WhatsAppSendMessagePayload) =>
    fetchJson<WhatsAppChatMessage>(`/whatsapp/threads/${encodeURIComponent(studentId)}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  sendThreadMedia: async (studentId: string, file: File, caption?: string, replyToId?: string) => {
    const token = getStoredToken();
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const formData = new FormData();
    formData.append('file', file);
    if (caption) formData.append('caption', caption);
    if (replyToId) formData.append('reply_to_message_id', replyToId);

    const res = await fetch(`${API_BASE}/whatsapp/threads/${encodeURIComponent(studentId)}/media`, {
      method: 'POST',
      headers: {
        ...authHeaders,
      },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Media dispatch failed');
    }
    return res.json() as Promise<WhatsAppChatMessage>;
  },
  reactToMessage: (studentId: string, messageId: string, reaction: string) =>
    fetchJson<WhatsAppChatMessage>(`/whatsapp/threads/${encodeURIComponent(studentId)}/messages/${encodeURIComponent(messageId)}/reaction`, {
      method: 'POST',
      body: JSON.stringify({ reaction }),
    }),
  editThreadMessage: (studentId: string, messageId: string, content: string) =>
    fetchJson<WhatsAppChatMessage>(`/whatsapp/threads/${encodeURIComponent(studentId)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  // Audit Logs
  getAuditLogs: () => fetchJson<AuditLogItem[]>('/audit/logs'),
};

export function getWhatsAppWebSocketUrl(): string {
  const token = getStoredToken();
  const loc = window.location;
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/^https?:\/\//, '') || loc.host;
  const basePath = API_BASE.startsWith('http') ? new URL(API_BASE).pathname : API_BASE;
  const cleanPath = basePath.replace(/\/+$/, '');
  return `${proto}//${host}${cleanPath}/whatsapp/ws?token=${encodeURIComponent(token || '')}`;
}
