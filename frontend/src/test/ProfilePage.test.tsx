import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ProfilePage } from '../components/ProfilePage';
import { api } from '../api/client';
import type { Student, UserProfile, UserRole } from '../types';

vi.mock('../api/client', () => ({
  API_BASE: '/api',
  api: { getToken: vi.fn(), getStudents: vi.fn(), getTeams: vi.fn(), getMe: vi.fn() },
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
const fetchMock = vi.fn<typeof fetch>();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

function field(label: string): HTMLElement {
  const definition = screen.getByText(label, { selector: 'dt' }).nextElementSibling;
  if (!(definition instanceof HTMLElement)) throw new Error(`Missing definition for ${label}`);
  return definition;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(reply(member));
  vi.mocked(api.getToken).mockReturnValue('test-profile-token');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ProfilePage account visibility', () => {
  it('switches sections without refetching membership and collapses account references', async () => {
    render(<ProfilePage currentUser={user} />);
    await screen.findByText('ST-123');
    const profile = screen.getByRole('button', { name: 'Profile' });
    const settings = screen.getByRole('button', { name: 'Account settings' });
    expect(profile).toHaveAttribute('aria-pressed', 'true');
    expect(field('Account ID')).not.toBeVisible();
    fireEvent.click(settings);
    expect(settings).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Account access' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Linked member record' })).not.toBeInTheDocument();
    const references = screen.getByText('Account references').closest('details');
    expect(references).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Account references'));
    expect(references).toHaveAttribute('open');
    expect(field('Account ID')).toBeVisible();
    fireEvent.click(profile);
    expect(screen.getByText('ST-123')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses an unboxed identity column without a decorative banner', () => {
    const { container } = render(<ProfilePage currentUser={{ ...user, student_id: null }} />);
    const identity = screen.getByRole('heading', { name: user.full_name, level: 1 }).closest('header');
    expect(identity).toHaveClass('lg:sticky', 'lg:self-start');
    expect(identity).not.toHaveClass('shadow-sm', 'bg-white', 'rounded-xl');
    expect(container.querySelector('[class*="bg-gradient"]')).toBeNull();
    expect(screen.queryByText('Read-only')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Personal details' }).querySelector('dl')).toHaveClass('divide-y');
  });

  it('falls back to initials when the temporary portrait cannot load', () => {
    render(<ProfilePage currentUser={{ ...user, student_id: null }} />);
    fireEvent.error(screen.getByRole('img', { name: 'Temporary profile photo' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('AN')).toHaveClass('h-32', 'w-32', 'rounded-full');
  });

  it('keeps a meaningful heading when the account name is missing', () => {
    render(<ProfilePage currentUser={{ ...user, full_name: ' ', student_id: null }} />);
    expect(screen.getByRole('heading', { name: 'My Profile', level: 1 })).toBeInTheDocument();
  });

  it.each(Object.entries(roles) as [UserRole, string][])('shows factual own profile for %s', async (role, label) => {
    render(<ProfilePage currentUser={{ ...user, role }} />);
    expect(screen.getByRole('heading', { name: user.full_name, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Temporary profile photo' })).toHaveClass('h-32', 'w-32');
    expect(field('Full name')).toHaveTextContent(user.full_name);
    expect(field('Email address')).toHaveTextContent(user.email);
    expect(field('Account role')).toHaveTextContent(label);
    expect(field('Committee / team')).toHaveTextContent('Design');
    expect(field('Account status')).toHaveTextContent('Active');
    expect(field('Account created')).toHaveTextContent('10 Sept 2026');
    expect(await screen.findByText('ST-123')).toBeInTheDocument();
    expect(field('Member name')).toHaveTextContent(member.full_name);
    expect(field('Member email')).toHaveTextContent(member.email);
    expect(field('Membership status')).toHaveTextContent('PROBATION');
    expect(field('Member role')).toHaveTextContent('Designer');
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/students/stu_self', {
      headers: { Authorization: 'Bearer test-profile-token' }, signal: expect.any(AbortSignal),
    });
    expect(api.getStudents).not.toHaveBeenCalled();
    expect(api.getTeams).not.toHaveBeenCalled();
    expect(api.getMe).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(field('Account role')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Account settings' }));
    expect(field('Account role')).toBeVisible();
    expect(field('Account status')).toBeVisible();
    expect(field('Account created')).toBeVisible();
    expect(field('Full name')).not.toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/scoreboard|bonus points|password/i)).not.toBeInTheDocument();
  });

  it.each(Object.keys(roles) as UserRole[])('supports unassigned and unlinked %s without requests', role => {
    render(<ProfilePage currentUser={{ ...user, role, team_id: null, team_name: null, student_id: null, arabic_name: null }} />);
    expect(field('Account role')).toHaveTextContent(roles[role]);
    expect(field('Committee / team')).toHaveTextContent('Not assigned');
    expect(field('Arabic name')).toHaveTextContent('Not provided');
    expect(screen.getByText('No member record linked')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('distinguishes missing team name from no team assignment', () => {
    render(<ProfilePage currentUser={{ ...user, student_id: undefined, team_name: ' ' }} />);
    expect(field('Committee / team')).toHaveTextContent('Name unavailable');
    expect(field('Committee / team')).not.toHaveTextContent('team_design');
    expect(field('Committee ID')).toHaveTextContent('team_design');
    expect(field('Committee / team')).not.toHaveTextContent('Not assigned');
  });

  it.each(['', 'not-a-date'])('handles unavailable creation dates (%s) and optional fields', created_at => {
    render(<ProfilePage currentUser={{ ...user, full_name: ' ', email: '', created_at, arabic_name: undefined, team_name: undefined, team_id: undefined, student_id: undefined }} />);
    for (const label of ['Account created', 'Full name', 'Email address', 'Arabic name']) {
      expect(field(label)).toHaveTextContent('Not provided');
    }
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses Arabic language, RTL direction, and Cairo typography', async () => {
    render(<ProfilePage currentUser={user} />);
    for (const name of [user.arabic_name!, member.arabic_name]) {
      const text = await screen.findByText(name);
      expect(text).toHaveAttribute('lang', 'ar');
      expect(text).toHaveAttribute('dir', 'rtl');
      expect(text).toHaveClass("font-['Cairo']");
    }
    expect(screen.getByRole('region', { name: 'Personal details' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Linked member record' })).toBeInTheDocument();
  });

  it('shows inactive state truthfully without requesting member details', () => {
    render(<ProfilePage currentUser={{ ...user, is_active: false }} />);
    expect(field('Account status')).toHaveTextContent('Inactive');
    expect(screen.getByText(/unavailable while your account is inactive/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not invent unavailable member fields', async () => {
    fetchMock.mockResolvedValue(reply({ ...member, phone: '', university: ' ', arabic_name: '' }));
    render(<ProfilePage currentUser={user} />);
    await screen.findByText('ST-123');
    for (const label of ['Phone', 'University', 'Arabic member name']) expect(field(label)).toHaveTextContent('Not provided');
  });
});

describe('ProfilePage member request isolation', () => {
  it('keeps account details visible while the linked record is loading', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<ProfilePage currentUser={user} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading linked member details');
    expect(field('Email address')).toHaveTextContent(user.email);
    expect(screen.queryByText('ST-123')).not.toBeInTheDocument();
  });

  it.each([
    [401, /Sign in again/], [403, /does not have permission/],
    [404, /could not be found/], [500, /unavailable/],
  ] as const)('contains HTTP %s errors and permits a working retry', async (status, message) => {
    fetchMock.mockResolvedValueOnce(reply({ detail: 'Do not echo server internals' }, status));
    render(<ProfilePage currentUser={user} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(field('Full name')).toHaveTextContent(user.full_name);
    expect(screen.queryByText(/server internals/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry member details' }));
    await screen.findByText('ST-123');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('contains network errors', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ProfilePage currentUser={user} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Linked member details are unavailable');
  });

  it('does not request data without an access token', async () => {
    vi.mocked(api.getToken).mockReturnValue(null);
    render(<ProfilePage currentUser={user} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in again');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('encodes the linked ID rather than using an email or list lookup', async () => {
    fetchMock.mockResolvedValue(reply({ ...member, id: 'stu/a?b' }));
    render(<ProfilePage currentUser={{ ...user, student_id: 'stu/a?b' }} />);
    await screen.findByText('ST-123');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/students/stu%2Fa%3Fb');
  });

  it('refuses a different record returned by the detail endpoint', async () => {
    fetchMock.mockResolvedValue(reply({ ...member, id: 'stu_other', full_name: 'Other Member' }));
    render(<ProfilePage currentUser={user} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('does not match your account link');
    expect(screen.queryByText('Other Member')).not.toBeInTheDocument();
  });

  it('removes loaded details immediately when authorization changes', async () => {
    const view = render(<ProfilePage currentUser={user} />);
    await screen.findByText('ST-123');
    fetchMock.mockReturnValue(new Promise(() => {}));
    view.rerender(<ProfilePage currentUser={{ ...user, role: 'committee_head', team_id: 'team_other' }} />);
    expect(screen.queryByText('ST-123')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('aborts and ignores a late response after the account changes', async () => {
    let resolveOld!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const view = render(<ProfilePage currentUser={user} />);
    const signal = fetchMock.mock.calls[0][1]?.signal;
    view.rerender(<ProfilePage currentUser={{ ...user, id: 'usr_other', full_name: 'New Account', student_id: 'stu_new' }} />);
    expect(signal?.aborted).toBe(true);
    // The default response is mismatched for the new account, so no old record is shown.
    await screen.findByRole('alert');
    await act(async () => resolveOld(reply(member)));
    expect(field('Full name')).toHaveTextContent('New Account');
    expect(screen.queryByText('ST-123')).not.toBeInTheDocument();
  });

  it('clears details when unlinked and aborts on unmount', async () => {
    const view = render(<ProfilePage currentUser={user} />);
    await screen.findByText('ST-123');
    view.rerender(<ProfilePage currentUser={{ ...user, student_id: null }} />);
    expect(screen.queryByText('ST-123')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Linked member record' })).getByText('No member record linked')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    view.rerender(<ProfilePage currentUser={user} />);
    view.unmount();
    expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(true);
  });
});
