import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { WhatsAppChatWindow } from '../components/WhatsAppChatWindow';
import { ToastProvider } from '../context/ToastContext';
import { api } from '../api/client';
import { UserProfile, WhatsAppThreadSummary, WhatsAppChatMessage, WhatsAppSyncResponse } from '../types';

vi.mock('../api/client', () => ({
  api: {
    getWhatsAppThreads: vi.fn(),
    getThreadMessages: vi.fn(),
    syncThreadMessages: vi.fn(),
    sendThreadMessage: vi.fn(),
    reactToMessage: vi.fn(),
    editThreadMessage: vi.fn(),
  },
  getWhatsAppWebSocketUrl: vi.fn(() => 'ws://localhost/api/whatsapp/ws'),
}));

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const mockHrUser: UserProfile = {
  id: 'usr_hr_member',
  email: 'hr.member@studentops.org',
  full_name: 'HR Coordinator',
  role: 'committee_hr_member',
  is_active: true,
  created_at: new Date().toISOString(),
};

const mockThreads: WhatsAppThreadSummary[] = [
  {
    student_id: 'std_ziad',
    student_code: 'CS-01',
    full_name: 'Ziad Mohamed',
    arabic_name: 'زياد محمد',
    phone: '201012345678',
    team_id: 'team_tech',
    assigned_hr_id: 'usr_hr_member',
    assigned_hr_name: 'HR Coordinator',
    unread_count: 0,
    status: 'ACTIVE',
    last_message: null,
  },
];

const mockInitialMessages: WhatsAppChatMessage[] = [
  {
    id: 'msg_001',
    openwa_message_id: 'true_msg_001',
    student_id: 'std_ziad',
    assigned_hr_id: 'usr_hr_member',
    sender_type: 'HR',
    sender_id: 'usr_hr_member',
    sender_phone: '201000000000',
    recipient_phone: '201012345678',
    message_type: 'text',
    content: 'Hello Ziad, please confirm task status.',
    status: 'sent',
    ack_status: 1,
    is_edited: false,
    reactions: [],
    created_at: '2026-09-16T10:00:00Z',
  },
];

describe('WhatsAppChatWindow automatic synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('WebSocket', class { close = vi.fn(); send = vi.fn(); });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.mocked(api.getWhatsAppThreads).mockResolvedValue([...mockThreads]);
    vi.mocked(api.getThreadMessages).mockResolvedValue([...mockInitialMessages]);
    vi.mocked(api.syncThreadMessages).mockResolvedValue({
      success: true, student_id: 'std_ziad', synced_count: 1,
      new_messages_count: 0, updated_messages_count: 0, messages: [...mockInitialMessages],
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('renders a shared inbox and inline sync status without a manual sync button', async () => {
    render(
      <ToastProvider>
        <WhatsAppChatWindow currentUser={mockHrUser} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Shared inbox')).toBeInTheDocument();
      expect(screen.getAllByText('Ziad Mohamed').length).toBeGreaterThan(0);
      expect(screen.getByText('Hello Ziad, please confirm task status.')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Last synced');
      expect(screen.queryByRole('button', { name: /sync chat/i })).not.toBeInTheDocument();
    });
  });

  it('automatically syncs on open without dispatching a message', async () => {
    const mockSyncedMessages: WhatsAppChatMessage[] = [
      ...mockInitialMessages,
      {
        id: 'msg_002',
        openwa_message_id: 'false_msg_002',
        student_id: 'std_ziad',
        assigned_hr_id: 'usr_hr_member',
        sender_type: 'STUDENT',
        sender_id: 'std_ziad',
        sender_phone: '201012345678',
        recipient_phone: '201000000000',
        message_type: 'text',
        content: 'Task is completed and submitted on portal.',
        status: 'delivered',
        ack_status: 2,
        is_edited: false,
        reactions: [],
        created_at: '2026-09-16T10:05:00Z',
      },
    ];

    const mockSyncResponse: WhatsAppSyncResponse = {
      success: true,
      student_id: 'std_ziad',
      synced_count: 2,
      new_messages_count: 1,
      updated_messages_count: 0,
      messages: mockSyncedMessages,
    };

    vi.mocked(api.syncThreadMessages).mockResolvedValue(mockSyncResponse);

    render(
      <ToastProvider>
        <WhatsAppChatWindow currentUser={mockHrUser} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(api.syncThreadMessages).toHaveBeenCalledWith('std_ziad');
      expect(screen.getAllByText('Task is completed and submitted on portal.').length).toBeGreaterThan(0);
    });
    expect(api.sendThreadMessage).not.toHaveBeenCalled();
  });
});
