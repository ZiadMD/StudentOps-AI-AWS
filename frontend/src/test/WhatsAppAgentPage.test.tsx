import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WhatsAppAgentPage } from '../components/WhatsAppAgentPage';
import { api } from '../api/client';
import type { EscalationRecord, OfficialWhatsAppStatus, UserProfile, UserRole } from '../types';

vi.mock('../api/client', () => ({
  api: {
    getWhatsAppStatus: vi.fn(),
    getSlaEscalations: vi.fn(),
    getStudents: vi.fn(),
    getTasks: vi.fn(),
    getWhatsAppQr: vi.fn(),
    sendOfficialWhatsApp: vi.fn(),
  },
}));

vi.mock('../components/WhatsAppChatWindow', () => ({
  WhatsAppChatWindow: ({ currentUser }: { currentUser: UserProfile }) => (
    <section aria-label="Member conversations">Conversations for {currentUser.full_name}</section>
  ),
}));

const admin: UserProfile = {
  id: 'usr_admin', email: 'admin@example.org', full_name: 'HR Administrator',
  role: 'hr_admin', is_active: true, created_at: '2026-09-17T00:00:00Z',
};
const connected: OfficialWhatsAppStatus = {
  configured: true, status: 'CONNECTED', phone_number: '+201000000000',
};
const escalation: EscalationRecord = {
  id: 'esc_1', student_id: 'stu_1', student_name: 'Example Member', arabic_name: 'عضو',
  phone: '+201000000001', hr_member_id: 'usr_hr', hr_member_name: 'Assigned Coordinator',
  flagged_reason: 'OVERDUE_TASK', flagged_at: '2026-09-13T00:00:00Z', days_open: 4,
  status: 'OPEN', is_escalated: true,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function expectNoInternalNavigation() {
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^(Inbox|Follow-ups|Channel settings|Open Chat|Open WhatsApp Chat)$/ })).not.toBeInTheDocument();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getWhatsAppStatus).mockResolvedValue(connected);
  vi.mocked(api.getSlaEscalations).mockResolvedValue([escalation]);
  vi.mocked(api.getWhatsAppQr).mockResolvedValue({ message: 'Ready to pair' });
  vi.mocked(api.sendOfficialWhatsApp).mockResolvedValue({ success: true });
});
afterEach(cleanup);

