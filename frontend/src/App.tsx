import { useState, useEffect } from 'react';
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
import { StudentsPage }       from './components/StudentsPage';
import { NotificationsPage }  from './components/NotificationsPage';
import { AuditViewer }        from './components/AuditViewer';
import { api }                from './api/client';
import { UserProfile }        from './types';

type AuthScreen = 'login' | 'register' | 'app';

export function App() {
  const initialUser = api.getUser();
  const [screen, setScreen]             = useState<AuthScreen>(initialUser && api.getToken() ? 'app' : 'login');
  const [currentUser, setCurrentUser]   = useState<UserProfile | null>(initialUser);
  const [userRole, setUserRole]         = useState<Role>(initialUser?.role || 'hr_admin');
  const [activeTab, setActiveTab]       = useState<Tab>('dashboard');
  const [chatInitialQuery, setChatInitialQuery] = useState<string | undefined>(undefined);

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
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        role={userRole}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 lg:px-10 py-8">
          <div className="max-w-5xl mx-auto w-full">
            {activeTab === 'dashboard'     && <Dashboard onNavigateToTab={(t) => setActiveTab(t as Tab)} onSendChatQuery={handleSendChatQuery} />}
            {activeTab === 'chat'          && <AgentChat initialQuery={chatInitialQuery} onClearInitialQuery={() => setChatInitialQuery(undefined)} />}
            {activeTab === 'students'      && <StudentsPage />}
            {activeTab === 'attendance'    && <AttendanceView />}
            {activeTab === 'scoreboard'    && <StudentScoreboard />}
            {activeTab === 'calendar'      && <CalendarView />}
            {activeTab === 'tasks'         && <TaskManagement />}
            {activeTab === 'task-reviews'  && <TaskReviewsPage />}
            {activeTab === 'notifications' && <NotificationsPage />}
            {activeTab === 'audit'         && <AuditViewer />}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
