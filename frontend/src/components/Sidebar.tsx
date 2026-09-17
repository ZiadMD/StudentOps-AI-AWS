import React, { useEffect, useRef } from 'react';
import { useFocusContainment } from '../hooks/useFocusContainment';
import {
  Bot,
  LayoutDashboard,
  Users,
  Calendar,
  CheckSquare,
  ShieldCheck,
  Video,
  Layers,
  Bell,
  ClipboardList,
  LogOut,
  MessageSquare,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  MessageCircleQuestion,
  MessageSquareHeart,
  FileText,
  ListChecks,
  Settings,
  UserRound,
} from 'lucide-react';
import { UserProfile, UserRole } from '../types';

export type Tab =
  | 'dashboard'
  | 'chat'
  | 'attendance'
  | 'scoreboard'
  | 'calendar'
  | 'tasks'
  | 'task-reviews'
  | 'qna'
  | 'feedback'
  | 'reports'
  | 'students'
  | 'notifications'
  | 'audit'
  | 'inbox'
  | 'follow-ups'
  | 'channel-settings'
  | 'profile';

export type Role = UserRole;

// Shared by navigation and the client-side route visibility guard.
export const NAV_ITEMS: {
  id: Tab;
  label: string;
  icon: React.FC<{ className?: string }>;
  isAgent?: boolean;
  roles: Role[];
}[] = [
  {
    id: 'dashboard',
    label: 'Overview',
    icon: LayoutDashboard,
    roles: ['region_hr_head', 'committee_hr_leader', 'committee_head', 'committee_hr_member', 'committee_member', 'hr_admin', 'team_lead', 'member'],
  },
  {
    id: 'chat',
    label: 'Operations Assistant',
    icon: Bot,
    roles: ['region_hr_head', 'committee_hr_leader', 'committee_head', 'committee_hr_member', 'hr_admin', 'team_lead'],
  },
  {
    id: 'students',
    label: 'Member Registry',
    icon: Users,
    roles: ['region_hr_head', 'committee_hr_leader', 'committee_head', 'committee_hr_member', 'hr_admin', 'team_lead'],
  },
  {
    id: 'attendance',
    label: 'Meet Attendance',
    icon: Video,
    roles: ['region_hr_head', 'committee_hr_leader', 'committee_head', 'committee_hr_member', 'committee_member', 'hr_admin', 'team_lead', 'member'],
  },
  {
    id: 'scoreboard',
    label: 'Evaluations',
    icon: ClipboardList,
    // Strictly hidden from committee_member and member
    roles: ['region_hr_head', 'committee_hr_leader', 'committee_head', 'committee_hr_member', 'hr_admin', 'team_lead'],
  },
  {
    id: 'calendar',
    label: 'Schedule & Calendar',
    icon: Calendar,
    roles: ['region_hr_head', 'committee_hr_leader', 'committee_head', 'committee_hr_member', 'committee_member', 'hr_admin', 'team_lead', 'member'],
  },
  {
    id: 'tasks',
    label: 'Tasks & Deliverables',
    icon: CheckSquare,
    roles: ['region_hr_head', 'committee_hr_leader', 'committee_head', 'committee_hr_member', 'committee_member', 'hr_admin', 'team_lead', 'member'],
  },
  {
    id: 'task-reviews',
    label: 'Task Reviews',
    icon: ClipboardList,
    // Restricted to technical committee heads
    roles: ['committee_head', 'hr_admin', 'team_lead'],
  },
  {
    id: 'qna',
    label: 'Committee Q&A',
    icon: MessageCircleQuestion,
    roles: ['committee_head', 'committee_member', 'member', 'committee_hr_leader', 'hr_admin', 'team_lead'],
  },
  {
    id: 'feedback',
    label: 'Member Feedback',
    icon: MessageSquareHeart,
    roles: ['committee_member', 'member', 'committee_hr_leader', 'region_hr_head', 'hr_admin'],
  },
  {
    id: 'reports',
    label: 'Executive Reports',
    icon: FileText,
    roles: ['committee_hr_leader', 'region_hr_head', 'hr_admin'],
  },
  {
    id: 'inbox',
    label: 'Inbox',
    icon: MessageSquare,
    roles: ['region_hr_head', 'committee_hr_leader', 'committee_head', 'committee_hr_member', 'hr_admin', 'team_lead'],
  },
  {
    id: 'follow-ups',
    label: 'Follow-ups',
    icon: ListChecks,
    roles: ['region_hr_head', 'committee_hr_leader', 'committee_head', 'committee_hr_member', 'hr_admin', 'team_lead'],
  },
  {
    id: 'channel-settings',
    label: 'Channel settings',
    icon: Settings,
    roles: ['region_hr_head', 'hr_admin'],
  },
  {
    id: 'notifications',
    label: 'Reminders',
    icon: Bell,
    roles: ['region_hr_head', 'committee_hr_leader', 'hr_admin', 'team_lead'],
  },
  {
    id: 'audit',
    label: 'Audit Log',
    icon: ShieldCheck,
    roles: ['region_hr_head', 'hr_admin'],
  },
  {
    id: 'profile',
    label: 'My Profile',
    icon: UserRound,
    roles: ['region_hr_head', 'committee_hr_leader', 'committee_head', 'committee_hr_member', 'committee_member', 'hr_admin', 'team_lead', 'member'],
  },
];