describe('separate communication views', () => {
  it('renders inbox immediately without fetching settings, follow-ups, students, or tasks', () => {
    render(<WhatsAppAgentPage currentUser={admin} view="chat" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Member conversations' })).toHaveTextContent(admin.full_name);
    expect(screen.queryByText('Organization account')).not.toBeInTheDocument();
    expect(screen.queryByText('3-Day SLA Escalation Monitor')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(api.getWhatsAppStatus).not.toHaveBeenCalled();
    expect(api.getSlaEscalations).not.toHaveBeenCalled();
    expect(api.getStudents).not.toHaveBeenCalled();
    expect(api.getTasks).not.toHaveBeenCalled();
    expectNoInternalNavigation();
  });

  it('renders only follow-ups, retaining desktop and mobile records without chat-switch actions', async () => {
    render(<WhatsAppAgentPage currentUser={admin} view="escalations" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Follow-ups' })).toBeInTheDocument();
    expect(await screen.findAllByText(escalation.student_name)).toHaveLength(2);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('1 active flags')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Member conversations' })).not.toBeInTheDocument();
    expect(screen.queryByText('Organization account')).not.toBeInTheDocument();
    expect(api.getSlaEscalations).toHaveBeenCalledTimes(1);
    expect(api.getWhatsAppStatus).not.toHaveBeenCalled();
    expect(api.getStudents).not.toHaveBeenCalled();
    expect(api.getTasks).not.toHaveBeenCalled();
    expectNoInternalNavigation();
  });

  it.each<UserRole>(['region_hr_head', 'hr_admin'])('allows official settings for %s and fetches only status', async (role) => {
    render(<WhatsAppAgentPage currentUser={{ ...admin, role }} view="official" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Channel settings' })).toBeInTheDocument();
    expect(await screen.findByText('Organization account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pair account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.queryByRole('region', { name: 'Member conversations' })).not.toBeInTheDocument();
    expect(api.getWhatsAppStatus).toHaveBeenCalledTimes(1);
    expect(api.getSlaEscalations).not.toHaveBeenCalled();
    expect(api.getStudents).not.toHaveBeenCalled();
    expect(api.getTasks).not.toHaveBeenCalled();
    expect(api.getWhatsAppQr).not.toHaveBeenCalled();
    expectNoInternalNavigation();
  });

  it.each<UserRole>(['committee_hr_leader', 'committee_head', 'team_lead', 'committee_hr_member', 'committee_member', 'member'])('guards official settings from %s without requests', (role) => {
    render(<WhatsAppAgentPage currentUser={{ ...admin, role }} view="official" />);
    expect(screen.getByRole('heading', { name: 'Channel settings' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('available only to region HR heads and HR administrators');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Official message')).not.toBeInTheDocument();
    expect(api.getWhatsAppStatus).not.toHaveBeenCalled();
    expect(api.getSlaEscalations).not.toHaveBeenCalled();
    expect(api.getStudents).not.toHaveBeenCalled();
    expect(api.getTasks).not.toHaveBeenCalled();
    expect(api.getWhatsAppQr).not.toHaveBeenCalled();
    expectNoInternalNavigation();
  });

  it('handles prop switching and ignores stale follow-up responses from previous visits', async () => {
    const oldRequest = deferred<EscalationRecord[]>();
    vi.mocked(api.getSlaEscalations).mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce([]);
    const { rerender } = render(<WhatsAppAgentPage currentUser={admin} view="escalations" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading follow-ups');
    rerender(<WhatsAppAgentPage currentUser={admin} view="chat" />);
    expect(screen.getByRole('region', { name: 'Member conversations' })).toBeInTheDocument();
    rerender(<WhatsAppAgentPage currentUser={admin} view="escalations" />);
    expect(await screen.findByText(/No follow-up flags/)).toBeInTheDocument();
    await act(async () => { oldRequest.resolve([escalation]); });
    expect(screen.queryByText(escalation.student_name)).not.toBeInTheDocument();
    rerender(<WhatsAppAgentPage currentUser={admin} view="official" />);
    expect(await screen.findByText('Organization account')).toBeInTheDocument();
    expect(api.getSlaEscalations).toHaveBeenCalledTimes(2);
    expect(api.getWhatsAppStatus).toHaveBeenCalledTimes(1);
  });

  it('displays follow-up errors rather than a false empty state and supports retry', async () => {
    vi.mocked(api.getSlaEscalations).mockRejectedValueOnce(new Error('Follow-up service unavailable'));
    render(<WhatsAppAgentPage currentUser={admin} view="escalations" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Follow-up service unavailable');
    expect(screen.queryByText(/No follow-up flags/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh follow-ups' }));
    expect(await screen.findAllByText(escalation.student_name)).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears stale connected status on refresh failure and supports retry', async () => {
    vi.mocked(api.getWhatsAppStatus).mockResolvedValueOnce(connected).mockRejectedValueOnce(new Error('Status request failed')).mockResolvedValueOnce(connected);
    render(<WhatsAppAgentPage currentUser={admin} view="official" />);
    expect(await screen.findByText(/Live \(/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Status request failed');
    expect(screen.queryByText(/Live \(/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Status' }));
    expect(await screen.findByText(/Live \(/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('preserves official sending, failure feedback, inputs, and duplicate-submit protection', async () => {
    const pending = deferred<{ success: boolean }>();
    vi.mocked(api.sendOfficialWhatsApp).mockReturnValueOnce(pending.promise);
    render(<WhatsAppAgentPage currentUser={admin} view="official" />);
    await screen.findByText('Organization account');
    const phone = screen.getByLabelText('Target Phone (+20...)');
    const message = screen.getByLabelText('Official message');
    fireEvent.change(phone, { target: { value: '+201000000001' } });
    fireEvent.change(message, { target: { value: 'Meeting reminder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(api.sendOfficialWhatsApp).toHaveBeenCalledExactlyOnceWith({ phone_number: '+201000000001', message: 'Meeting reminder' });
    await act(async () => { pending.reject(new Error('Message delivery failed')); });
    expect(screen.getByRole('status')).toHaveTextContent('Message delivery failed');
    expect(phone).toHaveValue('+201000000001');
    expect(message).toHaveValue('Meeting reminder');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(message).toHaveValue(''));
    expect(phone).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('Message sent');
  });

  it('supports QR errors and retries, closes the dialog on view changes, and guards role changes', async () => {
    vi.mocked(api.getWhatsAppQr).mockRejectedValueOnce(new Error('Pairing request failed'));
    const { rerender } = render(<WhatsAppAgentPage currentUser={admin} view="official" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pair account' }));
    expect(await screen.findByText('Pairing request failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh QR' }));
    expect(await screen.findByText('Ready to pair')).toBeInTheDocument();
    rerender(<WhatsAppAgentPage currentUser={admin} view="chat" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<WhatsAppAgentPage currentUser={admin} view="official" />);
    await screen.findByText('Organization account');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<WhatsAppAgentPage currentUser={{ ...admin, role: 'committee_hr_leader' }} view="official" />);
    expect(screen.getByRole('alert')).toHaveTextContent('available only');
    expect(screen.queryByText('Organization account')).not.toBeInTheDocument();
    expect(api.getWhatsAppStatus).toHaveBeenCalledTimes(2);
    expect(api.getWhatsAppQr).toHaveBeenCalledTimes(2);
  });
});
