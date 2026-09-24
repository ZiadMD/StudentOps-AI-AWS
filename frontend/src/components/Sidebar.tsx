import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { SettingsModal } from './ui/SettingsModal';
import {
  Bot,
  LayoutDashboard,
  Users,
  Calendar,
  CheckSquare,
  ShieldCheck,
  Video,
  Layers,
  Settings,
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
  | 'whatsapp';

export type Role = UserRole;

const ROLE_LABELS: Record<Role, string> = {
  region_hr_head: 'Region HR Head',
  committee_hr_leader: 'HR Committee Leader',
  committee_head: 'Committee Head',
  committee_hr_member: 'Committee HR Member',
  committee_member: 'Member',
  hr_admin: 'HR Admin',
  team_lead: 'Team Lead',
  member: 'Member',
};

// Nav items visible per role
const NAV_ITEMS: {
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
    label: 'AI Agent Console',
    icon: Bot,
    roles: ['region_hr_head', 'committee_hr_leader', 'committee_head', 'committee_hr_member', 'hr_admin', 'team_lead'],
    isAgent: true,
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
    label: 'Tasks & Sprints',
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
    roles: ['committee_head', 'committee_member', 'member', 'committee_hr_leader', 'hr_admin', 'team_lead', 'region_hr_head'],
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
    id: 'whatsapp',
    label: 'WhatsApp & Escalations',
    icon: MessageSquare,
    roles: ['region_hr_head', 'committee_hr_leader', 'committee_head', 'committee_hr_member', 'hr_admin', 'team_lead'],
  },
  {
    id: 'notifications',
    label: 'Reminders',
    icon: Bell,
    roles: ['region_hr_head', 'committee_hr_leader', 'committee_head', 'committee_hr_member', 'committee_member', 'hr_admin', 'team_lead', 'member'],
  },
  {
    id: 'audit',
    label: 'Audit Log',
    icon: ShieldCheck,
    roles: ['region_hr_head', 'hr_admin'],
  },
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
  const { t } = useLanguage();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(role));

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

  // Handle ESC key to close mobile menu & desktop keyboard shortcuts (Cmd+B to collapse, Cmd+K to search/chat)
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
      id="app-sidebar"
      aria-label="Sidebar navigation"
      className={`
        fixed inset-0 z-50 w-full h-full bg-white flex flex-col justify-between
        transform transition-all duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}
        md:static md:translate-x-0 md:opacity-100 md:pointer-events-auto md:h-screen md:sticky md:top-0 md:shrink-0
        md:border-r md:border-slate-200/70 md:bg-white/90
        ${isDesktopCollapsed ? 'md:w-16' : 'md:w-64'}
      `}
    >
      {/* Top Section */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header & Brand */}
        <div className={`h-16 md:h-14 flex items-center border-b border-slate-200/50 shrink-0 ${
          isDesktopCollapsed ? 'md:justify-center px-2' : 'justify-between px-4 md:px-3'
        }`}>
          {!isDesktopCollapsed ? (
            <>
              {/* Logo / Workspace Info */}
              <div className="flex items-center space-x-2.5 overflow-hidden">
                <div
                  className="w-8 h-8 md:w-6 md:h-6 rounded-lg md:rounded-md bg-blue-600 flex items-center justify-center shrink-0 shadow-[0_2px_6px_rgb(58_78_219/0.35)]"
                  title="StudentOps.AI"
                >
                  <Layers className="w-4 h-4 md:w-3.5 md:h-3.5 text-white" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-sm md:text-[13px] text-slate-900 truncate leading-tight">StudentOps.AI</span>
                  <span className="text-[11px] md:text-[10px] text-slate-500 truncate">Engineering Branch</span>
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

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-4 md:px-2 py-2 space-y-1 md:space-y-0.5">
          <div className={`text-[11px] md:text-[10px] font-semibold text-slate-400 mb-2 md:mb-1.5 px-3 md:px-2.5 pt-2 ${
            isDesktopCollapsed ? 'md:hidden' : ''
          }`}>
            {t('workspaceNav', 'Workspace Navigation')}
          </div>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const localizedLabel = t(item.id, item.label);
            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id)}
                title={isDesktopCollapsed ? localizedLabel : undefined}
                className={`w-full flex items-center ${
                  isDesktopCollapsed ? 'md:justify-center md:px-0' : 'justify-between px-3 md:px-2.5'
                } py-3 md:py-2 rounded-xl md:rounded-[10px] text-[15px] md:text-[13.5px] transition-colors duration-150 ${
                  isActive
                    ? 'bg-blue-600 text-white md:bg-blue-50 md:text-blue-700 font-semibold shadow-sm md:shadow-none'
                    : 'text-slate-700 md:text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200/70'
                }`}
              >
                <div className={`flex items-center ${isDesktopCollapsed ? 'md:space-x-0' : 'space-x-3 md:space-x-2.5 rtl:space-x-reverse'}`}>
                  <Icon
                    className={`w-5 h-5 md:w-4 md:h-4 shrink-0 ${
                      isActive
                        ? 'text-white md:text-blue-600'
                        : 'text-slate-400'
                    }`}
                  />
                  <span className={isDesktopCollapsed ? 'md:hidden' : 'block'}>
                    {localizedLabel}
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
        </nav>
      </div>

      {/* User / Footer Section */}
      <div className={`p-4 md:p-3 border-t border-slate-200/70 space-y-2 md:space-y-1 shrink-0 ${
        isDesktopCollapsed ? 'md:px-2 md:space-y-2' : ''
      }`}>
        {/* Settings button */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          title={isDesktopCollapsed ? t('settings', 'Settings') : undefined}
          className={`w-full flex items-center ${
            isDesktopCollapsed ? 'md:justify-center md:px-0' : 'space-x-3 md:space-x-2.5 rtl:space-x-reverse px-3 md:px-2.5'
          } py-2.5 md:py-2 rounded-xl md:rounded-md text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 transition-colors text-[14px] md:text-[13px]`}
        >
          <Settings className="w-5 h-5 md:w-4 md:h-4 text-slate-400 shrink-0" />
          <span className={isDesktopCollapsed ? 'md:hidden' : 'block'}>{t('settings', 'Settings')}</span>
        </button>

        {/* Sign out button */}
        <button
          onClick={onLogout}
          title={isDesktopCollapsed ? t('signOut', 'Sign out') : undefined}
          className={`w-full flex items-center ${
            isDesktopCollapsed ? 'md:justify-center md:px-0' : 'space-x-3 md:space-x-2.5 rtl:space-x-reverse px-3 md:px-2.5'
          } py-2.5 md:py-2 rounded-xl md:rounded-md text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-colors text-[14px] md:text-[13px]`}
        >
          <LogOut className="w-5 h-5 md:w-4 md:h-4 text-slate-400 hover:text-rose-600 shrink-0" />
          <span className={isDesktopCollapsed ? 'md:hidden' : 'block'}>{t('signOut', 'Sign out')}</span>
        </button>

        {/* User profile card */}
        <div
          title={isDesktopCollapsed ? (currentUser?.full_name || t('adminUser', 'Admin User')) : undefined}
          className={`flex items-center ${
            isDesktopCollapsed ? 'md:justify-center md:p-2' : 'space-x-3 md:space-x-2.5 rtl:space-x-reverse px-3 py-2.5 md:px-2.5 md:py-2'
          } rounded-xl md:rounded-md mt-1 border border-slate-200 bg-slate-50/80`}
        >
          <div className="w-8 h-8 md:w-6 md:h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs md:text-[10px] font-bold shrink-0 shadow-xs">
            {currentUser?.full_name?.charAt(0) || ROLE_LABELS[role]?.charAt(0) || 'U'}
          </div>
          <div className={`flex flex-col min-w-0 ${isDesktopCollapsed ? 'md:hidden' : 'block'}`}>
            <span className="text-[13px] md:text-[12px] font-semibold text-slate-900 truncate">
              {currentUser?.full_name || t('adminUser', 'Admin User')}
            </span>
            <span className="text-[11px] md:text-[10px] text-slate-500 truncate">
              {ROLE_LABELS[role]}{currentUser?.team_name ? ` · ${currentUser.team_name}` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUser={currentUser}
      />
    </aside>
  );
};
