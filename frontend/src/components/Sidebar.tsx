import { useEffect, useRef, useState } from 'react';
import { useFocusContainment } from '../hooks/useFocusContainment';
import { useLanguage } from '../context/LanguageContext';
import { SettingsModal } from './ui/SettingsModal';
import { LogOut, Settings, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { UserProfile } from '../types';
import { visibleNavGroups, type Role, type Tab } from './navigation';

export type { Tab, Role };

export interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  role: Role;
  currentUser?: UserProfile | null;
  onLogout: () => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  isDesktopCollapsed?: boolean;
  setIsDesktopCollapsed?: React.Dispatch<React.SetStateAction<boolean>>;
}

/*
 * Layout strategy.
 *
 * Desktop (>=1024px): a sticky rail that can collapse to icons.
 * Tablet and phone (<1024px): a modal drawer. Tablets use the drawer too
 * because a 240px rail next to a data table leaves too little readable width.
 */
export function Sidebar({
  activeTab,
  setActiveTab,
  role,
  currentUser,
  onLogout,
  isMobileOpen,
  setIsMobileOpen,
  isDesktopCollapsed = false,
  setIsDesktopCollapsed,
}: SidebarProps) {
  const { t } = useLanguage();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const groups = visibleNavGroups(role);

  useFocusContainment(drawerRef, isMobileOpen);

  // Freeze the page behind the open drawer.
  useEffect(() => {
    if (!isMobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [isMobileOpen]);

  // Escape closes the drawer. The shortcut is only offered where it is bound.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMobileOpen) setIsMobileOpen(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b'
        && setIsDesktopCollapsed) {
        event.preventDefault();
        setIsDesktopCollapsed(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobileOpen, setIsMobileOpen, setIsDesktopCollapsed]);

  const select = (tab: Tab) => {
    setActiveTab(tab);
    setIsMobileOpen(false);
  };

  const itemClass = (active: boolean) => [
    'flex w-full items-center rounded-lg text-sm transition-colors',
    isDesktopCollapsed
      ? 'justify-start px-2 py-2 lg:justify-center lg:px-0'
      : 'gap-3 px-3 py-2',
    active
      ? 'bg-slate-900 text-white font-semibold shadow-xs'
      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
  ].join(' ');

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 animate-fade-in lg:hidden"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        ref={drawerRef}
        id="app-sidebar"
        aria-label="Workspace navigation"
        tabIndex={-1}
        data-collapsed={isDesktopCollapsed}
        data-open={isMobileOpen}
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white',
          'transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:translate-x-0 lg:shrink-0',
          isMobileOpen ? 'translate-x-0 shadow-drawer' : '-translate-x-full lg:translate-x-0',
          isDesktopCollapsed ? 'lg:w-16' : 'lg:w-60',
        ].join(' ')}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3">
            {isDesktopCollapsed ? (
              setIsDesktopCollapsed && (
                <button
                  type="button" onClick={() => setIsDesktopCollapsed(false)}
                  className="mx-auto hidden h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:flex"
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
                </button>
              )
            ) : (
              <>
                <a
                  href="/"
                  className="flex min-w-0 items-center gap-2 rounded-sm px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-900 text-[0.625rem] font-bold text-white"
                  >
                    SO
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-semibold text-slate-900">StudentOps</span>
                    {currentUser?.team_name && (
                      <span className="truncate text-xs text-slate-500">{currentUser.team_name}</span>
                    )}
                  </span>
                </a>

                <div className="flex items-center gap-1">
                  {setIsDesktopCollapsed && (
                    <button
                      type="button" onClick={() => setIsDesktopCollapsed(true)}
                      className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:flex"
                      title="Collapse sidebar"
                      aria-label="Collapse sidebar"
                    >
                      <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button" onClick={() => setIsMobileOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
                    aria-label="Close navigation"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
          </div>

          <nav aria-label="Pages" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            {groups.map(group => (
              <section key={group.label} aria-label={group.label} className="mb-5 last:mb-0">
                <h2
                  className={`mb-1.5 px-2 text-2xs font-semibold uppercase tracking-[0.12em] text-slate-400 ${
                    isDesktopCollapsed ? 'lg:sr-only' : ''
                  }`}
                >
                  {group.label}
                </h2>
                <ul className="space-y-0.5">
                  {group.items.map(item => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => select(item.id)}
                          aria-current={active ? 'page' : undefined}
                          title={isDesktopCollapsed ? item.label : undefined}
                          className={itemClass(active)}
                        >
                          <Icon
                            aria-hidden="true"
                            className={`h-5 w-5 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`}
                          />
                          <span className={isDesktopCollapsed ? 'lg:sr-only' : 'truncate'}>
                            {t(item.id, item.label)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>
        </div>

        <div className="shrink-0 space-y-1 border-t border-slate-200 p-3">
          <button
            type="button" onClick={() => setIsSettingsOpen(true)}
            title={isDesktopCollapsed ? t('settings', 'Settings') : undefined}
            className={itemClass(false)}
          >
            <Settings aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-400" />
            <span className={isDesktopCollapsed ? 'lg:sr-only' : 'truncate'}>
              {t('settings', 'Settings')}
            </span>
          </button>

          <button
            type="button" onClick={onLogout}
            title={isDesktopCollapsed ? t('signOut', 'Sign out') : undefined}
            className={`${itemClass(false)} hover:bg-red-50 hover:text-red-700`}
          >
            <LogOut aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-400" />
            <span className={isDesktopCollapsed ? 'lg:sr-only' : 'truncate'}>
              {t('signOut', 'Sign out')}
            </span>
          </button>
        </div>
      </aside>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUser={currentUser}
      />
    </>
  );
}
