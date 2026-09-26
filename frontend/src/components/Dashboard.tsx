import React, { useEffect, useState } from 'react';
import { 
  Users, 
  UserCheck, 
  Clock, 
  Calendar, 
  Bot, 
  Award, 
  Video, 
  ChevronRight, 
  ArrowRight,
  ExternalLink,
  CheckSquare,
  Activity,
  AlertCircle,
  HelpCircle,
  Bell,
  MessageSquare
} from 'lucide-react';
import { api } from '../api/client';
import { DashboardStats, MeetingDetail, StudentScoreSummary, EventItem, UserProfile, ReminderItem } from '../types';
import { ProgressBar } from './ui/ProgressBar';
import { Badge } from './ui/Badge';
import { type Tab } from './navigation';
import { useLanguage } from '../context/LanguageContext';

interface DashboardProps {
  currentUser?: UserProfile | null;
  onNavigateToTab: (tab: Tab) => void;
  onSendChatQuery: (query: string) => void;
}

const ROLE_DISPLAY_NAMES: Record<string, { en: string; ar: string }> = {
  region_hr_head: { en: 'Region HR Head', ar: 'رئيس الموارد البشرية الإقليمي' },
  committee_hr_leader: { en: 'HR Committee Leader', ar: 'قائد موارد اللجنة' },
  committee_head: { en: 'Committee Head', ar: 'رئيس اللجنة' },
  committee_hr_member: { en: 'HR Committee Member', ar: 'مسؤول الموارد البشرية' },
  committee_member: { en: 'Committee Member', ar: 'عضو اللجنة' },
  hr_admin: { en: 'HR Admin', ar: 'إدارة الموارد البشرية' },
  team_lead: { en: 'Team Lead', ar: 'قائد الفريق' },
  member: { en: 'Member', ar: 'عضو' },
};

function formatMeetingDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatRelativeEventTime(dateStr: string): string {
  try {
    const target = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60));
    
    if (diffHours > 0 && diffHours < 24) {
      return `Today in ${diffHours}h`;
    } else if (diffHours >= 24 && diffHours < 48) {
      return 'Tomorrow';
    } else if (diffHours < 0 && diffHours > -24) {
      return 'Earlier today';
    } else {
      return target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  } catch {
    return '';
  }
}

function getRatingBadgeVariant(rating: string): 'success' | 'info' | 'warning' | 'neutral' {
  const normalized = rating.toLowerCase();
  if (normalized.includes('outstanding') || normalized.includes('ممتاز')) return 'success';
  if (normalized.includes('good') || normalized.includes('جيد')) return 'info';
  if (normalized.includes('review') || normalized.includes('مراجعة')) return 'warning';
  return 'neutral';
}

