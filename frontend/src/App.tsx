import { useEffect, useState } from 'react';
import { ToastProvider } from './context/ToastContext';
import { LanguageProvider } from './context/LanguageContext';
import { LandingPage } from './components/LandingPage';
import { LoginPage } from './components/auth/LoginPage';
import { RegisterPage } from './components/auth/RegisterPage';
import { Sidebar } from './components/Sidebar';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { MobileTabBar } from './components/MobileTabBar';
import { canAccessTab, type Role, type Tab } from './components/navigation';
import { api } from './api/client';
import type { UserProfile } from './types';
import { isAppPath, navigate, ROUTES, useLocationPath } from './hooks/useLocationPath';
import { navItemFor } from './components/navigation';

import { Dashboard } from './components/Dashboard';
import { AgentChat } from './components/AgentChat';
import { StudentsPage } from './components/StudentsPage';
import { AttendanceView } from './components/AttendanceView';
import { StudentScoreboard } from './components/StudentScoreboard';
import { CalendarView } from './components/CalendarView';
import { TaskManagement } from './components/TaskManagement';
import { TaskReviewsPage } from './components/TaskReviewsPage';
import { CommitteeQnA } from './components/CommitteeQnA';
import { MemberFeedbackView } from './components/MemberFeedbackView';
import { CommitteeReportsView } from './components/CommitteeReportsView';
import { NotificationsPage } from './components/NotificationsPage';
import { AuditViewer } from './components/AuditViewer';
import { WhatsAppAgentPage } from './components/WhatsAppAgentPage';

const COLLAPSE_KEY = 'studentops_sidebar_collapsed';

function AppContent() {
  const path = useLocationPath();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(api.getUser());
  const [checkingSession, setCheckingSession] = useState(() => Boolean(api.getToken()));

  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [chatQuery, setChatQuery] = useState<string | undefined>(undefined);

  const role: Role = currentUser?.role || 'member';

  // Resolve the requested tab, falling back to Overview when the role cannot
  // access it. This keeps deep links and the browser back button safe.
  const requested = path.startsWith('/app/') ? path.slice('/app/'.length) : '';
  const activeTab: Tab = canAccessTab(role, requested as Tab) ? (requested as Tab) : 'dashboard';

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    } catch {
      // Storage can be unavailable in private browsing; collapse is cosmetic.
    }
  }, [collapsed]);

  // Validate a stored session on first load.
  useEffect(() => {
    if (!api.getToken()) {
      setCheckingSession(false);
      return;
    }
    let active = true;
    api.getMe()
      .then(user => { if (active) setCurrentUser(user); })
      .catch(() => { if (active) { api.logout(); setCurrentUser(null); } })
      .finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, []);

  const authenticated = Boolean(currentUser);

  // Route guards: workspace requires a session, auth pages require no session.
  useEffect(() => {
    if (checkingSession) return;
    if (isAppPath(path) && !authenticated) {
      navigate(ROUTES.login, true);
    } else if (path === '/app' && authenticated) {
      navigate('/app/dashboard', true);
    } else if (authenticated && (path === ROUTES.login || path === ROUTES.signup)) {
      navigate('/app/dashboard', true);
    } else if (isAppPath(path) && path !== `/app/${activeTab}`) {
      navigate(`/app/${activeTab}`, true);
    }
  }, [path, checkingSession, authenticated, activeTab]);

  useEffect(() => {
    if (path === '/') {
      document.title = 'StudentOps — Operations for student organizations';
    } else if (path === ROUTES.login) {
      document.title = 'Sign in — StudentOps';
    } else if (path === ROUTES.signup) {
      document.title = 'Create an account — StudentOps';
    } else {
      document.title = `${navItemFor(activeTab)?.label ?? 'Workspace'} — StudentOps`;
    }
  }, [path, activeTab]);

  useEffect(() => { setNavOpen(false); }, [path]);

  const goTo = (tab: Tab) => {
    if (!canAccessTab(role, tab)) return;
    navigate(`/app/${tab}`);
  };

  const handleLogin = (user: UserProfile) => {
    setCurrentUser(user);
    setCheckingSession(false);
    navigate('/app/dashboard', true);
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setChatQuery(undefined);
    navigate(ROUTES.login, true);
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status">
        <p className="text-sm text-slate-500">Checking your session…</p>
      </div>
    );
  }

  if (path === '/') return <LandingPage signedIn={authenticated} />;
  if (path === ROUTES.login) {
    return <LoginPage onLogin={handleLogin} onGoToRegister={() => navigate(ROUTES.signup)} />;
  }
  if (path === ROUTES.signup) {
    return <RegisterPage onRegister={handleLogin} onGoToLogin={() => navigate(ROUTES.login)} />;
  }

  if (!isAppPath(path)) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This address does not match a StudentOps page.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex min-h-12 w-fit items-center rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Back to home
        </a>
      </main>
    );
  }

  if (!currentUser) return null;

  return (
    <div className="flex min-h-dvh bg-slate-50">
      <a href="#workspace-content" className="skip-link">Skip to content</a>

      <Sidebar
        activeTab={activeTab}
        setActiveTab={goTo}
        role={role}
        currentUser={currentUser}
        onLogout={handleLogout}
        isMobileOpen={navOpen}
        setIsMobileOpen={setNavOpen}
        isDesktopCollapsed={collapsed}
        setIsDesktopCollapsed={setCollapsed}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader
          role={role}
          onNavigate={goTo}
          onOpenNavigation={() => setNavOpen(true)}
          isNavigationOpen={navOpen}
        />

        <main
          id="workspace-content"
          tabIndex={-1}
          className={`min-w-0 flex-1 outline-none ${
            // Chat manages its own full-height scroll container.
            activeTab === 'chat'
              ? 'flex min-h-0 flex-col'
              : 'px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10'
          }`}
        >
          <div className={`mx-auto w-full min-w-0 ${activeTab === 'chat' ? 'flex min-h-0 flex-1 flex-col' : 'max-w-6xl'}`}>
            {activeTab === 'dashboard' && (
              <Dashboard
                currentUser={currentUser}
                onNavigateToTab={goTo}
                onSendChatQuery={query => { setChatQuery(query); goTo('chat'); }}
              />
            )}            {activeTab === 'chat' && (
              <AgentChat
                initialQuery={chatQuery}
                onClearInitialQuery={() => setChatQuery(undefined)}
                isDesktopCollapsed={collapsed}
              />
            )}
            {activeTab === 'students' && <StudentsPage currentUser={currentUser} />}
            {activeTab === 'attendance' && <AttendanceView currentUser={currentUser} />}
            {activeTab === 'scoreboard' && <StudentScoreboard currentUser={currentUser} />}
            {activeTab === 'calendar' && <CalendarView />}
            {activeTab === 'tasks' && <TaskManagement currentUser={currentUser} />}
            {activeTab === 'task-reviews' && <TaskReviewsPage currentUser={currentUser} />}
            {activeTab === 'qna' && <CommitteeQnA currentUser={currentUser} />}
            {activeTab === 'feedback' && <MemberFeedbackView currentUser={currentUser} />}
            {activeTab === 'reports' && <CommitteeReportsView currentUser={currentUser} />}
            {activeTab === 'whatsapp' && <WhatsAppAgentPage currentUser={currentUser} />}
            {activeTab === 'notifications' && <NotificationsPage currentUser={currentUser} />}
            {activeTab === 'audit' && <AuditViewer />}
          </div>
        </main>
      </div>

      <MobileTabBar role={role} activeTab={activeTab} onNavigate={goTo} />
    </div>
  );
}

export function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </LanguageProvider>
  );
}

export default App;
