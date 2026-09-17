import React, { useEffect, useState } from 'react';
import { Bot, ChevronRight, ArrowRight, ExternalLink } from 'lucide-react';
import { api } from '../api/client';
import { DashboardStats, MeetingDetail, StudentScoreSummary, EventItem, UserProfile } from '../types';
import { ProgressBar } from './ui/ProgressBar';
import { Badge } from './ui/Badge';

interface DashboardProps {
  currentUser?: UserProfile | null;
  onNavigateToTab: (tab: string) => void;
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
    if (Number.isNaN(target.getTime())) return 'Date unavailable';
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (target.toDateString() === now.toDateString()) return 'Today';
    if (target.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [meetings, setMeetings] = useState<MeetingDetail[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [scoreboard, setScoreboard] = useState<StudentScoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const userRole = currentUser?.role || 'member';
  const canViewScoreboard = ['region_hr_head', 'hr_admin', 'committee_hr_leader', 'committee_head', 'team_lead', 'committee_hr_member'].includes(userRole);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setStats(null);
    setScoreboard([]);
    async function loadData() {
      try {
        const [statsData, meetingsData, eventsData, scoreData] = await Promise.all([
          api.getStats(),
          api.getMeetings(),
          api.getEvents(),
          canViewScoreboard ? api.getScoreboard() : Promise.resolve([])
        ]);
        if (!active) return;
        setStats(statsData);
        setMeetings(meetingsData || []);
        setEvents(eventsData || []);
        setScoreboard(scoreData || []);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load the overview.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadData();
    return () => { active = false; };
  }, [currentUser?.id, currentUser?.team_id, userRole, canViewScoreboard, retry]);

  const roleInfo = ROLE_DISPLAY_NAMES[userRole] || { en: 'Operations', ar: 'العمليات' };

  // Preserve role-specific assistant actions and their original queries.
  const getContextualPrompts = () => {
    if (userRole === 'committee_head' || userRole === 'team_lead') {
      return [
        {
          title: 'Pending Submissions',
          desc: 'Inspect member tasks awaiting review',
          prompt: 'Which members currently have pending task submissions awaiting review?'
        },
        {
          title: 'Committee Attendance',
          desc: 'Analyze participation in our last session',
          prompt: 'Who was absent from our most recent committee meeting?'
        },
        {
          title: 'Task Completion Rates',
          desc: 'Review deliverable milestones',
          prompt: 'Show committee task completion rates and quality averages'
        },
        {
          title: 'Dispatch Meeting Notice',
          desc: 'Coordinate next committee schedule',
          prompt: 'Draft an attendance reminder for the upcoming committee session'
        }
      ];
    }

    if (userRole === 'committee_member' || userRole === 'member') {
      return [
        {
          title: 'My Evaluation Summary',
          desc: 'View your behavior points and task quality',
          prompt: 'What are my current attendance and task evaluation scores?'
        },
        {
          title: 'Upcoming Deadlines',
          desc: 'Check deliverables due this week',
          prompt: 'What tasks and meetings are scheduled for me this week?'
        },
        {
          title: 'Submit Excuse',
          desc: 'File an excuse for an absence',
          prompt: 'How do I submit an excuse for an upcoming or missed session?'
        },
        {
          title: 'Ask Operations',
          desc: 'Inquire about committee guidelines',
          prompt: 'What are the criteria for outstanding performance this semester?'
        }
      ];
    }

    // Default: HR Admin, Region HR Head, Committee HR Leader/Member
    return [
      {
        title: 'Attendance Discrepancies',
        desc: 'Review members flagged for absence follow-up',
        prompt: "Who was absent or late in today's sync, and who needs an excuse review?"
      },
      {
        title: 'At-Risk Members (< 70%)',
        desc: 'Detect members falling below retention threshold',
        prompt: 'Which students have an attendance rate below 70%?'
      },
      {
        title: 'Scoreboard Overview',
        desc: 'Summarize top performers and behavior tiers',
        prompt: 'Provide a summary of student evaluations and top standings by committee'
      },
      {
        title: 'Pending HR Escalations',
        desc: 'Audit unresolved member outreach actions',
        prompt: 'Show all open WhatsApp follow-up cases and overdue member inquiries'
      }
    ];
  };

  if (loading) {
    return (
      <div className="workspace-page min-w-0 space-y-6" role="status" aria-label="Loading overview">
        <span className="sr-only">Loading overview</span>
        {/* Skeleton Header */}
        <div className="pb-6 border-b border-slate-200/80 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="h-5 w-36 bg-slate-200 rounded" />
            <div className="h-7 w-64 bg-slate-200 rounded" />
            <div className="h-4 w-full max-w-96 bg-slate-100 rounded" />
          </div>
          <div className="h-9 w-32 bg-slate-200 rounded" />
        </div>

        {/* Skeleton metrics share the loaded strip's role-aware layout. */}
        <div className={`grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-2 ${canViewScoreboard ? 'xl:grid-cols-4' : ''}`}>
          {(canViewScoreboard ? [1, 2, 3, 4] : [1, 2]).map(i => (
            <div key={i} className="h-28 bg-white p-5 space-y-3">
              <div className="h-4 w-24 bg-slate-100 rounded" />
              <div className="h-6 w-16 bg-slate-200 rounded" />
              <div className="h-3 w-32 bg-slate-100 rounded" />
            </div>
          ))}
        </div>

        {/* Skeleton Content Split */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6">
          <div className="h-80 bg-white border border-slate-200 rounded-xl" />
          <div className="h-64 border-t-2 border-slate-300 bg-slate-100" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="workspace-page min-w-0 space-y-6">
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-slate-900">Overview unavailable</h1>
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          <p>{error}</p>
          <button onClick={() => setRetry(value => value + 1)} className="mt-4 min-h-10 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800">Retry overview</button>
        </div>
      </div>
    );
  }

  const latestMeeting = [...meetings].sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time))[0] || null;
  const upcomingEvents = events.filter(e => Date.parse(e.start_time) >= Date.now()).sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
  const nextEvent = upcomingEvents[0] || null;
  const topStudents = scoreboard.slice(0, 4);
  const contextualPrompts = getContextualPrompts();
  const pendingReviews = stats?.pending_submissions_count;
  const hasPendingReviews = pendingReviews !== null && pendingReviews !== undefined;
  const metrics = [
    ...(canViewScoreboard ? [{
      label: currentUser?.team_name ? 'Committee Members' : 'Total Members',
      value: stats?.total_students ?? 0,
      context: currentUser?.team_name ? `Enrolled in ${currentUser.team_name}` : 'Active in registry',
      tab: 'students',
    }] : []),
    {
      label: "Today's Attendance",
      value: `${stats?.attendance_rate_today ?? 0}%`,
      context: `${stats?.present_today ?? 0} Present · ${stats?.late_today ?? 0} Late · ${stats?.absent_today ?? 0} Absent`,
      tab: 'attendance',
    },
    {
      label: 'Scheduled Events',
      value: upcomingEvents.length,
      context: nextEvent ? `Next: ${nextEvent.title}` : 'No events on schedule',
      tab: 'calendar',
    },
    ...(canViewScoreboard ? [{
      label: hasPendingReviews ? 'Pending Reviews' : 'Agent Audit Log',
      value: hasPendingReviews ? pendingReviews : stats?.recent_actions_count ?? 0,
      context: hasPendingReviews
        ? pendingReviews === 1 ? '1 task needs grading' : `${pendingReviews} tasks need grading`
        : 'Audited operations logged',
      tab: hasPendingReviews
        ? userRole === 'committee_head' || userRole === 'team_lead' ? 'task-reviews' : 'tasks'
        : 'audit',
    }] : []),
  ];

  // Date formatting
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="workspace-page min-w-0 space-y-6 [&_button]:focus-visible:outline [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-slate-900 [&_a]:focus-visible:outline [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-slate-900">
      {/* The title leads; role and date remain quiet context. */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-slate-700">
              {roleInfo.en}
            </span>
            {currentUser?.arabic_name && (
              <span dir="rtl" className="text-xs text-slate-600 font-['Cairo']">
                {roleInfo.ar}
              </span>
            )}
            <span className="text-xs text-slate-500 md:ml-2">
              {todayFormatted}
            </span>
          </div>

          <h1 className="text-[28px] leading-tight font-semibold text-slate-900 tracking-tight flex flex-wrap items-baseline gap-2">
            <span>Operations Overview</span>
            {currentUser?.arabic_name && (
              <span dir="rtl" className="text-base font-normal text-slate-600 font-['Cairo']">
                · {currentUser.arabic_name}
              </span>
            )}
          </h1>
          
          <p className="text-[13px] text-slate-500 max-w-2xl leading-relaxed">
            {!canViewScoreboard
              ? 'Your attendance, assigned work, and upcoming committee schedule.'
              : currentUser?.team_name
                ? `Attendance, task reviews, and upcoming sessions for ${currentUser.team_name}.`
                : 'Attendance, member evaluations, and upcoming committee work.'}
          </p>
        </div>
        
        <div className="flex items-center space-x-2 shrink-0">
          <button 
            onClick={() => onNavigateToTab('chat')}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs flex items-center space-x-2"
          >
            <Bot className="w-3.5 h-3.5 text-slate-200" />
            <span>Ask assistant</span>
          </button>
        </div>
      </div>

      {/* One factual strip; member views use two columns without empty staff slots. */}
      <section aria-label="Operational metrics" className="overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
        <ul className={`grid grid-cols-1 gap-px sm:grid-cols-2 ${canViewScoreboard ? 'xl:grid-cols-4' : ''}`}>
          {metrics.map(metric => (
            <li key={metric.label} className="min-w-0 bg-white">
              <button onClick={() => onNavigateToTab(metric.tab)} className="group flex h-full w-full min-w-0 flex-col px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-slate-900">
                <span className="flex w-full items-center justify-between gap-2 text-xs font-medium text-slate-600">
                  {metric.label}
                  <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-slate-900" />
                </span>
                <span className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{metric.value}</span>
                <span className="mt-1 text-xs leading-5 text-slate-600 [overflow-wrap:anywhere]">{metric.context}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Session detail and role-specific work */}
      <div className="grid grid-cols-1 items-start lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 lg:gap-8">
        
        {/* A compact session summary precedes the primary schedule surface. */}
        <div className="min-w-0 flex flex-col gap-5">
          {/* Latest Meeting Roster Card */}
          <section aria-labelledby="dashboard-session" className="min-w-0 border-l-2 border-slate-300 bg-slate-100/70">
            <div className="px-5 pt-4 flex flex-wrap items-center justify-between gap-2">
              <h2 id="dashboard-session" className="text-base font-semibold tracking-tight text-slate-900">
                Latest Meeting Session
              </h2>
              <button 
                onClick={() => onNavigateToTab('attendance')} 
                className="min-h-9 text-xs text-slate-600 hover:text-slate-900 flex items-center font-medium transition-colors"
              >
                View Roster <ChevronRight className="w-3 h-3 ml-0.5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {latestMeeting ? (
                <>
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div className="min-w-0 flex-1 basis-48 [overflow-wrap:anywhere]">
                      <h3 className="text-sm font-semibold text-slate-900">{latestMeeting.title}</h3>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1">
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
                      <div className="space-y-2 pt-1 [&>div>div:first-child]:flex-wrap [&>div>div:first-child]:gap-1">
                        <ProgressBar
                          value={latestMeeting.present_count || 0}
                          max={calculatedMax}
                          color="emerald"
                          label={`Cohort Attendance (${presentRatio}%)`}
                          sublabel={expectedTotal > 0 ? `${latestMeeting.present_count || 0} of ${expectedTotal} members present` : 'No attendance recorded'}
                        />

                        <div className="flex flex-wrap justify-between items-center gap-3 text-xs tabular-nums pt-2 border-t border-slate-200 text-slate-600">
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
                <div className="py-4 text-sm text-slate-600">
                  No meeting sessions logged yet.
                </div>
              )}
            </div>
          </section>

          {/* Upcoming schedule uses a chronological list, not event icon tiles. */}
          <section aria-labelledby="dashboard-schedule" className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <h2 id="dashboard-schedule" className="text-lg font-semibold tracking-tight text-slate-900">
                Upcoming Milestones & Deadlines
              </h2>
              <button 
                onClick={() => onNavigateToTab('calendar')} 
                className="min-h-9 text-xs text-slate-600 hover:text-slate-900 flex items-center font-medium transition-colors"
              >
                Full Calendar <ChevronRight className="w-3 h-3 ml-0.5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {upcomingEvents.slice(0, 3).map((evt) => {
                const isMeeting = evt.event_type === 'meeting';
                const relativeTime = formatRelativeEventTime(evt.start_time);

                return (
                  <div key={evt.id} className="px-5 py-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-1 basis-56 items-start gap-4 min-w-0">
                      <time dateTime={evt.start_time} className="w-16 shrink-0 border-r border-slate-200 pr-3 text-xs font-semibold leading-5 text-slate-700 tabular-nums">
                        {relativeTime}
                      </time>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold leading-5 text-slate-900 [overflow-wrap:anywhere]">
                          {evt.title}
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          {formatMeetingDate(evt.start_time)}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 ml-3">
                      {evt.meet_url ? (
                        <a 
                          href={evt.meet_url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-9 px-3 py-2 bg-white border border-slate-200 hover:border-slate-400 rounded-md text-xs font-semibold text-slate-700 transition-colors inline-flex items-center space-x-1"
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

              {upcomingEvents.length === 0 && (
                <div className="px-5 py-10 text-sm text-slate-600">
                  No upcoming events scheduled.
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Evaluation review and assistant actions form a quieter work column. */}
        <div className="min-w-0 space-y-7">
          {/* Top Standings / Evaluation Board */}
          {canViewScoreboard && <section aria-labelledby="dashboard-evaluations" className="border-t-2 border-slate-400">
            <div className="py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <h2 id="dashboard-evaluations" className="text-base font-semibold tracking-tight text-slate-900">
                Member Evaluations
              </h2>
              <button 
                onClick={() => onNavigateToTab('scoreboard')} 
                className="min-h-9 text-xs text-slate-600 hover:text-slate-900 flex items-center font-medium transition-colors"
              >
                View All <ChevronRight className="w-3 h-3 ml-0.5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {topStudents.map((student) => {
                const badgeVariant = getRatingBadgeVariant(student.overall_rating || '');
                return (
                  <div key={student.student_id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="flex flex-col min-w-0">
                        <span dir="rtl" className="text-sm font-semibold text-slate-900 font-['Cairo'] [overflow-wrap:anywhere]">
                          {student.arabic_name}
                        </span>
                        <span className="text-xs text-slate-600 [overflow-wrap:anywhere]">
                          {student.student_name}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant={badgeVariant} size="sm">
                        {student.overall_rating || 'Not rated'}
                      </Badge>

                      <div className="text-right flex flex-col min-w-[52px]">
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
                <div className="py-6 text-sm text-slate-600">
                  No student evaluation records found.
                </div>
              )}
            </div>
          </section>}

          {/* Assistant actions stay secondary to operational records. */}
          <section aria-labelledby="dashboard-assistant" className="border-t-2 border-slate-900 pt-4">
            <h2 id="dashboard-assistant" className="text-base font-semibold tracking-tight text-slate-900">Ask about your work</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">Choose a question to open with the assistant.</p>
            <ul className="mt-3 divide-y divide-slate-200">
              {contextualPrompts.map(item => (
                <li key={item.title}>
                  <button
                    onClick={() => onSendChatQuery(item.prompt)}
                    className="group flex w-full items-center justify-between gap-4 rounded-sm py-3 text-left transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-900"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">{item.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-600">{item.desc}</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-slate-900" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

      </div>
    </div>
  );
};
export default Dashboard;
