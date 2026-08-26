import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { AgentChat } from './components/AgentChat';
import { AttendanceView } from './components/AttendanceView';
import { StudentScoreboard } from './components/StudentScoreboard';
import { CalendarView } from './components/CalendarView';
import { TaskManagement } from './components/TaskManagement';
import { AuditViewer } from './components/AuditViewer';

export function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [chatInitialQuery, setChatInitialQuery] = useState<string | undefined>(undefined);

  const handleSendChatQuery = (query: string) => {
    setChatInitialQuery(query);
    setActiveTab('chat');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex antialiased selection:bg-blue-600 selection:text-white">
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto w-full mx-auto px-6 sm:px-8 lg:px-12 py-8 bg-ambient-mesh">
          <div className="max-w-6xl mx-auto w-full h-full flex flex-col">
            {activeTab === 'dashboard' && (
              <Dashboard 
                onNavigateToTab={setActiveTab} 
                onSendChatQuery={handleSendChatQuery} 
              />
            )}
            {activeTab === 'chat' && (
              <AgentChat 
                initialQuery={chatInitialQuery} 
                onClearInitialQuery={() => setChatInitialQuery(undefined)} 
              />
            )}
            {activeTab === 'attendance' && <AttendanceView />}
            {activeTab === 'scoreboard' && <StudentScoreboard />}
            {activeTab === 'calendar' && <CalendarView />}
            {activeTab === 'tasks' && <TaskManagement />}
            {activeTab === 'audit' && <AuditViewer />}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
