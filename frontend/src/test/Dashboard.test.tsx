import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Dashboard } from '../components/Dashboard';
import { api } from '../api/client';
import type { UserProfile } from '../types';

vi.mock('../api/client', () => ({ api: {
  getStats: vi.fn(), getMeetings: vi.fn(), getEvents: vi.fn(), getScoreboard: vi.fn(),
} }));

const user: UserProfile = {
  id: 'usr_test', email: 'member@example.org', full_name: 'Test Member',
  role: 'member', is_active: true, created_at: '',
};
const props = { onNavigateToTab: vi.fn(), onSendChatQuery: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getStats).mockResolvedValue({ total_students: 2, present_today: 0,
    late_today: 0, absent_today: 0, attendance_rate_today: 0,
    upcoming_meetings_count: 0, pending_submissions_count: 0, recent_actions_count: 0 });
  vi.mocked(api.getMeetings).mockResolvedValue([]);
  vi.mocked(api.getEvents).mockResolvedValue([]);
  vi.mocked(api.getScoreboard).mockResolvedValue([]);
});

describe('Dashboard permissions and request states', () => {
  it.each(['member', 'committee_member'] as const)('does not request or link privileged data for %s', async role => {
    render(<Dashboard {...props} currentUser={{ ...user, role }} />);
    await screen.findByRole('heading', { name: 'Operations Overview' });
    expect(api.getScoreboard).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Member Evaluations' })).not.toBeInTheDocument();
    expect(screen.queryByText('Agent Audit Log')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Members')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending Reviews')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Operational metrics' })).getAllByRole('button')).toHaveLength(2);
  });

  it('fetches evaluations for authorized staff and refetches on role changes', async () => {
    const view = render(<Dashboard {...props} currentUser={user} />);
    await screen.findByRole('heading', { name: 'Operations Overview' });
    view.rerender(<Dashboard {...props} currentUser={{ ...user, role: 'hr_admin' }} />);
    await waitFor(() => expect(api.getScoreboard).toHaveBeenCalledOnce());
    await screen.findByText('Member Evaluations');
  });

  it('shows a loading state rather than zero metrics', () => {
    vi.mocked(api.getStats).mockReturnValue(new Promise(() => {}));
    render(<Dashboard {...props} currentUser={user} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading overview');
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('shows request failure and supports retry without fabricated empty metrics', async () => {
    vi.mocked(api.getStats).mockRejectedValueOnce(new Error('Service unavailable'));
    render(<Dashboard {...props} currentUser={user} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await screen.findByRole('heading', { name: 'Operations Overview' });
    expect(api.getStats).toHaveBeenCalledTimes(2);
  });

  it.each(['hr_admin', 'committee_head', 'team_lead'] as const)('preserves every overview navigation target for %s', async role => {
    render(<Dashboard {...props} currentUser={{ ...user, role, team_name: 'Design' }} />);
    await screen.findByRole('heading', { name: 'Operations Overview' });
    const targets = [
      [/Committee Members/, 'students'],
      [/Today's Attendance/, 'attendance'],
      [/Scheduled Events/, 'calendar'],
      [/Pending Reviews/, role === 'hr_admin' ? 'tasks' : 'task-reviews'],
      [/View Roster/, 'attendance'],
      [/Full Calendar/, 'calendar'],
      [/View All/, 'scoreboard'],
      [/Ask assistant/, 'chat'],
    ] as const;
    for (const [name, tab] of targets) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(props.onNavigateToTab).toHaveBeenLastCalledWith(tab);
    }
    expect(screen.getByText('Enrolled in Design')).toBeInTheDocument();
  });

  it.each([
    ['member', 'My Evaluation Summary', 'What are my current attendance and task evaluation scores?'],
    ['committee_head', 'Pending Submissions', 'Which members currently have pending task submissions awaiting review?'],
    ['hr_admin', 'At-Risk Members (< 70%)', 'Which students have an attendance rate below 70%?'],
  ] as const)('keeps the assistant action list functional for %s', async (role, title, query) => {
    render(<Dashboard {...props} currentUser={{ ...user, role }} />);
    const actions = await screen.findByRole('region', { name: 'Ask about your work' });
    expect(within(actions).getAllByRole('listitem')).toHaveLength(4);
    const action = within(actions).getByText(title).closest('button');
    expect(action).not.toBeNull();
    fireEvent.click(action!);
    expect(props.onSendChatQuery).toHaveBeenCalledWith(query);
  });

  it('renders factual attendance, future schedule counts and working meeting links', async () => {
    vi.mocked(api.getStats).mockResolvedValue({ total_students: 17, present_today: 8,
      late_today: 1, absent_today: 1, attendance_rate_today: 80,
      upcoming_meetings_count: 99, pending_submissions_count: 3, recent_actions_count: 2 });
    vi.mocked(api.getMeetings).mockResolvedValue([{
      id: 'meet_latest', title: 'Committee planning', meeting_code: 'PLAN-01', topic: '',
      start_time: '2026-01-01T10:00:00Z', end_time: '2026-01-01T11:00:00Z', duration_minutes: 60,
      meet_url: 'https://meet.google.com/example-session', status: 'COMPLETED',
      total_expected: 10, present_count: 8, late_count: 1, absent_count: 1, attendance: [],
    }]);
    const event = { event_type: 'meeting', end_time: '2099-01-01T11:00:00Z', location: '', is_mandatory: true };
    vi.mocked(api.getEvents).mockResolvedValue([
      { ...event, id: 'past', title: 'Past event', start_time: '2000-01-01T10:00:00Z' },
      { ...event, id: 'later', title: 'Later event', start_time: '2099-01-02T10:00:00Z' },
      { ...event, id: 'next', title: 'Next committee session', start_time: '2099-01-01T10:00:00Z', meet_url: 'https://meet.google.com/example-next' },
      { ...event, id: 'third', title: 'Third event', start_time: '2099-01-03T10:00:00Z' },
      { ...event, id: 'fourth', title: 'Fourth event', start_time: '2099-01-04T10:00:00Z' },
    ]);
    render(<Dashboard {...props} currentUser={{ ...user, role: 'hr_admin' }} />);
    const metrics = await screen.findByRole('region', { name: 'Operational metrics' });
    expect(within(metrics).getByRole('button', { name: /Total Members/ })).toHaveTextContent('17');
    expect(within(metrics).getByRole('button', { name: /Today's Attendance/ })).toHaveTextContent('80%8 Present · 1 Late · 1 Absent');
    expect(within(metrics).getByRole('button', { name: /Pending Reviews/ })).toHaveTextContent('3 tasks need grading');
    expect(within(metrics).getByRole('button', { name: /Scheduled Events/ })).toHaveTextContent('4Next: Next committee session');
    const schedule = screen.getByRole('region', { name: 'Upcoming Milestones & Deadlines' });
    expect(within(schedule).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent))
      .toEqual(['Next committee session', 'Later event', 'Third event']);
    expect(screen.queryByText('Past event')).not.toBeInTheDocument();
    expect(screen.queryByText('Fourth event')).not.toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Cohort Attendance (80%)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Meeting Link' })).toHaveAttribute('href', 'https://meet.google.com/example-session');
    expect(screen.getByRole('link', { name: 'Join' })).toHaveAttribute('href', 'https://meet.google.com/example-next');
  });
});
