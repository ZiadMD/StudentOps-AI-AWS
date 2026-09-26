import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar, Tab } from '../components/Sidebar';
import { UserProfile } from '../types';

const mockUser: UserProfile = {
  id: 'user-1',
  full_name: 'Test Member',
  arabic_name: 'عضو تجريبي',
  email: 'member@example.org',
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
    expect(screen.getByRole('button', { name: /attendance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^tasks$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /questions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reminders$/i })).toBeInTheDocument();

    // Forbidden administrative and evaluation tabs
    expect(screen.queryByRole('button', { name: /evaluations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assistant/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /task reviews/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reports$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /audit log/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /messages/i })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /assistant/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /questions/i })).toBeInTheDocument();

    // Should NOT see executive reports or audit log
    expect(screen.queryByRole('button', { name: /^reports$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /audit log/i })).not.toBeInTheDocument();
  });

  it('allows region_hr_head to access executive reports, audit log, and committee q&a', () => {
    render(
      <Sidebar
        {...defaultProps}
        role="region_hr_head"
        currentUser={{ ...mockUser, role: 'region_hr_head' }}
      />
    );

    // Region head permissions
    expect(screen.getByRole('button', { name: /^reports$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /audit log/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /messages/i })).toBeInTheDocument();
    // Requirement 2: HR Head MUST see Committee Q&A
    expect(screen.getByRole('button', { name: /questions/i })).toBeInTheDocument();

    // Technical task reviews are restricted to committee heads
    expect(screen.queryByRole('button', { name: /task reviews/i })).not.toBeInTheDocument();
  });
});
