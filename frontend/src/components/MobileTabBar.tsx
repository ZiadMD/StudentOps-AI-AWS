import { NAV_ITEMS, canAccessTab, type Role, type Tab } from './navigation';

export interface MobileTabBarProps {
  role: Role;
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
}

/*
 * Bottom tab bar for phones.
 *
 * A 16-item sidebar cannot be thumb-reachable on a phone, so the four most
 * frequent destinations get a persistent bar above the safe area. Every item
 * respects role scoping, and the active item is marked for screen readers.
 * Hidden on tablet and up, where the sidebar is already visible.
 */
export function MobileTabBar({ role, activeTab, onNavigate }: MobileTabBarProps) {
  const primary: Tab[] = ['dashboard', 'tasks', 'attendance', 'chat'];

  const items = primary
    .filter(tab => canAccessTab(role, tab))
    .map(tab => NAV_ITEMS.find(item => item.id === tab))
    .filter((item): item is (typeof NAV_ITEMS)[number] => Boolean(item));

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {items.map(item => {
          const active = activeTab === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-2xs font-medium transition-colors ${
                  active ? 'text-brand-700' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <item.icon aria-hidden="true" className="h-5 w-5" />
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
