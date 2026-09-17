import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NAV_GROUPS, NAV_ITEMS, Sidebar, Tab, Role } from '../components/Sidebar';
import { UserProfile } from '../types';

const mockUser: UserProfile = {
  id: 'user-1',
  full_name: 'Demo User',
  arabic_name: 'مستخدم تجريبي',
  email: 'demo@studentops.org',
  role: 'committee_member',
  team_id: 'team-1',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

describe('Sidebar role-based navigation gating', () => {
  const defaultProps = {
    activeTab: 'dashboard' as Tab,
    setActiveTab: vi.fn(),
    onLogout: vi.fn(),
    isMobileOpen: false,
    setIsMobileOpen: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it.each<Role>([
    'region_hr_head', 'hr_admin', 'committee_hr_leader', 'committee_head',
    'committee_hr_member', 'team_lead', 'committee_member', 'member',
  ])('scopes separate communication routes for %s', role => {
    render(<Sidebar {...defaultProps} role={role} />);
    const canCommunicate = role !== 'committee_member' && role !== 'member';
    const canConfigure = role === 'region_hr_head' || role === 'hr_admin';
    for (const [id, label, allowed] of [
      ['inbox', 'Inbox', canCommunicate],
      ['follow-ups', 'Follow-ups', canCommunicate],
      ['channel-settings', 'Channel settings', canConfigure],
    ] as const) {
      expect(NAV_ITEMS.find(item => item.id === id)?.roles.includes(role)).toBe(allowed);
      if (allowed) expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      else expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    expect(Boolean(screen.queryByRole('region', { name: 'Settings' }))).toBe(canConfigure);
    expect(Boolean(screen.queryByRole('region', { name: 'Operations & automation' }))).toBe(canCommunicate);
    expect(NAV_ITEMS.find(item => item.id === 'profile')?.roles).toContain(role);
    expect(screen.queryByRole('button', { name: /profile/i })).not.toBeInTheDocument();
  });

  it('groups operations separately from channel settings without a legacy or profile entry', () => {
    render(<Sidebar {...defaultProps} role="hr_admin" />);
    const operations = within(screen.getByRole('region', { name: 'Operations & automation' }));
    expect(operations.getAllByRole('button').map(button => button.getAttribute('aria-label')))
      .toEqual(['Operations Assistant', 'Inbox', 'Follow-ups', 'Reminders']);
    expect(within(screen.getByRole('region', { name: 'Settings' })).getAllByRole('button'))
      .toEqual([screen.getByRole('button', { name: 'Channel settings' })]);
    expect(NAV_GROUPS.flatMap(group => group.ids)).not.toContain('profile');
    expect(NAV_ITEMS.map(item => item.id)).not.toContain('whatsapp');
    expect(screen.queryByRole('button', { name: /communications|whatsapp/i })).not.toBeInTheDocument();
  });

  it.each([false, true])('has no search or profile UI when collapsed=%s', isDesktopCollapsed => {
    render(<Sidebar {...defaultProps} role="hr_admin" currentUser={mockUser} isDesktopCollapsed={isDesktopCollapsed} />);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /search|profile/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Account' })).not.toBeInTheDocument();
    expect(screen.queryByText(mockUser.full_name)).not.toBeInTheDocument();
    expect(screen.queryByText('Organization workspace')).not.toBeInTheDocument();
  });

  it('shows only the actual team name as workspace subtitle', () => {
    render(<Sidebar {...defaultProps} role="committee_member" currentUser={{ ...mockUser, team_name: 'Design Committee' }} />);
    expect(screen.getByText('Design Committee')).toBeInTheDocument();
    expect(screen.queryByText('Organization workspace')).not.toBeInTheDocument();
  });

  it.each(['ctrlKey', 'metaKey'] as const)('leaves %s+K entirely to the header', modifier => {
    const setIsDesktopCollapsed = vi.fn();
    render(<Sidebar {...defaultProps} role="hr_admin" isDesktopCollapsed setIsDesktopCollapsed={setIsDesktopCollapsed} />);
    const event = new KeyboardEvent('keydown', { key: 'k', [modifier]: true, bubbles: true, cancelable: true });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(false);
    expect(setIsDesktopCollapsed).not.toHaveBeenCalled();
    expect(defaultProps.setIsMobileOpen).not.toHaveBeenCalled();
    expect(defaultProps.setActiveTab).not.toHaveBeenCalled();
  });

  it.each([
    ['inbox', 'Inbox'], ['follow-ups', 'Follow-ups'], ['channel-settings', 'Channel settings'],
  ] as const)('selects %s directly and closes the mobile drawer', (activeTab, label) => {
    render(<Sidebar {...defaultProps} activeTab={activeTab} role="hr_admin" isMobileOpen />);
    const item = screen.getByRole('button', { name: label });
    expect(item).toHaveAttribute('aria-current', 'page');
    fireEvent.click(item);
    expect(defaultProps.setActiveTab).toHaveBeenCalledWith(activeTab);
    expect(defaultProps.setIsMobileOpen).toHaveBeenCalledWith(false);
  });

  it('preserves logout and desktop collapse controls', () => {
    const setIsDesktopCollapsed = vi.fn();
    const props = { ...defaultProps, role: 'hr_admin' as const, setIsDesktopCollapsed };
    const { rerender, unmount } = render(<Sidebar {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(defaultProps.onLogout).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(setIsDesktopCollapsed).toHaveBeenLastCalledWith(true);
    rerender(<Sidebar {...props} isDesktopCollapsed />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(setIsDesktopCollapsed).toHaveBeenLastCalledWith(false);
    for (const modifier of ['ctrlKey', 'metaKey']) {
      fireEvent.keyDown(window, { key: 'b', [modifier]: true });
      const updater = setIsDesktopCollapsed.mock.lastCall?.[0] as (previous: boolean) => boolean;
      expect(updater(false)).toBe(true);
      expect(updater(true)).toBe(false);
    }
    unmount();
    setIsDesktopCollapsed.mockClear();
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(setIsDesktopCollapsed).not.toHaveBeenCalled();
  });

  it('preserves mobile focus containment, Escape dismissal, scroll lock, and focus restoration', () => {
    // The test DOM has no layout; mark native controls as visible for the real focus hook.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect()] as unknown as DOMRectList);
    const originalOverflow = document.body.style.overflow;
    const props = { ...defaultProps, role: 'hr_admin' as const };
    const { rerender } = render(<><button>Open drawer</button><Sidebar {...props} /></>);
    const opener = screen.getByRole('button', { name: 'Open drawer' });
    opener.focus();
    rerender(<><button>Open drawer</button><Sidebar {...props} isMobileOpen /></>);
    const first = screen.getByRole('link', { name: /StudentOps/ });
    const last = screen.getByRole('button', { name: 'Sign out' });
    expect(first).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.setIsMobileOpen).toHaveBeenCalledWith(false);
    rerender(<><button>Open drawer</button><Sidebar {...props} /></>);
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe(originalOverflow);
  });

  it('restricts committee_member from viewing sensitive administrative and scoring tabs', () => {
    render(
      <Sidebar
        {...defaultProps}
        role="committee_member"
        currentUser={{ ...mockUser, role: 'committee_member' }}
      />
    );

    // Permitted member tabs
    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /meet attendance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tasks & deliverables/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /committee q&a/i })).toBeInTheDocument();

    // Forbidden administrative and evaluation tabs
    expect(screen.queryByRole('button', { name: /evaluations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /operations assistant/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /task reviews/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /executive reports/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /audit log/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /inbox|follow-ups|channel settings/i })).not.toBeInTheDocument();
  });

  it('allows committee_head to access technical task reviews but not executive reports or audit log', () => {
    render(
      <Sidebar
        {...defaultProps}
        role="committee_head"
        currentUser={{ ...mockUser, role: 'committee_head' }}
      />
    );

    // Committee head should see task reviews and evaluations
    expect(screen.getByRole('button', { name: /task reviews/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /evaluations/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /operations assistant/i })).toBeInTheDocument();

    // Should NOT see executive reports or audit log
    expect(screen.queryByRole('button', { name: /executive reports/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /audit log/i })).not.toBeInTheDocument();
  });

  it('allows region_hr_head to access executive reports and audit log, but not technical task reviews', () => {
    render(
      <Sidebar
        {...defaultProps}
        role="region_hr_head"
        currentUser={{ ...mockUser, role: 'region_hr_head' }}
      />
    );

    // Region head permissions
    expect(screen.getByRole('button', { name: /executive reports/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /audit log/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inbox' })).toBeInTheDocument();

    // Technical task reviews are restricted to committee heads
    expect(screen.queryByRole('button', { name: /task reviews/i })).not.toBeInTheDocument();
  });
});
