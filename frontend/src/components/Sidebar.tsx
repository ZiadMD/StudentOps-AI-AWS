import React from 'react';
import {
  Bot,
  LayoutDashboard,
  Users,
  Calendar,
  CheckSquare,
  ShieldCheck,
  Video,
  Layers,
  Search,
  Command,
  ChevronsUpDown,
  Settings,
  Bell,
  ClipboardList,
  LogOut,
} from 'lucide-react';

export type Tab =
  | 'dashboard'
  | 'chat'
  | 'attendance'
  | 'scoreboard'
  | 'calendar'
  | 'tasks'
  | 'task-reviews'
  | 'students'
  | 'notifications'
  | 'audit';

export type Role = 'admin' | 'member';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
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
  { id: 'dashboard',      label: 'Overview',        icon: LayoutDashboard, roles: ['admin', 'member'] },
  { id: 'chat',           label: 'Agent Console',   icon: Bot,             roles: ['admin'], isAgent: true },
  { id: 'students',       label: 'Member Registry', icon: Users,           roles: ['admin'] },
  { id: 'attendance',     label: 'Meet Attendance', icon: Video,           roles: ['member', 'admin'] },
  { id: 'scoreboard',     label: 'Evaluations',     icon: ClipboardList,   roles: ['member', 'admin'] },
  { id: 'calendar',       label: 'Schedule',        icon: Calendar,        roles: ['member', 'admin'] },
  { id: 'tasks',          label: 'Tasks & Sprints', icon: CheckSquare,     roles: ['member', 'admin'] },
  { id: 'task-reviews',   label: 'Task Reviews',    icon: ClipboardList,   roles: ['admin'] },
  { id: 'notifications',  label: 'Reminders',       icon: Bell,            roles: ['admin'] },
  { id: 'audit',          label: 'Audit Log',       icon: ShieldCheck,     roles: ['admin'] },
];

import { UserProfile } from '../types';

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  role: Role;
  currentUser?: UserProfile | null;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, role, currentUser, onLogout }) => {
  const visibleItems = NAV_ITEMS.filter(item => item.roles.includes(role));

  return (
    <aside className="w-60 border-r border-slate-200/80 bg-white flex flex-col h-screen sticky top-0 shrink-0">
      {/* Workspace Header */}
      <div className="h-14 flex items-center px-3 border-b border-slate-200/60">
        <div className="flex items-center justify-between w-full px-1.5 py-1 rounded-lg hover:bg-slate-100/60 transition-colors cursor-pointer">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-6 h-6 rounded-md bg-slate-900 flex items-center justify-center shrink-0">
              <Layers className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-[13px] text-slate-900 truncate leading-tight">StudentOps.AI</span>
              <span className="text-[10px] text-slate-500 truncate">Engineering Branch</span>
            </div>
          </div>
          <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={() => setActiveTab('chat')}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-slate-100/60 hover:bg-slate-100 text-slate-400 hover:text-slate-700 border border-transparent hover:border-slate-200 text-xs transition-all"
        >
          <div className="flex items-center space-x-2">
            <Search className="w-3.5 h-3.5" />
            <span>Search or ask AI…</span>
          </div>
          <div className="flex items-center text-[10px] font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded">
            <Command className="w-3 h-3 mr-0.5" />K
          </div>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-2 pt-2">
          Workspace
        </div>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-2.5 py-[7px] rounded-md text-[13px] transition-colors ${
                isActive
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100/60 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-slate-800' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.isAgent && (
                <span className="flex h-4 w-4 items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User / Footer */}
      <div className="p-3 border-t border-slate-200/60 space-y-1">
        <button className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-md text-slate-600 hover:bg-slate-100/60 hover:text-slate-900 transition-colors text-[13px]">
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Settings</span>
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center space-x-2.5 px-2.5 py-2 rounded-md text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-colors text-[13px]"
        >
          <LogOut className="w-4 h-4 text-slate-400" />
          <span>Sign out</span>
        </button>
        <div className="flex items-center space-x-2.5 px-2.5 py-2 rounded-md mt-1 border border-slate-200 bg-slate-50/60">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            {currentUser?.full_name?.charAt(0) || ROLE_LABELS[role].charAt(0)}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[12px] font-semibold text-slate-900 truncate">
              {currentUser?.full_name || 'Admin User'}
            </span>
            <span className="text-[10px] text-slate-500 truncate">
              {ROLE_LABELS[role]}{currentUser?.team_name ? ` · ${currentUser.team_name}` : ''}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