export const NAV_GROUPS: { label: string; ids: Tab[] }[] = [
  { label: 'Workspace', ids: ['dashboard', 'calendar', 'tasks', 'task-reviews'] },
  { label: 'People', ids: ['students', 'attendance', 'scoreboard', 'feedback', 'qna'] },
  { label: 'Operations & automation', ids: ['chat', 'inbox', 'follow-ups', 'notifications'] },
  { label: 'Reports & oversight', ids: ['reports', 'audit'] },
  { label: 'Settings', ids: ['channel-settings'] },
];

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

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  role,
  currentUser,
  onLogout,
  isMobileOpen,
  setIsMobileOpen,
  isDesktopCollapsed = false,
  setIsDesktopCollapsed,
}) => {
  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(role));
  const sidebarRef = useRef<HTMLElement>(null);
  useFocusContainment(sidebarRef, isMobileOpen);
  const groups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.ids.flatMap(id => {
      const item = visibleItems.find(candidate => candidate.id === id);
      return item ? [item] : [];
    }),
  })).filter(group => group.items.length > 0);

  // Lock body scroll on mobile when full-screen drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isMobileOpen]);

  // Escape closes the mobile menu; Cmd/Ctrl+B toggles desktop collapse.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen) {
        setIsMobileOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && setIsDesktopCollapsed) {
        e.preventDefault();
        setIsDesktopCollapsed(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, setIsMobileOpen, setIsDesktopCollapsed]);

  const handleSelectTab = (tab: Tab) => {
    setActiveTab(tab);
    if (isMobileOpen) {
      setIsMobileOpen(false);
    }
  };

  return (
    <aside
      ref={sidebarRef}
      tabIndex={-1}
      data-collapsed={isDesktopCollapsed}
      data-open={isMobileOpen}
      id="app-sidebar"
      aria-label="Sidebar navigation"
      className={`
        fixed inset-0 z-50 w-full h-full bg-white flex flex-col justify-between
        transform transition-all duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}
        md:static md:translate-x-0 md:opacity-100 md:pointer-events-auto md:h-screen md:sticky md:top-0 md:shrink-0
        md:border-r md:border-slate-200/80
        ${isDesktopCollapsed ? 'md:w-16' : 'md:w-60'}
      `}
    >
      {/* Top Section */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header & Brand */}
        <div className={`h-16 md:h-14 flex items-center border-b border-slate-200/60 shrink-0 ${
          isDesktopCollapsed ? 'md:justify-center px-2' : 'justify-between px-4 md:px-3'
        }`}>
          {!isDesktopCollapsed ? (
            <>
              {/* Logo / Workspace Info */}
              <div className="flex items-center space-x-2.5 overflow-hidden">
                <div
                  className="w-8 h-8 md:w-6 md:h-6 rounded-lg md:rounded-md bg-slate-900 flex items-center justify-center shrink-0 shadow-xs"
                  title="StudentOps.AI"
                >
                  <Layers className="w-4 h-4 md:w-3.5 md:h-3.5 text-white" />
                </div>
                <div className="flex flex-col min-w-0">
                  <a href="/" className="font-semibold text-base text-slate-900 truncate leading-tight">StudentOps<span className="text-teal-700">/</span></a>
                  {currentUser?.team_name && <span className="text-xs text-slate-500 truncate">{currentUser.team_name}</span>}
                </div>
              </div>

              {/* Mobile Close Button (Native App Style) */}
              <button
                onClick={() => setIsMobileOpen(false)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors md:hidden focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-label="Close navigation menu"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Desktop Collapse Toggle Button */}
              {setIsDesktopCollapsed && (
                <button
                  onClick={() => setIsDesktopCollapsed(true)}
                  className="hidden md:flex p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-1 focus:ring-slate-300"
                  title="Collapse sidebar (⌘B)"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            /* Desktop Collapsed State: Single Centered Expand Button */
            setIsDesktopCollapsed && (
              <button
                onClick={() => setIsDesktopCollapsed(false)}
                className="hidden md:flex w-9 h-9 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-1 focus:ring-slate-300"
                title="Expand sidebar (⌘B)"
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )
          )}
        </div>

        <button type="button" onClick={() => setIsMobileOpen(false)} className="drawer-close m-3 min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm" aria-label="Close navigation">
          <X className="h-4 w-4" /> Close menu
        </button>
        {/* Role-filtered groups keep related workflows together. */}
        <nav aria-label="Workspace pages" className="flex-1 overflow-y-auto px-3 py-3">
          {groups.map(group => (
            <section key={group.label} aria-label={group.label} className="mb-4 last:mb-0">
              <h2 className={`px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 ${isDesktopCollapsed ? 'lg:sr-only' : ''}`}>{group.label}</h2>
              {group.items.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                title={isDesktopCollapsed ? item.label : undefined}
                className={`w-full flex items-center ${
                  isDesktopCollapsed ? 'md:justify-center md:px-0' : 'justify-between px-3 md:px-2.5'
                } py-3 md:py-[7px] rounded-xl md:rounded-md text-[15px] md:text-[13px] transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white md:bg-slate-100 md:text-slate-900 font-semibold shadow-xs md:shadow-none'
                    : 'text-slate-700 md:text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 active:bg-slate-100'
                }`}
              >
                <div className={`flex items-center ${isDesktopCollapsed ? 'md:space-x-0' : 'space-x-3 md:space-x-2.5'}`}>
                  <Icon
                    className={`w-5 h-5 md:w-4 md:h-4 shrink-0 ${
                      isActive
                        ? 'text-white md:text-slate-900'
                        : 'text-slate-400'
                    }`}
                  />
                  <span className={isDesktopCollapsed ? 'md:hidden' : 'block'}>
                    {item.label}
                  </span>
                </div>
                {item.isAgent && (
                  <span className={`flex h-4 w-4 items-center justify-center ${isDesktopCollapsed ? 'md:hidden' : ''}`}>
                    <span className="w-2 h-2 md:w-1.5 md:h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  </span>
                )}
              </button>
            );
          })}
            </section>
          ))}
        </nav>
      </div>

      {/* Sign out footer */}
      <div className={`p-4 md:p-3 border-t border-slate-200/70 space-y-2 md:space-y-1 shrink-0 ${
        isDesktopCollapsed ? 'md:px-2 md:space-y-2' : ''
      }`}>
        {/* Sign out button */}
        <button
          onClick={onLogout}
          title={isDesktopCollapsed ? 'Sign out' : undefined}
          className={`w-full flex items-center ${
            isDesktopCollapsed ? 'md:justify-center md:px-0' : 'space-x-3 md:space-x-2.5 px-3 md:px-2.5'
          } py-2.5 md:py-2 rounded-xl md:rounded-md text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-colors text-[14px] md:text-[13px]`}
        >
          <LogOut className="w-5 h-5 md:w-4 md:h-4 text-slate-400 hover:text-rose-600 shrink-0" />
          <span className={isDesktopCollapsed ? 'md:hidden' : 'block'}>Sign out</span>
        </button>
      </div>
    </aside>
  );
};
