import React, { useEffect, useState } from 'react';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Clock, 
  Calendar, 
  Bot, 
  Send, 
  Award, 
  Video, 
  ChevronRight,
  Zap,
  Activity
} from 'lucide-react';
import { api } from '../api/client';
import { DashboardStats, MeetingDetail, StudentScoreSummary } from '../types';
import { ProgressBar } from './ui/ProgressBar';

interface DashboardProps {
  onNavigateToTab: (tab: string) => void;
  onSendChatQuery: (query: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigateToTab, onSendChatQuery }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [meetings, setMeetings] = useState<MeetingDetail[]>([]);
  const [scoreboard, setScoreboard] = useState<StudentScoreSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [statsData, meetingsData, , scoreData] = await Promise.all([
          api.getStats(),
          api.getMeetings(),
          api.getEvents(),
          api.getScoreboard()
        ]);
        setStats(statsData);
        setMeetings(meetingsData);
        setScoreboard(scoreData);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const adminActions = [
    {
      title: "Analyze Absences",
      prompt: "Who was absent from today's meeting?",
      icon: UserX,
      shortcut: "⌘1"
    },
    {
      title: "Dispatch Reminders",
      prompt: "Remind them about the next meeting",
      icon: Send,
      shortcut: "⌘2"
    },
    {
      title: "Scorecard Review",
      prompt: "Show me Maurine's evaluation scores and behavior breakdown",
      icon: Award,
      shortcut: "⌘3"
    },
    {
      title: "Pending Tasks",
      prompt: "Who hasn't submitted their assigned tasks?",
      icon: Clock,
      shortcut: "⌘4"
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center space-y-3 opacity-60">
          <Activity className="w-5 h-5 text-slate-800 animate-pulse" />
          <p className="text-slate-500 text-xs font-mono">Initializing Cockpit...</p>
        </div>
      </div>
    );
  }

  const latestMeeting = meetings[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Vercel Style Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 mb-2">
            <span className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Systems Nominal</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
              Sprint 4
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Overview
          </h1>
          <p className="text-[13px] text-slate-500 max-w-xl">
            Real-time telemetry for StudentOps operations. AI agent ready for multi-turn execution.
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => onNavigateToTab('chat')}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center space-x-2"
          >
            <Bot className="w-4 h-4" />
            <span>Launch AI Agent</span>
          </button>
        </div>
      </div>

      {/* Dense Vercel/Linear Style Telemetry Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Total Registry', value: stats?.total_students || 0, delta: '+100% verified', icon: Users, color: 'text-blue-600' },
          { title: 'Today\'s Attendance', value: `${stats?.attendance_rate_today || 0}%`, delta: `${stats?.absent_today} absent`, icon: UserCheck, color: 'text-emerald-600' },
          { title: 'Synced Events', value: stats?.upcoming_meetings_count || 0, delta: 'next in 2 days', icon: Calendar, color: 'text-slate-700' },
          { title: 'Pending Tasks', value: stats?.pending_submissions_count || 0, delta: 'requires review', icon: Clock, color: 'text-amber-600' },
        ].map((stat, i) => (
          <div key={i} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-slate-300 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-semibold text-slate-500">{stat.title}</span>
              <stat.icon className={`w-4 h-4 ${stat.color} opacity-80`} />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">{stat.value}</span>
              <span className="text-[11px] text-slate-400 mt-1 font-medium">{stat.delta}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Vercel Style Command Strip (Calmer than previous Bento) */}
      <div>
        <h3 className="text-[13px] font-semibold text-slate-900 mb-3 flex items-center">
          <Zap className="w-4 h-4 mr-1.5 text-amber-500" />
          Quick Agent Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {adminActions.map((act, idx) => (
            <button
              key={idx}
              onClick={() => onSendChatQuery(act.prompt)}
              className="p-3 bg-white border border-slate-200 rounded-lg hover:border-blue-400 hover:shadow-sm transition-all text-left group flex flex-col justify-between h-24"
            >
              <div className="flex items-center justify-between">
                <act.icon className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                  {act.shortcut}
                </span>
              </div>
              <div>
                <div className="text-[13px] font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">
                  {act.title}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Split Views (Meet / Leaderboard) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
        
        {/* Left: Latest Sync Log */}
        <div className="flex flex-col border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-slate-700 flex items-center">
              <Video className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
              Latest Meet Sync
            </span>
            <button onClick={() => onNavigateToTab('attendance')} className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center">
              View All <ChevronRight className="w-3 h-3 ml-0.5" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            {latestMeeting ? (
              <>
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{latestMeeting.title}</h4>
                    <span className="text-[11px] font-mono text-slate-500">{latestMeeting.meeting_code}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold uppercase tracking-wider">Processed</span>
                </div>
                
                <ProgressBar
                  value={latestMeeting.present_count}
                  max={latestMeeting.total_expected || 5}
                  color="emerald"
                />
                
                <div className="flex justify-between items-center text-xs font-mono pt-2 border-t border-slate-100">
                  <span className="text-emerald-700">{latestMeeting.present_count} P</span>
                  <span className="text-amber-700">{latestMeeting.late_count} L</span>
                  <span className="text-rose-700">{latestMeeting.absent_count} A</span>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-400">No sync logs found.</div>
            )}
          </div>
        </div>

        {/* Right: Top Standings */}
        <div className="flex flex-col border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-slate-700 flex items-center">
              <Award className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
              Top Performers
            </span>
            <button onClick={() => onNavigateToTab('scoreboard')} className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center">
              Full Board <ChevronRight className="w-3 h-3 ml-0.5" />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {scoreboard.slice(0, 3).map((student, idx) => (
              <div key={student.student_id} className="flex items-center justify-between p-3 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center space-x-3">
                  <span className="font-mono text-[11px] font-bold text-slate-400 w-4">#{idx + 1}</span>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-bold text-slate-900">{student.arabic_name}</span>
                    <span className="text-[11px] text-slate-500">{student.student_name}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right flex flex-col">
                    <span className="text-[12px] font-mono text-slate-700">{student.total_behavior_score}/23</span>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">Behavior</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