function getMeetingStatusBadge(status: string): { label: string; variant: 'success' | 'info' | 'warning' | 'danger' | 'neutral' } {
  const norm = (status || '').toUpperCase();
  if (norm === 'COMPLETED' || norm === 'PROCESSED') {
    return { label: 'Completed', variant: 'success' };
  }
  if (norm === 'LIVE' || norm === 'IN_PROGRESS') {
    return { label: 'Live Now', variant: 'danger' };
  }
  if (norm === 'SCHEDULED') {
    return { label: 'Scheduled', variant: 'info' };
  }
  return { label: status || 'Recorded', variant: 'neutral' };
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  currentUser, 
  onNavigateToTab, 
  onSendChatQuery 
}) => {
  const { t } = useLanguage();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [meetings, setMeetings] = useState<MeetingDetail[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [scoreboard, setScoreboard] = useState<StudentScoreSummary[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [loading, setLoading] = useState(true);

  const isMember = currentUser?.role === 'committee_member' || currentUser?.role === 'member';

  useEffect(() => {
    async function loadData() {
      try {
        const promises: Promise<any>[] = [
          api.getStats(),
          api.getMeetings(),
          api.getEvents(),
          api.getScoreboard()
        ];
        if (isMember) {
          promises.push(api.getReminders());
        }
        const [statsData, meetingsData, eventsData, scoreData, remindersData] = await Promise.all(promises);
        setStats(statsData);
        setMeetings(meetingsData || []);
        setEvents(eventsData || []);
        setScoreboard(scoreData || []);
        if (remindersData) {
          setReminders(remindersData);
        }
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isMember]);

  const userRole = currentUser?.role || 'hr_admin';
  const roleInfo = ROLE_DISPLAY_NAMES[userRole] || { en: 'Operations', ar: 'العمليات' };

  // Generate role-specific, functional prompt chips (no fake keyboard shortcuts)
  const getContextualPrompts = () => {
    if (userRole === 'committee_head' || userRole === 'team_lead') {
      return [
        {
          title: 'Pending Submissions',
          desc: 'Inspect member tasks awaiting review',
          prompt: 'Which members currently have pending task submissions awaiting review?',
          icon: Clock
        },
        {
          title: 'Committee Attendance',
          desc: 'Analyze participation in our last session',
          prompt: 'Who was absent from our most recent committee meeting?',
          icon: UserCheck
        },
        {
          title: 'Task Completion Rates',
          desc: 'Review deliverable milestones',
          prompt: 'Show committee task completion rates and quality averages',
          icon: CheckSquare
        },
        {
          title: 'Dispatch Meeting Notice',
          desc: 'Coordinate next committee schedule',
          prompt: 'Draft an attendance reminder for the upcoming committee session',
          icon: Video
        }
      ];
    }

    if (userRole === 'committee_member' || userRole === 'member') {
      return [
        {
          title: 'My Evaluation Summary',
          desc: 'View your behavior points and task quality',
          prompt: 'What are my current attendance and task evaluation scores?',
          icon: Award
        },
        {
          title: 'Upcoming Deadlines',
          desc: 'Check deliverables due this week',
          prompt: 'What tasks and meetings are scheduled for me this week?',
          icon: Calendar
        },
        {
          title: 'Submit Excuse',
          desc: 'File an excuse for an absence',
          prompt: 'How do I submit an excuse for an upcoming or missed session?',
          icon: HelpCircle
        },
        {
          title: 'Ask Operations',
          desc: 'Inquire about committee guidelines',
          prompt: 'What are the criteria for outstanding performance this semester?',
          icon: Bot
        }
      ];
    }

    // Default: HR Admin, Region HR Head, Committee HR Leader/Member
    return [
      {
        title: 'Attendance Discrepancies',
        desc: 'Review members flagged for absence follow-up',
        prompt: "Who was absent or late in today's sync, and who needs an excuse review?",
        icon: AlertCircle
      },
      {
        title: 'At-Risk Members (< 70%)',
        desc: 'Detect members falling below retention threshold',
        prompt: 'Which students have an attendance rate below 70%?',
        icon: UserCheck
      },
      {
        title: 'Scoreboard Overview',
        desc: 'Summarize top performers and behavior tiers',
        prompt: 'Provide a summary of student evaluations and top standings by committee',
        icon: Award
      },
      {
        title: 'Pending HR Escalations',
        desc: 'Audit unresolved member outreach actions',
        prompt: 'Show all open WhatsApp follow-up cases and overdue member inquiries',
        icon: Clock
      }
    ];
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Skeleton Header */}
        <div className="pb-6 border-b border-slate-200/80 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="h-5 w-36 bg-slate-200 rounded" />
            <div className="h-7 w-64 bg-slate-200 rounded" />
            <div className="h-4 w-96 bg-slate-100 rounded" />
          </div>
          <div className="h-9 w-32 bg-slate-200 rounded" />
        </div>

        {/* Skeleton Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="h-4 w-24 bg-slate-100 rounded" />
              <div className="h-6 w-16 bg-slate-200 rounded" />
              <div className="h-3 w-32 bg-slate-100 rounded" />
            </div>
          ))}
        </div>

        {/* Skeleton Content Split */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-white border border-slate-200 rounded-xl" />
          <div className="h-64 bg-white border border-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  const latestMeeting = meetings[0] || null;
  const nextEvent = events.find(e => new Date(e.start_time).getTime() >= Date.now() - 3600000) || events[0] || null;
  const topStudents = scoreboard.slice(0, 4);
  const contextualPrompts = getContextualPrompts();

  // Date formatting
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Authentic Domain Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200">
              {roleInfo.en}
            </span>
            {currentUser?.arabic_name && (
              <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 text-[11px] font-['Cairo'] border border-slate-200/80">
                {roleInfo.ar}
              </span>
            )}
            <span className="text-[11px] font-medium text-slate-400">
              {todayFormatted}
            </span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Operations overview
          </h1>
          {currentUser?.arabic_name && (
            <p
              lang="ar"
              dir="rtl"
              className="mt-1 font-arabic text-base text-slate-500"
            >
              {currentUser.arabic_name}
            </p>
          )}
          
          <p className="text-[13px] text-slate-500 max-w-2xl leading-relaxed">
            {currentUser?.team_name 
              ? `Operational metrics for ${currentUser.team_name}. Attendance rosters, active task reviews, and cohort schedule.`
              : 'Cohort-wide attendance rosters, evaluation standings, and operational task tracking.'}
          </p>
        </div>
        
        <div className="flex shrink-0 items-center">
          <button 
            onClick={() => onNavigateToTab('chat')}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <Bot aria-hidden="true" className="h-4 w-4" />
            <span>Open assistant</span>
          </button>
        </div>
      </div>

      {/* Honest Operational Metrics Bar (Grounded ground truth, no fake deltas) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Enrolled */}
        <button
          onClick={() => onNavigateToTab('students')}
          className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs hover:border-slate-300 transition-colors text-left group flex flex-col justify-between"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {currentUser?.team_name ? 'Committee Members' : 'Total Members'}
            </span>
            <Users className="w-4 h-4 text-blue-600 opacity-80 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">
              {stats?.total_students || 0}
            </span>
            <span className="text-[11px] text-slate-500 mt-1 font-medium flex items-center">
              <span>{currentUser?.team_name ? `Enrolled in ${currentUser.team_name}` : 'Active in registry'}</span>
              <ChevronRight className="w-3 h-3 ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
            </span>
          </div>
        </button>

        {/* Metric 2: Today's Attendance */}
        <button
          onClick={() => onNavigateToTab('attendance')}
          className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs hover:border-slate-300 transition-colors text-left group flex flex-col justify-between"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Today's Attendance
            </span>
            <UserCheck className="w-4 h-4 text-emerald-600 opacity-80 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">
              {stats?.attendance_rate_today ?? 0}%
            </span>
            <span className="text-[11px] text-slate-500 mt-1 font-medium">
              <span className="text-emerald-700 font-semibold">{stats?.present_today || 0}</span> Present ·{' '}
              <span className="text-amber-700 font-semibold">{stats?.late_today || 0}</span> Late ·{' '}
              <span className="text-rose-700 font-semibold">{stats?.absent_today || 0}</span> Absent
            </span>
          </div>
        </button>

        {/* Metric 3: Upcoming Sessions */}
        <button
          onClick={() => onNavigateToTab('calendar')}
          className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs hover:border-slate-300 transition-colors text-left group flex flex-col justify-between"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Scheduled Events
            </span>
            <Calendar className="w-4 h-4 text-slate-700 opacity-80 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">
              {stats?.upcoming_meetings_count ?? events.length}
            </span>
            <span className="text-[11px] text-slate-500 mt-1 font-medium truncate">
              {nextEvent ? (
                <>Next: {nextEvent.title}</>
              ) : (
                'No events on schedule'
              )}
            </span>
          </div>
        </button>

        {/* Metric 4: Role-Adaptive Focus */}
        {stats?.pending_submissions_count !== null && stats?.pending_submissions_count !== undefined ? (
          <button
            onClick={() => onNavigateToTab(userRole === 'committee_head' || userRole === 'team_lead' ? 'task-reviews' : 'tasks')}
            className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs hover:border-slate-300 transition-colors text-left group flex flex-col justify-between"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Pending Reviews
              </span>
              <CheckSquare className="w-4 h-4 text-amber-600 opacity-80 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {stats.pending_submissions_count}
              </span>
              <span className="text-[11px] text-amber-700 font-medium mt-1 flex items-center">
                <span>{stats.pending_submissions_count === 1 ? '1 task needs grading' : `${stats.pending_submissions_count} tasks need grading`}</span>
                <ChevronRight className="w-3 h-3 ml-0.5 text-amber-500" />
              </span>
            </div>
          </button>
        ) : (
          <button
            onClick={() => onNavigateToTab('audit')}
            className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs hover:border-slate-300 transition-colors text-left group flex flex-col justify-between"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Agent Audit Log
              </span>
              <Activity className="w-4 h-4 text-blue-600 opacity-80 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {stats?.recent_actions_count || 0}
              </span>
              <span className="text-[11px] text-slate-500 mt-1 font-medium">
                Audited operations logged
              </span>
            </div>
          </button>
        )}
      </div>

      {/* Split Views: Recent activity and standings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Latest Meeting + Upcoming Schedule */}
        <div className="space-y-6">
          {/* Latest Meeting Roster Card */}
          <div className="flex flex-col border border-slate-200 rounded-xl bg-white shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-slate-700 flex items-center">
                <Video className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                Latest Meeting Session
              </span>
              <button 
                onClick={() => onNavigateToTab('attendance')} 
                className="inline-flex min-h-9 shrink-0 items-center rounded px-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                View Roster <ChevronRight aria-hidden="true" className="ml-0.5 h-3 w-3" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {latestMeeting ? (
                <>
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{latestMeeting.title}</h4>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span className="font-mono">{latestMeeting.meeting_code}</span>
                        <span>·</span>
                        <span>{formatMeetingDate(latestMeeting.start_time)}</span>
                      </div>
                    </div>

                    {(() => {
                      const badge = getMeetingStatusBadge(latestMeeting.status);
                      return (
                        <Badge variant={badge.variant} size="sm">
                          {badge.label}
                        </Badge>
                      );
                    })()}
                  </div>
                  
                  {/* Attendance Calculation based on real counts */}
                  {(() => {
                    const recordedTotal = (latestMeeting.present_count || 0) + (latestMeeting.late_count || 0) + (latestMeeting.absent_count || 0);
                    const expectedTotal = latestMeeting.total_expected > 0 ? latestMeeting.total_expected : recordedTotal;
                    const calculatedMax = expectedTotal > 0 ? expectedTotal : 1;
                    const presentRatio = Math.round(((latestMeeting.present_count || 0) / calculatedMax) * 100);

                    return (
                      <div className="space-y-2 pt-1">
                        <ProgressBar
                          value={latestMeeting.present_count || 0}
                          max={calculatedMax}
                          color="emerald"
                          label={`Cohort Attendance (${presentRatio}%)`}
                          sublabel={`${latestMeeting.present_count || 0} of ${calculatedMax} members present`}
                        />

                        <div className="flex justify-between items-center text-xs font-mono pt-2 border-t border-slate-100 text-slate-600">
                          <span className="flex items-center text-emerald-700 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                            {latestMeeting.present_count || 0} Present
                          </span>
                          <span className="flex items-center text-amber-700 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />
                            {latestMeeting.late_count || 0} Late
                          </span>
                          <span className="flex items-center text-rose-700 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5" />
                            {latestMeeting.absent_count || 0} Absent
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {latestMeeting.meet_url && (
                    <div className="pt-2">
                      <a
                        href={latestMeeting.meet_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Meeting Link</span>
                      </a>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-6 text-center text-sm text-slate-400">
                  No meeting sessions logged yet.
                </div>
              )}
            </div>
          </div>

          {/* Upcoming Schedule Card (Utilizing real events!) */}
          <div className="flex flex-col border border-slate-200 rounded-xl bg-white shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-slate-700 flex items-center">
                <Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-600" />
                Upcoming Milestones & Deadlines
              </span>
              <button 
                onClick={() => onNavigateToTab('calendar')} 
                className="inline-flex min-h-9 shrink-0 items-center rounded px-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                Full Calendar <ChevronRight aria-hidden="true" className="ml-0.5 h-3 w-3" />
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {events.slice(0, 3).map((evt) => {
                const isMeeting = evt.event_type === 'meeting';
                const relativeTime = formatRelativeEventTime(evt.start_time);

                return (
                  <div key={evt.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                        isMeeting 
                          ? 'bg-blue-50 border-blue-100 text-blue-600' 
                          : 'bg-amber-50 border-amber-100 text-amber-600'
                      }`}>
                        {isMeeting ? <Video className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-slate-800 truncate">
                          {evt.title}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span>{formatMeetingDate(evt.start_time)}</span>
                          {relativeTime && (
                            <span className="text-slate-400 font-medium">({relativeTime})</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 ml-3">
                      {evt.meet_url ? (
                        <a 
                          href={evt.meet_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 bg-white border border-slate-200 hover:border-blue-300 rounded text-[11px] font-semibold text-slate-700 hover:text-blue-600 transition-colors inline-flex items-center space-x-1 shadow-xs"
                        >
                          <span>Join</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : (
                        <Badge variant={isMeeting ? 'info' : 'warning'} size="sm">
                          {isMeeting ? 'Session' : 'Deadline'}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}

              {events.length === 0 && (
                <div className="py-6 text-center text-sm text-slate-400">
                  No upcoming events scheduled.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Top Standings + Contextual Prompts */}
        <div className="space-y-6">
          {/* Right Column: Member Reminders (for members) OR Top Standings (for management) */}
          {isMember ? (
            <div className="flex flex-col border border-slate-200 rounded-xl bg-white shadow-xs overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-slate-700 flex items-center">
                  <Bell className="w-3.5 h-3.5 mr-1.5 rtl:mr-0 rtl:ml-1.5 text-blue-600" />
                  {t('myReminders')}
                </span>
                <button
                  onClick={() => onNavigateToTab('notifications')}
                  className="inline-flex min-h-9 shrink-0 items-center rounded px-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  {t('viewAll')} <ChevronRight aria-hidden="true" className="ml-0.5 h-3 w-3" />
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {reminders.slice(0, 4).map((rem) => {
                  const isWhatsApp = rem.channel === 'whatsapp';
                  return (
                    <div key={rem.id} className="flex items-start justify-between p-3.5 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-start space-x-3 rtl:space-x-reverse min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border mt-0.5 ${
                          isWhatsApp ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-blue-50 border-blue-100 text-blue-600'
                        }`}>
                          {isWhatsApp ? <MessageSquare className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold text-slate-900 truncate">
                            {rem.title || 'Operational Notice'}
                          </span>
                          <span className="text-[11px] text-slate-500 line-clamp-1">
                            {rem.message_content}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {rem.sent_at ? new Date(rem.sent_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {reminders.length === 0 && (
                  <div className="py-6 text-center text-sm text-slate-400">
                    {t('noReminders')}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Top Standings / Evaluation Board for Management */
            <div className="flex flex-col border border-slate-200 rounded-xl bg-white shadow-xs overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-slate-700 flex items-center">
                  <Award className="w-3.5 h-3.5 mr-1.5 rtl:mr-0 rtl:ml-1.5 text-blue-600" />
                  Member Evaluations & Standings
                </span>
                <button
                  onClick={() => onNavigateToTab('scoreboard')}
                  className="inline-flex min-h-9 shrink-0 items-center rounded px-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  {t('viewAll')} <ChevronRight aria-hidden="true" className="ml-0.5 h-3 w-3" />
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {topStudents.map((student, idx) => {
                  const badgeVariant = getRatingBadgeVariant(student.overall_rating || '');
                  return (
                    <div key={student.student_id} className="flex items-center justify-between p-3.5 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center space-x-3 rtl:space-x-reverse min-w-0">
                        <span className="font-mono text-[11px] font-bold text-slate-400 w-5">
                          #{idx + 1}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-bold text-slate-900 font-['Cairo'] truncate">
                            {student.arabic_name}
                          </span>
                          <span className="text-[11px] text-slate-500 truncate">
                            {student.student_name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 rtl:space-x-reverse shrink-0 ml-3 rtl:ml-0 rtl:mr-3">
                        <Badge variant={badgeVariant} size="sm">
                          {student.overall_rating || 'Evaluated'}
                        </Badge>

                        <div className="text-right rtl:text-left flex flex-col min-w-[52px]">
                          <span className="text-[12px] font-mono font-bold text-slate-800">
                            {student.total_behavior_score}/23
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            Behavior
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {topStudents.length === 0 && (
                  <div className="py-6 text-center text-sm text-slate-400">
                    No student evaluation records found.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Contextual Operations Starters (Functional & Honest, No Fake Shortcuts) */}
          <div className="flex flex-col border border-slate-200 rounded-xl bg-white shadow-xs p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5 uppercase tracking-wider">
                <Bot className="w-3.5 h-3.5 text-blue-600" />
                <span>Operational Action Starters</span>
              </span>
              <span className="text-[10px] font-medium text-slate-400">
                Click to query agent
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {contextualPrompts.map((item, idx) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => onSendChatQuery(item.prompt)}
                    className="p-3 bg-slate-50 hover:bg-white border border-slate-200/80 hover:border-blue-300 rounded-lg text-left transition-all group flex flex-col justify-between shadow-2xs hover:shadow-xs"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <IconComponent className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-600 transition-colors" />
                      <ArrowRight className="w-3 h-3 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">
                        {item.title}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">
                        {item.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
export default Dashboard;
