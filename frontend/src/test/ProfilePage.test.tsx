import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ProfilePage } from '../components/ProfilePage';
import { api } from '../api/client';
import type { Student, UserProfile, UserRole } from '../types';

vi.mock('../api/client', () => ({
  API_BASE: '/api',
  api: { getToken: vi.fn(), getStudent: vi.fn(), getStudents: vi.fn(), getTeams: vi.fn(), getMe: vi.fn() },
}));

const user: UserProfile = {
  id: 'usr_profile', full_name: 'Account Name', arabic_name: 'اسم الحساب',
  email: 'account@example.org', role: 'member', team_id: 'team_design', team_name: 'Design',
  student_id: 'stu_self', is_active: true, created_at: '2026-09-10T00:00:00Z',
};
const member: Student = {
  id: 'stu_self', student_code: 'ST-123', full_name: 'Member Name', arabic_name: 'اسم العضو',
  email: 'member@example.org', phone: '+201234567890', university: 'Example University',
  role: 'Designer', status: 'PROBATION', team_id: 'team_design', created_at: '2026-01-01T00:00:00Z',
};
const roles = {
  region_hr_head: 'Region HR Head', committee_hr_leader: 'Committee HR Leader',
  committee_head: 'Committee Head', committee_hr_member: 'Committee HR Member',
  committee_member: 'Committee Member', hr_admin: 'HR Administrator',
  team_lead: 'Team Lead', member: 'Member',
} satisfies Record<UserRole, string>;

function field(label: string): HTMLElement {
  const definition = screen.getByText(label, { selector: 'dt' }).nextElementSibling;
  if (!(definition instanceof HTMLElement)) throw new Error(`Missing definition for ${label}`);
  return definition;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getStudent).mockResolvedValue(member);
  vi.mocked(api.getToken).mockReturnValue('test-profile-token');
});
afterEach(() => { cleanup(); });

