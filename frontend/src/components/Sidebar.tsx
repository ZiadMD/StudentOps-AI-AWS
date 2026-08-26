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
  Settings
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'dashboard', label: 'Command Center', icon: LayoutDashboard },
    { id: 'chat', label: 'Agent Console', icon: Bot, isAgent: true },
    { id: 'attendance', label: 'Meet Attendance', icon: Video },
    { id: 'scoreboard', label: '8.xlsx Scoreboard', icon: Users },
    { id: 'calendar', label: 'Calendar & Sync', icon: Calendar },
    { id: 'tasks', label: 'Task Sprints', icon: CheckSquare },
    { id: 'audit', label: 'Audit Log', icon: ShieldCheck },
  ];

  return (
    <aside className="w-64 border-r border-slate-200/80 bg-slate-50/50 flex flex-col h-screen sticky top-0">
      {/* Workspace Switcher */}
      <div className="h-16 flex items-center px-4 border-b border-slate-200/60">
        <button className="w-full flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-200/50 transition-colors">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-md bg-slate-900 flex items-center justify-center text-white shadow-sm shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="flex flex-col items-start truncate">
              <span className="font-semibold text-sm text-slate-900 truncate">StudentOps</span>
              <span className="text-[10px] text-slate-500 font-medium truncate">Engineering Branch</span>
            </div>
          </div>
          <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>
      </div>

      {/* Global Search / Command */}
      <div className="p-3">
        <button
          onClick={() => setActiveTab('chat')}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-md bg-white border border-slate-200 shadow-sm hover:border-slate-300 hover:shadow transition-all group cursor-pointer"
        >
          <div className="flex items-center space-x-2 text-slate-400 group-hover:text-slate-600">
            <Search className="w-3.5 h-3.5" />
            <span className="text-xs">Ask AI or search...</span>
          </div>
          <div className="flex items-center space-x-0.5 text-[10px] font-mono text-slate-400">
            <Command className="w-3 h-3" />
            <span>K</span>
          </div>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5 py-2">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2 mt-2">
          Operations
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-blue-50/80 text-blue-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.isAgent && (
                <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-blue-100/50 text-blue-700 text-[9px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                  AI
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer / User Profile */}
      <div className="p-4 border-t border-slate-200/60">
        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-200/50 transition-colors cursor-pointer">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              HR
            </div>
            <div className="flex flex-col items-start">
              <span className="text-xs font-semibold text-slate-900">Admin Lead</span>
              <span className="text-[10px] text-slate-500">v1.0.0</span>
            </div>
          </div>
          <Settings className="w-4 h-4 text-slate-400 hover:text-slate-600" />
        </div>
      </div>
    </aside>
  );
};
