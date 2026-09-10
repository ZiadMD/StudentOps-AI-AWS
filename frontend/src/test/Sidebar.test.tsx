import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar, Tab } from '../components/Sidebar';
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
    expect(screen.getByRole('button', { name: /tasks & sprints/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /committee q&a/i })).toBeInTheDocument();

    // Forbidden administrative and evaluation tabs
    expect(screen.queryByRole('button', { name: /evaluations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ai agent console/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /task reviews/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /executive reports/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /audit log/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /whatsapp & escalations/i })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /ai agent console/i })).toBeInTheDocument();

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
    expect(screen.getByRole('button', { name: /whatsapp & escalations/i })).toBeInTheDocument();

    // Technical task reviews are restricted to committee heads
    expect(screen.queryByRole('button', { name: /task reviews/i })).not.toBeInTheDocument();
  });
});
