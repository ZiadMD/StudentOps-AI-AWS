import { describe, it, expect } from 'vitest';
import { NAV_ITEMS, NAV_GROUPS, canAccessTab, visibleNavGroups } from '../components/navigation';
import { canonicalPath, isAppPath } from '../hooks/useLocationPath';

describe('navigation config', () => {
  it('declares no duplicate tab ids', () => {
    const ids = NAV_ITEMS.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places every declared item in exactly one group', () => {
    const grouped = NAV_GROUPS.flatMap(group => group.ids);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(NAV_ITEMS.map(i => i.id).sort());
  });

  it('gives every item a role list and search aliases', () => {
    for (const item of NAV_ITEMS) {
      expect(item.roles.length, `${item.id} has roles`).toBeGreaterThan(0);
      expect(item.aliases, `${item.id} has aliases`).toBeTruthy();
    }
  });

  it('never leaves a group empty for a role that can see its members', () => {
    for (const role of ['hr_admin', 'committee_head', 'member'] as const) {
      for (const group of visibleNavGroups(role)) {
        expect(group.items.length, `${role}/${group.label}`).toBeGreaterThan(0);
      }
    }
  });

  it('scopes pages by role', () => {
    expect(canAccessTab('member', 'dashboard')).toBe(true);
    expect(canAccessTab('member', 'evaluations' as never)).toBe(false);
    expect(canAccessTab('committee_member', 'assistant' as never)).toBe(false);
    expect(canAccessTab('hr_admin', 'audit')).toBe(true);
    expect(canAccessTab('committee_head', 'audit')).toBe(false);
  });
});

describe('route canonicalisation', () => {
  it.each([
    ['/', '/'],
    ['', '/'],
    ['/login', '/login'],
    ['/signin', '/login'],
    ['/loginor', '/login'],
    ['/sign-in', '/login'],
    ['/signup', '/signup'],
    ['/register', '/signup'],
    ['/sign%20up', '/signup'],
    ['/app', '/app/dashboard'],
    ['/app/', '/app/dashboard'],
    ['/app/tasks/', '/app/tasks'],
    ['/app/AUDIT', '/app/audit'],
  ])('maps %s to %s', (input, expected) => {
    expect(canonicalPath(input)).toBe(expected);
  });

  it('identifies workspace routes', () => {
    expect(isAppPath('/app/dashboard')).toBe(true);
    expect(isAppPath('/app')).toBe(true);
    expect(isAppPath('/login')).toBe(false);
    expect(isAppPath('/')).toBe(false);
  });
});
