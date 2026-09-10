import { useState, useEffect } from 'react';
import { Menu, Layers } from 'lucide-react';
import { Sidebar, Tab, Role } from './components/Sidebar';
import { LoginPage }          from './components/auth/LoginPage';
import { RegisterPage }       from './components/auth/RegisterPage';
import { Dashboard }          from './components/Dashboard';
import { AgentChat }          from './components/AgentChat';
import { AttendanceView }     from './components/AttendanceView';
import { StudentScoreboard }  from './components/StudentScoreboard';
import { CalendarView }       from './components/CalendarView';
import { TaskManagement }     from './components/TaskManagement';
import { TaskReviewsPage }    from './components/TaskReviewsPage';
import { CommitteeQnA }       from './components/CommitteeQnA';
import { MemberFeedbackView } from './components/MemberFeedbackView';
import { CommitteeReportsView } from './components/CommitteeReportsView';
import { StudentsPage }       from './components/StudentsPage';
import { NotificationsPage }  from './components/NotificationsPage';
import { AuditViewer }        from './components/AuditViewer';
import { WhatsAppAgentPage }  from './components/WhatsAppAgentPage';
import { api }                from './api/client';
import { UserProfile }        from './types';
import { ToastProvider }      from './context/ToastContext';

type AuthScreen = 'login' | 'register' | 'app';

function AppContent() {
  const initialUser = api.getUser();
  const [screen, setScreen]             = useState<AuthScreen>(initialUser && api.getToken() ? 'app' : 'login');
  const [currentUser, setCurrentUser]   = useState<UserProfile | null>(initialUser);
  const [userRole, setUserRole]         = useState<Role>(initialUser?.role || 'hr_admin');
  const [activeTab, setActiveTab]       = useState<Tab>('dashboard');
  const [chatInitialQuery, setChatInitialQuery] = useState<string | undefined>(undefined);

  // Responsive sidebar states
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('studentops_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('studentops_sidebar_collapsed', String(isDesktopCollapsed));
    } catch {
      // Ignore storage errors
    }
  }, [isDesktopCollapsed]);

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      api.getMe()
        .then((user) => {
          setCurrentUser(user);
          setUserRole(user.role);
          setScreen('app');
        })
        .catch(() => {
          api.logout();
          setCurrentUser(null);
          setScreen('login');
        });
    } else {
      setScreen('login');
    }
  }, []);

  const handleLogin = (user: UserProfile) => {
    setCurrentUser(user);
    setUserRole(user.role);
    setScreen('app');
    setActiveTab('dashboard');
  };

  const handleRegister = (user: UserProfile) => {
    setCurrentUser(user);
    setUserRole(user.role);
    setScreen('app');
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setScreen('login');
    setActiveTab('dashboard');
  };

  const handleSendChatQuery = (query: string) => {
    setChatInitialQuery(query);
    setActiveTab('chat');
  };

  // ── Auth screens ──────────────────────────────────────────────────────────
  if (screen === 'login') {
    return (
      <LoginPage
        onLogin={handleLogin}
        onGoToRegister={() => setScreen('register')}
      />
    );
  }

  if (screen === 'register') {
    return (
      <RegisterPage
        onRegister={handleRegister}
        onGoToLogin={() => setScreen('login')}
      />
    );
  }

  // ── Main app shell ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex antialiased selection:bg-blue-600 selection:text-white">
      {/* Mobile Backdrop Overlay (Native Blur) */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 md:hidden transition-opacity"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Side Panel (Full-screen on Mobile, Collapsible on Desktop) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        role={userRole}
        currentUser={currentUser}
        onLogout={handleLogout}
        isMobileOpen={isMobileSidebarOpen}
        setIsMobileOpen={setIsMobileSidebarOpen}
        isDesktopCollapsed={isDesktopCollapsed}
        setIsDesktopCollapsed={setIsDesktopCollapsed}
      />

      <main className="flex-1 flex flex-col min-h-screen min-w-0 overflow-hidden">
        {/* Mobile Header Bar (Only shown on phones < md) */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-white/95 backdrop-blur border-b border-slate-200/80 shrink-0">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2 -ml-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300"
              aria-label="Open navigation menu"
              aria-expanded={isMobileSidebarOpen}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-md bg-slate-900 flex items-center justify-center shrink-0 shadow-xs">
                <Layers className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-sm text-slate-900">StudentOps.AI</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 capitalize border border-slate-200/60">
              {activeTab.replace('-', ' ')}
            </span>
          </div>
        </header>

        {/* Scrollable Page View Container */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="max-w-5xl mx-auto w-full">
            {activeTab === 'dashboard'     && <Dashboard onNavigateToTab={(t) => setActiveTab(t as Tab)} onSendChatQuery={handleSendChatQuery} />}
            {activeTab === 'chat'          && (
              <AgentChat
                initialQuery={chatInitialQuery}
                onClearInitialQuery={() => setChatInitialQuery(undefined)}
                isDesktopCollapsed={isDesktopCollapsed}
              />
            )}
            {activeTab === 'students'      && <StudentsPage />}
            {activeTab === 'attendance'    && <AttendanceView currentUser={currentUser} />}
            {activeTab === 'scoreboard'    && <StudentScoreboard currentUser={currentUser} />}
            {activeTab === 'calendar'      && <CalendarView />}
            {activeTab === 'tasks'         && <TaskManagement currentUser={currentUser} />}
            {activeTab === 'task-reviews'  && <TaskReviewsPage currentUser={currentUser} />}
            {activeTab === 'qna'           && <CommitteeQnA currentUser={currentUser} />}
            {activeTab === 'feedback'      && <MemberFeedbackView currentUser={currentUser} />}
            {activeTab === 'reports'       && <CommitteeReportsView currentUser={currentUser} />}
            {activeTab === 'whatsapp'      && currentUser && <WhatsAppAgentPage currentUser={currentUser} />}
            {activeTab === 'notifications' && <NotificationsPage />}
            {activeTab === 'audit'         && <AuditViewer />}
          </div>
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