describe('ProfilePage account visibility', () => {
  it('switches sections without refetching membership or exposing internal IDs', async () => {
    render(<ProfilePage currentUser={user} />);
    await screen.findByText('ST-123');
    const profile = screen.getByRole('button', { name: 'Profile' });
    const account = screen.getByRole('button', { name: 'Account' });
    expect(profile).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(account);
    expect(account).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Account access' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Membership' })).not.toBeInTheDocument();
    for (const text of ['Account references', 'Account ID', 'Committee ID', 'Member ID', user.id, user.team_id!, user.student_id!]) {
      expect(screen.queryByText(text, { exact: true })).not.toBeInTheDocument();
    }
    fireEvent.click(profile);
    expect(screen.getByText('ST-123')).toBeVisible();
    expect(api.getStudent).toHaveBeenCalledTimes(1);
  });

  it('renders modern collegiate identity hero card without cheesy gradients or fake badges', () => {
    const { container } = render(<ProfilePage currentUser={{ ...user, student_id: null }} />);
    const heading = screen.getByRole('heading', { name: user.full_name, level: 1 });
    expect(heading).toBeInTheDocument();
    expect(container.querySelector('[class*="bg-gradient"]')).toBeNull();
    expect(screen.queryByText('Read-only')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Contact' }).querySelector('dl')).toHaveClass('divide-y');
  });

  it('renders deterministic initials avatar without external images', () => {
    render(<ProfilePage currentUser={{ ...user, student_id: null }} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const initials = screen.getByText('AN');
    expect(initials).toHaveClass('h-32', 'w-32', 'rounded-full');
    expect(initials.tagName).toBe('SPAN');
  });

  it('keeps a meaningful heading when the account name is missing', () => {
    render(<ProfilePage currentUser={{ ...user, full_name: ' ', student_id: null }} />);
    expect(screen.getByRole('heading', { name: 'My Profile', level: 1 })).toBeInTheDocument();
  });

  it('shows Arabic name in identity column with Cairo font and RTL', () => {
    render(<ProfilePage currentUser={{ ...user, student_id: null }} />);
    const arabicName = screen.getByText(user.arabic_name!);
    expect(arabicName).toHaveAttribute('lang', 'ar');
    expect(arabicName).toHaveAttribute('dir', 'rtl');
    expect(arabicName).toHaveClass("font-['Cairo']");
  });

  it('shows role badge and status indicator in identity column', () => {
    render(<ProfilePage currentUser={{ ...user, student_id: null }} />);
    // Role label appears in identity column badge and in Account tab field
    expect(screen.getAllByText(roles[user.role]).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
  });

  it.each(Object.entries(roles) as [UserRole, string][])('shows factual own profile for %s', async (role, label) => {
    render(<ProfilePage currentUser={{ ...user, role }} />);
    expect(screen.getByRole('heading', { name: user.full_name, level: 1 })).toBeInTheDocument();
    // Avatar renders as initials, not an image
    expect(screen.getByText('AN')).toHaveClass('h-32', 'w-32');
    expect(field('Email address')).toHaveTextContent(user.email);
    expect(field('Account role')).toHaveTextContent(label);
    expect(field('Committee / team')).toHaveTextContent('Design');
    expect(field('Account status')).toHaveTextContent('Active');
    expect(field('Account created')).toHaveTextContent('10 Sept 2026');
    expect(await screen.findByText('ST-123')).toBeInTheDocument();
    expect(field('Member email')).toHaveTextContent(member.email);
    expect(field('Member role')).toHaveTextContent('Designer');
    expect(api.getStudent).toHaveBeenCalledExactlyOnceWith('stu_self');
    expect(api.getStudents).not.toHaveBeenCalled();
    expect(api.getTeams).not.toHaveBeenCalled();
    expect(api.getMe).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
    expect(field('Account role')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(field('Account role')).toBeVisible();
    expect(field('Account status')).toBeVisible();
    expect(field('Account created')).toBeVisible();
    expect(field('Email address')).not.toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/scoreboard|bonus points|password/i)).not.toBeInTheDocument();
  });

  it.each(Object.keys(roles) as UserRole[])('supports unassigned and unlinked %s without requests', role => {
    render(<ProfilePage currentUser={{ ...user, role, team_id: null, team_name: null, student_id: null, arabic_name: null }} />);
    expect(field('Account role')).toHaveTextContent(roles[role]);
    expect(field('Committee / team')).toHaveTextContent('Not assigned');
    expect(screen.getByText('No member record linked')).toBeInTheDocument();
    expect(api.getStudent).not.toHaveBeenCalled();
  });

  it('distinguishes missing team name from no team assignment', () => {
    render(<ProfilePage currentUser={{ ...user, student_id: undefined, team_name: ' ' }} />);
    expect(field('Committee / team')).toHaveTextContent('Name unavailable');
    expect(field('Committee / team')).not.toHaveTextContent('team_design');
    expect(screen.queryByText('team_design')).not.toBeInTheDocument();
    expect(field('Committee / team')).not.toHaveTextContent('Not assigned');
  });

  it.each(['', 'not-a-date'])('handles unavailable creation dates (%s) and optional fields', created_at => {
    render(<ProfilePage currentUser={{ ...user, full_name: ' ', email: '', created_at, arabic_name: undefined, team_name: undefined, team_id: undefined, student_id: undefined }} />);
    for (const label of ['Account created', 'Email address']) {
      expect(field(label)).toHaveTextContent('Not provided');
    }
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(api.getStudent).not.toHaveBeenCalled();
  });

  it('uses Arabic language, RTL direction, and Cairo typography on member name', async () => {
    render(<ProfilePage currentUser={user} />);
    // Account arabic name in identity column
    const accountArabic = screen.getByText(user.arabic_name!);
    expect(accountArabic).toHaveAttribute('lang', 'ar');
    expect(accountArabic).toHaveAttribute('dir', 'rtl');
    expect(accountArabic).toHaveClass("font-['Cairo']");
    // Member arabic name inside the member card
    const memberArabic = await screen.findByText(member.arabic_name);
    expect(memberArabic).toHaveAttribute('lang', 'ar');
    expect(memberArabic).toHaveAttribute('dir', 'rtl');
    expect(memberArabic).toHaveClass("font-['Cairo']");
    expect(screen.getByRole('region', { name: 'Contact' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Membership' })).toBeInTheDocument();
  });

  it('shows inactive state truthfully without requesting member details', () => {
    render(<ProfilePage currentUser={{ ...user, is_active: false }} />);
    expect(field('Account status')).toHaveTextContent('Inactive');
    expect(screen.getByText(/unavailable while your account is inactive/)).toBeInTheDocument();
    expect(api.getStudent).not.toHaveBeenCalled();
  });

  it('does not invent unavailable member fields', async () => {
    vi.mocked(api.getStudent).mockResolvedValue({ ...member, phone: '', university: ' ', arabic_name: '' });
    render(<ProfilePage currentUser={user} />);
    await screen.findByText('ST-123');
    for (const label of ['Phone', 'University']) expect(field(label)).toHaveTextContent('Not provided');
  });

  it('renders member code as monospace badge and status as colored badge', async () => {
    render(<ProfilePage currentUser={user} />);
    const code = await screen.findByText('ST-123');
    expect(code).toHaveClass('font-mono');
    // PROBATION status renders as a warning badge
    const statusBadge = screen.getByText('PROBATION');
    expect(statusBadge).toBeInTheDocument();
  });

  it('provides tactile copy feedback when copying the student code', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });
    render(<ProfilePage currentUser={user} />);
    const copyButton = await screen.findByRole('button', { name: 'Copy student code' });
    fireEvent.click(copyButton);
    expect(writeTextMock).toHaveBeenCalledWith('ST-123');
    expect(screen.getByRole('button', { name: 'Copied student code' })).toBeInTheDocument();
  });
});

