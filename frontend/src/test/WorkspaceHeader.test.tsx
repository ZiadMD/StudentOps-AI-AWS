import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { NAV_ITEMS } from '../components/Sidebar';
import { WorkspaceHeader, type WorkspaceHeaderProps } from '../components/WorkspaceHeader';
import { ThemeProvider } from '../context/ThemeContext';
import type { EscalationRecord, TaskItem, UserProfile, UserRole } from '../types';

vi.mock('../api/client', () => ({ api: { getTasks: vi.fn(), getSlaEscalations: vi.fn() } }));

const user: UserProfile = {
  id: 'usr_test', email: 'member@example.test', full_name: 'Test Member',
  role: 'hr_admin', is_active: true, created_at: '2026-01-01T00:00:00Z',
};
const roles: UserRole[] = ['region_hr_head', 'hr_admin', 'committee_hr_leader', 'committee_hr_member', 'committee_head', 'team_lead', 'committee_member', 'member'];
const allowedFollowUpRoles: UserRole[] = ['region_hr_head', 'hr_admin', 'committee_hr_leader', 'committee_hr_member'];
const now = new Date('2026-09-17T12:00:00Z');

function task(id: string, deadline: string): TaskItem {
  return { id, title: id, deadline, task_number: 1, description: '', submission_count: 0, pending_count: 1 };
}
function followUp(id: string, overrides: Partial<EscalationRecord> = {}): EscalationRecord {
  return {
    id, student_id: `stu_${id}`, student_name: id, arabic_name: '', phone: '',
    hr_member_id: 'hr_test', hr_member_name: 'HR member', flagged_reason: 'Contact required',
    flagged_at: '2026-09-16T12:00:00Z', days_open: 1, status: 'OPEN', is_escalated: false,
    ...overrides,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mount(overrides: Partial<WorkspaceHeaderProps> = {}) {
  const props: WorkspaceHeaderProps = {
    currentUser: user, onNavigate: vi.fn(), onOpenNavigation: vi.fn(), isMobileSidebarOpen: false, ...overrides,
  };
  const view = render(<ThemeProvider><WorkspaceHeader {...props} /></ThemeProvider>);
  return { ...view, props };
}
function search(value: string) {
  const input = screen.getByRole('combobox', { name: 'Search pages' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  return input;
}
function openBell() {
  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
  return screen.getByRole('dialog', { name: 'Notifications' });
}
async function settle() {
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem('studentops_theme', 'light');
  vi.mocked(api.getTasks).mockResolvedValue([]);
  vi.mocked(api.getSlaEscalations).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.style.removeProperty('color-scheme');
});

describe('WorkspaceHeader search and actions', () => {
  it('uses a circular placeholder portrait and falls back to initials on image failure', () => {
    const { props } = mount();
    const profile = screen.getByRole('button', { name: 'My profile' });
    const portrait = within(profile).getByRole('img', { name: 'Temporary profile photo' });
    expect(portrait).toHaveClass('rounded-full', 'object-cover');
    fireEvent.error(portrait);
    expect(within(profile).queryByRole('img')).not.toBeInTheDocument();
    expect(within(profile).getByText('TM')).toBeInTheDocument();
    fireEvent.click(profile);
    expect(props.onNavigate).toHaveBeenCalledWith('profile');
  });

  it('renders only the hamburger and three icon actions, with 44px targets and no page heading', () => {
    const { props } = mount();
    const header = screen.getByRole('banner');
    expect(header).toHaveClass('sticky', 'top-0', 'z-30', 'h-14', 'md:grid');
    expect(screen.getByRole('combobox').parentElement).toHaveClass('md:col-start-2');
    expect(screen.getByRole('combobox')).toHaveClass('md:h-9');
    const buttons = within(header).getAllByRole('button');
    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      expect(button).toHaveClass('h-11', 'w-11');
      expect(button).toHaveAttribute('title', button.getAttribute('aria-label'));
      expect(button.textContent).toBe('');
    }
    expect(within(header).queryByRole('heading')).not.toBeInTheDocument();
    expect(within(header).queryByText(/Organization|breadcrumb/i)).not.toBeInTheDocument();
    const hamburger = screen.getByRole('button', { name: 'Open navigation' });
    expect(hamburger).toHaveClass('md:hidden');
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(hamburger);
    expect(props.onOpenNavigation).toHaveBeenCalledOnce();
    expect(api.getTasks).not.toHaveBeenCalled();
    expect(api.getSlaEscalations).not.toHaveBeenCalled();
  });

  it('reflects the mobile sidebar expanded state', () => {
    mount({ isMobileSidebarOpen: true });
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'true');
  });

  it.each(['ctrlKey', 'metaKey'] as const)('%s+K focuses header search without opening navigation or fetching', modifier => {
    const { props } = mount();
    fireEvent.keyDown(window, { key: 'K', [modifier]: true });
    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(screen.getByRole('listbox', { name: 'Pages' })).toBeInTheDocument();
    expect(props.onOpenNavigation).not.toHaveBeenCalled();
    expect(props.onNavigate).not.toHaveBeenCalled();
    expect(api.getTasks).not.toHaveBeenCalled();
  });

  it.each(roles)('only offers NAV_ITEMS allowed for %s, excluding profile', role => {
    const { props } = mount({ currentUser: { ...user, role } });
    search('');
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(
      NAV_ITEMS.filter(item => item.id !== 'profile' && item.roles.includes(role)).map(item => item.label),
    );
    expect(props.onNavigate).not.toHaveBeenCalled();
    search('profile');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByText('No matching pages.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /profile/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'My profile' }));
    expect(props.onNavigate).toHaveBeenCalledWith('profile');
  });

  it.each([
    [' calendar ', 'Schedule & Calendar', 'calendar'], ['schedule', 'Schedule & Calendar', 'calendar'],
    ['WHATSAPP', 'Inbox', 'inbox'], ['conversations', 'Inbox', 'inbox'],
    ['escalation', 'Follow-ups', 'follow-ups'], ['follow-ups', 'Follow-ups', 'follow-ups'],
    ['evaluations', 'Evaluations', 'scoreboard'],
  ])('matches %s and navigates on option click', (query, label, tab) => {
    const { props } = mount();
    const input = search(query);
    const option = screen.getByRole('option', { name: label });
    expect(option.tagName).toBe('BUTTON');
    fireEvent.click(option);
    expect(props.onNavigate).toHaveBeenCalledExactlyOnceWith(tab);
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not expose privileged aliases to members', () => {
    mount({ currentUser: { ...user, role: 'member' } });
    for (const value of ['whatsapp', 'conversations', 'escalation', 'audit']) {
      search(value);
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    }
  });

  it('supports arrow selection, wraparound, Enter and Escape with valid ARIA references', () => {
    const { props } = mount();
    const input = search('');
    const options = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onNavigate).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(options.at(-1)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onNavigate).toHaveBeenCalledExactlyOnceWith('chat');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onNavigate).toHaveBeenCalledTimes(1);
  });

  it('resets selection after typing and handles arrows and Enter on an empty result', () => {
    const { props } = mount();
    const input = search('');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    search('not a page');
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter']) fireEvent.keyDown(input, { key });
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  it('closes search on outside pointer interaction and blur, not on internal interaction', () => {
    mount();
    const input = search('');
    fireEvent.pointerDown(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.focus(input);
    fireEvent.blur(input, { relatedTarget: screen.getByRole('button', { name: 'My profile' }) });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('toggles the actual ThemeProvider in both directions', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('studentops_theme')).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement).not.toHaveClass('dark');
  });
});

describe('WorkspaceHeader deadline dropdown', () => {
  it('fetches only after click, focuses a responsive panel and shows honest loading and empty states', async () => {
    const pending = deferred<TaskItem[]>();
    vi.mocked(api.getTasks).mockReturnValue(pending.promise);
    mount();
    expect(api.getTasks).not.toHaveBeenCalled();
    const panel = openBell();
    expect(panel).toHaveFocus();
    expect(panel).toHaveClass('fixed', 'top-16', 'lg:absolute', 'lg:right-0', 'lg:top-full', 'max-w-[24rem]');
    expect(screen.getByText('Upcoming task deadlines and open follow-ups.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(api.getTasks).toHaveBeenCalledOnce();
    expect(api.getSlaEscalations).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve([]); });
    expect(screen.getByRole('status')).toHaveTextContent('0 records');
    expect(screen.getByText('No task deadlines in the next 7 days or open follow-ups.')).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(/unread|\bnew\b/i);
    expect(screen.getByRole('button', { name: 'Notifications' }).textContent).toBe('');
  });

  it.each(roles)('fetches tasks for %s and gates the escalation API and link separately from NAV_ITEMS', async role => {
    mount({ currentUser: { ...user, role } });
    openBell();
    await settle();
    expect(api.getTasks).toHaveBeenCalledOnce();
    expect(api.getSlaEscalations).toHaveBeenCalledTimes(allowedFollowUpRoles.includes(role) ? 1 : 0);
    expect(screen.getByRole('button', { name: 'View tasks' })).toBeInTheDocument();
    const link = screen.queryByRole('button', { name: 'View follow-ups' });
    if (allowedFollowUpRoles.includes(role)) expect(link).toBeInTheDocument();
    else {
      expect(link).not.toBeInTheDocument();
      expect(screen.getByText('No task deadlines in the next 7 days.')).toBeInTheDocument();
    }
  });

  it('shows real records only, includes date boundaries and case-insensitive follow-ups, sorts chronologically', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(api.getTasks).mockResolvedValue([
      task('Last included', '2026-09-24T12:00:00Z'), task('First included', '2026-09-17T12:00:00Z'),
      task('Later included', '2026-09-18T12:00:00'), task('Expired', '2026-09-17T11:59:59Z'),
      task('Too far away', '2026-09-24T12:00:01Z'), task('Invalid deadline', 'invalid'),
    ]);
    vi.mocked(api.getSlaEscalations).mockResolvedValue([
      followUp('Open member', { status: 'open' }),
      followUp('Escalated member', { status: 'eScAlAtEd', flagged_at: '2026-09-15T12:00:00Z' }),
      followUp('Flagged member', { status: 'OTHER', is_escalated: true, flagged_at: '2026-09-14T12:00:00Z' }),
      followUp('Closed member', { status: 'CLOSED' }),
      followUp('Unknown date', { flagged_at: 'invalid' }),
    ]);
    const { props } = mount();
    openBell();
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('7 records');
    const rows = screen.getAllByRole('listitem');
    expect(rows.map(row => within(row).getByRole('button').firstElementChild?.textContent)).toEqual([
      'Flagged member', 'Escalated member', 'Open member', 'First included', 'Later included', 'Last included', 'Unknown date',
    ]);
    for (const excluded of ['Expired', 'Too far away', 'Invalid deadline', 'Closed member']) expect(screen.queryByText(excluded)).not.toBeInTheDocument();
    expect(screen.getAllByText('Contact required', { exact: false })).toHaveLength(4);
    expect(screen.getByText(/Date unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Later included/ }));
    expect(props.onNavigate).toHaveBeenCalledWith('tasks');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['tasks', 'follow-ups'] as const)('navigates the full %s panel and closes the dropdown', async tab => {
    const { props } = mount();
    openBell();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: `View ${tab}` }));
    expect(props.onNavigate).toHaveBeenCalledExactlyOnceWith(tab);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveFocus();
  });

  it('opens follow-ups when a real follow-up row is selected', async () => {
    vi.mocked(api.getSlaEscalations).mockResolvedValue([followUp('Member requiring contact')]);
    const { props } = mount();
    openBell();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Member requiring contact/ }));
    expect(props.onNavigate).toHaveBeenCalledExactlyOnceWith('follow-ups');
  });

  it.each(['getTasks', 'getSlaEscalations'] as const)('shows a retryable error when %s fails rather than a false empty result', async method => {
    vi.mocked(api[method]).mockRejectedValueOnce(new Error('Unavailable'));
    mount();
    openBell();
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
    expect(screen.queryByText('0 records')).not.toBeInTheDocument();
    expect(screen.queryByText(/No task deadlines/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    await settle();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 records');
    expect(api[method]).toHaveBeenCalledTimes(2);
  });

  it('dismisses on Escape, outside click and trigger click, returning focus to the bell', async () => {
    mount();
    const bell = screen.getByRole('button', { name: 'Notifications' });
    for (const dismiss of [() => fireEvent.keyDown(document, { key: 'Escape' }), () => fireEvent.click(document.body), () => fireEvent.click(bell)]) {
      openBell();
      await settle();
      fireEvent.click(screen.getByText('Upcoming task deadlines and open follow-ups.'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      dismiss();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(bell).toHaveAttribute('aria-expanded', 'false');
      expect(bell).toHaveFocus();
    }
  });

  it('closes search when the bell opens and closes the bell when the search shortcut is used', async () => {
    mount();
    search('tasks');
    openBell();
    await settle();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('refreshes every 60 seconds only while open, recomputes the date window and cleans up timers', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(api.getTasks).mockResolvedValue([task('Due now', now.toISOString())]);
    const view = mount({ currentUser: { ...user, role: 'member' } });
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(api.getTasks).not.toHaveBeenCalled();
    vi.setSystemTime(now);
    openBell();
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('1 record');
    await act(async () => { vi.advanceTimersByTime(59_999); });
    expect(api.getTasks).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(api.getTasks).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('0 records');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { vi.advanceTimersByTime(120_000); });
    expect(api.getTasks).toHaveBeenCalledTimes(2);
    openBell();
    await settle();
    expect(api.getTasks).toHaveBeenCalledTimes(3);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not overlap slow refresh requests', async () => {
    vi.useFakeTimers();
    const pending = deferred<TaskItem[]>();
    vi.mocked(api.getTasks).mockReturnValue(pending.promise);
    mount();
    openBell();
    await act(async () => { vi.advanceTimersByTime(180_000); });
    expect(api.getTasks).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve([]); });
  });

  it('ignores stale results after closing and reopening', async () => {
    const pending = deferred<EscalationRecord[]>();
    vi.mocked(api.getSlaEscalations).mockReturnValueOnce(pending.promise);
    mount();
    openBell();
    fireEvent.keyDown(document, { key: 'Escape' });
    openBell();
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('0 records');
    await act(async () => { pending.resolve([followUp('Stale member')]); });
    expect(screen.queryByText('Stale member')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 records');
  });

  it('discards previous-user requests and data when the current user or role changes', async () => {
    const pending = deferred<EscalationRecord[]>();
    vi.mocked(api.getSlaEscalations).mockReturnValueOnce(pending.promise);
    const { rerender, props } = mount();
    openBell();
    rerender(<ThemeProvider><WorkspaceHeader {...props} currentUser={{ ...user, id: 'usr_other', role: 'member' }} /></ThemeProvider>);
    await settle();
    await act(async () => { pending.resolve([followUp('Previous user record')]); });
    expect(screen.queryByText('Previous user record')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View follow-ups' })).not.toBeInTheDocument();
    expect(api.getTasks).toHaveBeenCalledTimes(2);
    expect(api.getSlaEscalations).toHaveBeenCalledTimes(1);
  });

  it('ignores late errors after unmount and removes keyboard listeners', async () => {
    const pending = deferred<TaskItem[]>();
    vi.mocked(api.getTasks).mockReturnValueOnce(pending.promise);
    const view = mount();
    const input = screen.getByRole('combobox');
    const focus = vi.spyOn(input, 'focus');
    openBell();
    view.unmount();
    await act(async () => { pending.reject(new Error('Late failure')); });
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(focus).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
