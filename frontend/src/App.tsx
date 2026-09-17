import { useState, useEffect } from 'react';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { ThemeProvider } from './context/ThemeContext';
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
import { LandingPage } from './components/LandingPage';
import { navigate, useLocationPath } from './hooks/useLocationPath';
import { NAV_ITEMS } from './components/Sidebar';
import { ProfilePage } from './components/ProfilePage';

function AppContent() {
  const path = useLocationPath();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [checkingSession, setCheckingSession] = useState(() => Boolean(api.getToken()));
  const userRole: Role = currentUser?.role || 'member';
  const requestedTab = path.split('/')[2];
  const resolvedTab = requestedTab === 'whatsapp' ? 'inbox' : requestedTab;
  const activeTab: Tab = NAV_ITEMS.find(item => item.id === resolvedTab && item.roles.includes(userRole))?.id || 'dashboard';
  const setActiveTab = (tab: Tab) => navigate(`/app/${tab}`);
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
    let active = true;
    if (api.getToken()) {
      api.getMe().then(user => {
        if (active) setCurrentUser(user);
      }).catch(() => {
        if (active) { api.logout(); setCurrentUser(null); }
      }).finally(() => { if (active) setCheckingSession(false); });
    }
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (checkingSession) return;
    if (path.startsWith('/app') && !currentUser) navigate('/login', true);
    else if (currentUser && (path === '/login' || path === '/signup')) navigate('/app/dashboard', true);
    else if (currentUser && path.startsWith('/app/') && requestedTab !== activeTab) navigate(`/app/${activeTab}`, true);
  }, [path, checkingSession, currentUser, requestedTab, activeTab]);

  useEffect(() => {
    const title = path === '/' ? 'Student organization workspace' : path === '/login' ? 'Sign in' : path === '/signup' ? 'Create an account' : NAV_ITEMS.find(item => item.id === activeTab)?.label || 'Workspace';
    document.title = `${title} — StudentOps`;
    setIsMobileSidebarOpen(false);
  }, [path, activeTab]);

  const handleLogin = (user: UserProfile) => {
    setCurrentUser(user);
    setCheckingSession(false);
    navigate('/app/dashboard', true);
  };
  const handleRegister = handleLogin;

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setChatInitialQuery(undefined);
    navigate('/login', true);
  };

  const handleSendChatQuery = (query: string) => {
    setChatInitialQuery(query);
    setActiveTab('chat');
  };

  if (path === '/') return <LandingPage signedIn={Boolean(currentUser)} />;
  if (checkingSession) return <main className="flex min-h-dvh items-center justify-center" role="status">Opening your workspace…</main>;
  if (path === '/login') return <LoginPage onLogin={handleLogin} onGoToRegister={() => navigate('/signup')} />;
  if (path === '/signup') return <RegisterPage onRegister={handleRegister} onGoToLogin={() => navigate('/login')} />;
  if (!path.startsWith('/app/')) return <main className="mx-auto max-w-lg px-6 py-24"><h1 className="text-3xl font-semibold">Page not found</h1><p className="mt-4 text-slate-600">This address doesn't match a StudentOps page.</p><a href="/" className="mt-6 inline-block underline">Return home</a></main>;
  if (!currentUser) return <main role="status" className="p-8">Opening sign in…</main>;

  // ── Main app shell ────────────────────────────────────────────────────────
  return (
    <div className="app-shell min-h-dvh bg-slate-50 flex antialiased">
      <a href="#workspace-content" className="skip-link">Skip to content</a>
      {/* Mobile Backdrop Overlay (Native Blur) */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden"
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

      <main className="flex-1 flex flex-col min-h-dvh min-w-0" inert={isMobileSidebarOpen}>
        <WorkspaceHeader
          key={currentUser.id}
          currentUser={currentUser}
          onNavigate={setActiveTab}
          onOpenNavigation={() => setIsMobileSidebarOpen(true)}
          isMobileSidebarOpen={isMobileSidebarOpen}
        />

        {/* Scrollable Page View Container */}
        <div id="workspace-content" tabIndex={-1} className={`flex-1 min-w-0 outline-none ${activeTab === 'chat' ? '' : 'px-4 sm:px-8 lg:px-10 py-6 sm:py-8'}`}>
          <div className="max-w-7xl mx-auto w-full min-w-0">
            {activeTab === 'dashboard'     && (
              <Dashboard
                currentUser={currentUser}
                onNavigateToTab={(t) => setActiveTab(t as Tab)}
                onSendChatQuery={handleSendChatQuery}
              />
            )}
            {activeTab === 'chat'          && (
              <AgentChat
                initialQuery={chatInitialQuery}
                onClearInitialQuery={() => setChatInitialQuery(undefined)}
                isDesktopCollapsed={isDesktopCollapsed}
              />
            )}
            {activeTab === 'students'      && <StudentsPage currentUser={currentUser} />}
            {activeTab === 'attendance'    && <AttendanceView currentUser={currentUser} />}
            {activeTab === 'scoreboard'    && <StudentScoreboard currentUser={currentUser} />}
            {activeTab === 'calendar'      && <CalendarView />}
            {activeTab === 'tasks'         && <TaskManagement currentUser={currentUser} />}
            {activeTab === 'task-reviews'  && <TaskReviewsPage currentUser={currentUser} />}
            {activeTab === 'qna'           && <CommitteeQnA currentUser={currentUser} />}
            {activeTab === 'feedback'      && <MemberFeedbackView currentUser={currentUser} />}
            {activeTab === 'reports'       && <CommitteeReportsView currentUser={currentUser} />}
            {activeTab === 'inbox'         && <WhatsAppAgentPage currentUser={currentUser} view="chat" />}
            {activeTab === 'follow-ups'    && <WhatsAppAgentPage currentUser={currentUser} view="escalations" />}
            {activeTab === 'channel-settings' && <WhatsAppAgentPage currentUser={currentUser} view="official" />}
            {activeTab === 'notifications' && <NotificationsPage />}
            {activeTab === 'audit'         && <AuditViewer />}
            {activeTab === 'profile'       && <ProfilePage key={currentUser.id} currentUser={currentUser} />}
          </div>
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