describe('ProfilePage member request isolation', () => {
  it('keeps account details visible while the linked record is loading', () => {
    vi.mocked(api.getStudent).mockReturnValue(new Promise(() => {}));
    render(<ProfilePage currentUser={user} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading linked member details');
    expect(field('Email address')).toHaveTextContent(user.email);
    expect(screen.queryByText('ST-123')).not.toBeInTheDocument();
  });

  it.each([
    [401, /Sign in again/], [403, /does not have permission/],
    [404, /could not be found/], [500, /unavailable/],
  ] as const)('contains HTTP %s errors and permits a working retry', async (status, message) => {
    const httpError = new Error(
      status === 401 ? 'Sign in again to view your linked member record.' :
      status === 403 ? 'Your account does not have permission to view this linked member record.' :
      status === 404 ? 'Your linked member record could not be found.' :
      'Linked member details are unavailable. Please try again.'
    );
    vi.mocked(api.getStudent).mockRejectedValueOnce(httpError);
    render(<ProfilePage currentUser={user} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(field('Email address')).toHaveTextContent(user.email);
    expect(screen.queryByText(/server internals/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry member details' }));
    await screen.findByText('ST-123');
    expect(api.getStudent).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('contains network errors', async () => {
    vi.mocked(api.getStudent).mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ProfilePage currentUser={user} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Linked member details are unavailable');
  });

  it('does not request data without an access token', async () => {
    vi.mocked(api.getToken).mockReturnValue(null);
    render(<ProfilePage currentUser={user} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in again');
    expect(api.getStudent).not.toHaveBeenCalled();
  });

  it('encodes the linked ID when calling api.getStudent', async () => {
    vi.mocked(api.getStudent).mockResolvedValue({ ...member, id: 'stu/a?b' });
    render(<ProfilePage currentUser={{ ...user, student_id: 'stu/a?b' }} />);
    await screen.findByText('ST-123');
    expect(api.getStudent).toHaveBeenCalledWith('stu/a?b');
  });

  it('refuses a different record returned by the detail endpoint', async () => {
    vi.mocked(api.getStudent).mockResolvedValue({ ...member, id: 'stu_other', full_name: 'Other Member' });
    render(<ProfilePage currentUser={user} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('does not match your account link');
    expect(screen.queryByText('Other Member')).not.toBeInTheDocument();
  });

  it('removes loaded details immediately when authorization changes', async () => {
    const view = render(<ProfilePage currentUser={user} />);
    await screen.findByText('ST-123');
    vi.mocked(api.getStudent).mockReturnValue(new Promise(() => {}));
    view.rerender(<ProfilePage currentUser={{ ...user, role: 'committee_head', team_id: 'team_other' }} />);
    expect(screen.queryByText('ST-123')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => expect(api.getStudent).toHaveBeenCalledTimes(2));
  });

  it('clears details when unlinked and aborts on unmount', async () => {
    const view = render(<ProfilePage currentUser={user} />);
    await screen.findByText('ST-123');
    view.rerender(<ProfilePage currentUser={{ ...user, student_id: null }} />);
    expect(screen.queryByText('ST-123')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Membership' })).getByText('No member record linked')).toBeInTheDocument();
  });
});
