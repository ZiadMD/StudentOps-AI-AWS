import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NotificationsPage } from '../components/NotificationsPage';
import { api } from '../api/client';
import { LanguageProvider } from '../context/LanguageContext';
import { ReminderItem, UserProfile } from '../types';

vi.mock('../api/client', () => ({
  api: {
    getReminders: vi.fn(),
  },
}));

const mockMemberUser: UserProfile = {
  id: 'usr_member_1',
  student_id: 'stu_media_1',
  full_name: 'Media Student',
  arabic_name: 'طالب الميديا',
  email: 'member@studentops.org',
  role: 'committee_member',
  team_id: 'team_media',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

const mockReminders: ReminderItem[] = [
  {
    id: 'rem_1',
    recipient_id: 'stu_media_1',
    recipient_name: 'Media Student',
    channel: 'whatsapp',
    message_content: 'Reminder: Submit your Social Media reel draft before 8 PM.',
    status: 'sent',
    sent_at: '2026-09-20T18:00:00Z',
    title: 'Task Submission Deadline',
  },
];

describe('NotificationsPage Member View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches reminders from API and renders them for committee_member without showing management compose panel', async () => {
    vi.mocked(api.getReminders).mockResolvedValue(mockReminders);

    render(
      <LanguageProvider>
        <NotificationsPage currentUser={mockMemberUser} />
      </LanguageProvider>
    );

    // Initial loading or api invocation
    expect(api.getReminders).toHaveBeenCalledTimes(1);

    // Wait for reminder to render
    await waitFor(() => {
      expect(screen.getByText('Task Submission Deadline')).toBeInTheDocument();
    });

    expect(screen.getByText('Reminder: Submit your Social Media reel draft before 8 PM.')).toBeInTheDocument();

    // Member should NOT see the "New Reminder" or "Quick Templates" management panels
    expect(screen.queryByRole('button', { name: /new reminder/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/quick templates/i)).not.toBeInTheDocument();
  });

  it('renders empty state when member has no reminders', async () => {
    vi.mocked(api.getReminders).mockResolvedValue([]);

    render(
      <LanguageProvider>
        <NotificationsPage currentUser={mockMemberUser} />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/no reminders/i)).toBeInTheDocument();
    });
  });
});
