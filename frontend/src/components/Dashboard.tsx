import React, { useEffect, useState } from 'react';
import {
  UserCheck, Clock, Calendar, Bot, Award, Video,
  ChevronRight, ArrowRight, CheckSquare, Bell, HelpCircle, AlertCircle,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  DashboardStats, MeetingDetail, StudentScoreSummary, EventItem, UserProfile, ReminderItem,
} from '../types';
import { Badge } from './ui/Badge';
import { Button, TextButton } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { PageHeader } from './ui/PageHeader';
import { type Tab } from './navigation';

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


  // ── Derived views ──────────────────────────────────────────────────────
  const latestMeeting = meetings[0] || null;
  const nextEvent =
    events.find(e => new Date(e.start_time).getTime() >= Date.now() - 3600000)
    || events[0] || null;
  const topStudents = scoreboard.slice(0, 4);
  const contextualPrompts = getContextualPrompts();

  // ── Loading: mimic the real hierarchy so the page does not jump ──────────
  if (loading) {
    return (
      <div className="workspace-page min-w-0 space-y-8" role="status" aria-label="Loading overview">
        <div className="border-b border-ink-900/15 pb-5">
          <div className="h-3 w-28 animate-pulse rounded bg-paper-300" />
          <div className="mt-3 h-9 w-72 max-w-full animate-pulse rounded bg-paper-300" />
          <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-paper-200" />
        </div>
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-10 w-16 rounded bg-paper-300" />
              <div className="mt-2 h-3 w-28 rounded bg-paper-200" />
            </div>
          ))}
        </div>
        <div className="grid gap-8 lg:grid-cols-5">
          <div className="h-64 animate-pulse rounded-lg border border-rule bg-paper-100 lg:col-span-3" />
          <div className="h-64 animate-pulse rounded-lg border border-rule bg-paper-100 lg:col-span-2" />
        </div>
      </div>
    );
  }

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  // Attendance is the one number that genuinely carries a threshold, so it is
  // toned by the real policy state rather than left neutral.
  const attendanceRate = stats?.attendance_rate_today ?? 0;
  const attendanceTone =
    attendanceRate >= 70 ? 'compliant' : attendanceRate >= 50 ? 'atRisk' : 'critical';

  return (
    <div className="workspace-page min-w-0 space-y-10">
      {/* ── Masthead ─────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow={
          <>
            {roleInfo.en}
            {currentUser?.team_name ? ` · ${currentUser.team_name}` : ''}
          </>
        }
        title="Operations overview"
        description={
          currentUser?.team_name
            ? 'Attendance, assignments and evaluations for this committee, drawn from the same records the committee maintains.'
            : 'Attendance, assignments and evaluations across the organization.'
        }
        meta={<><span>{todayFormatted}</span><span>Committee records</span></>}
        actions={
          <Button variant="primary" onClick={() => onSendChatQuery('')}>
            <Bot aria-hidden="true" className="h-4 w-4" />
            Ask the assistant
          </Button>
        }
      />

      {currentUser?.arabic_name && (
        <p lang="ar" dir="rtl" className="-mt-6 font-arabic text-base text-ink-faint">
          {currentUser.arabic_name}
        </p>
      )}

      {/* ── Figures ──────────────────────────────────────────────────────
          A ruled band of real counts. No icons in tinted squares, and no
          trend chips: there is no historical baseline to compute one from. */}
      <section aria-label="Key figures" className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        <figure className="border-t border-rule pt-4">
          <div className="figure text-4xl text-ink-900 sm:text-5xl">
            {stats?.total_students ?? 0}
          </div>
          <figcaption className="mt-2 text-sm font-medium text-ink-800">
            {currentUser?.team_name ? 'Committee members' : 'Members enrolled'}
          </figcaption>
          <p className="mt-0.5 text-xs text-ink-faint">Active in the registry</p>
        </figure>

        <figure className="border-t border-rule pt-4">
          <div
            className={`figure text-4xl sm:text-5xl ${
              { compliant: 'text-green-700', atRisk: 'text-amber-700', critical: 'text-red-700' }[attendanceTone]
            }`}
          >
            {attendanceRate}%
          </div>
          <figcaption className="mt-2 text-sm font-medium text-ink-800">Present today</figcaption>
          <p className="mt-0.5 text-xs text-ink-faint">
            {stats?.present_today ?? 0} on time · {stats?.late_today ?? 0} late · {stats?.absent_today ?? 0} absent
          </p>
        </figure>

        <figure className="border-t border-rule pt-4">
          <div className="figure text-4xl text-ink-900 sm:text-5xl">
            {stats?.upcoming_meetings_count ?? 0}
          </div>
          <figcaption className="mt-2 text-sm font-medium text-ink-800">Sessions scheduled</figcaption>
          <p className="mt-0.5 text-xs text-ink-faint">On the shared calendar</p>
        </figure>

        <figure className="border-t border-rule pt-4">
          <div className="figure text-4xl text-ink-900 sm:text-5xl">
            {stats?.pending_submissions_count ?? 0}
          </div>
          <figcaption className="mt-2 text-sm font-medium text-ink-800">Awaiting review</figcaption>
          <p className="mt-0.5 text-xs text-ink-faint">Submitted, not yet graded</p>
        </figure>
      </section>

      {/* ── Lead column: the most recent session, given the most room ── */}
      <div className="grid min-w-0 gap-10 lg:grid-cols-5">
        <section aria-labelledby="latest-session" className="min-w-0 lg:col-span-3">
          <div className="flex items-baseline justify-between gap-4 border-b border-ink-900/15 pb-3">
            <h2 id="latest-session" className="font-display text-lg font-medium text-ink-900">
              Latest session
            </h2>
            <TextButton onClick={() => onNavigateToTab('attendance')}>
              Full roster
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </TextButton>
          </div>

          {latestMeeting ? (
            <div className="pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-xl font-medium leading-snug text-ink-900">
                    {latestMeeting.title}
                  </h3>
                  <p className="mt-1 font-mono text-2xs text-ink-faint">
                    {latestMeeting.meeting_code} · {formatMeetingDate(latestMeeting.start_time)}
                    {latestMeeting.duration_minutes ? ` · ${latestMeeting.duration_minutes} min` : ''}
                  </p>
                </div>
                <Badge variant={getMeetingStatusBadge(latestMeeting.status).variant}>
                  {getMeetingStatusBadge(latestMeeting.status).label}
                </Badge>
              </div>

              {/* Real counts only. The bar is proportional to the recorded
                  total, so it reflects the data rather than a target. */}
              {(() => {
                const present = latestMeeting.present_count || 0;
                const late = latestMeeting.late_count || 0;
                const absent = latestMeeting.absent_count || 0;
                const recorded = present + late + absent;
                const expected = latestMeeting.total_expected > 0 ? latestMeeting.total_expected : recorded;
                const total = expected > 0 ? expected : 1;
                const pct = (n: number) => `${Math.round((n / total) * 100)}%`;

                return (
                  <div className="mt-6">
                    <div className="flex h-2 overflow-hidden rounded-full bg-paper-300" role="img"
                      aria-label={`${present} present, ${late} late, ${absent} absent of ${expected} expected`}>
                      <span className="bg-green-600" style={{ width: pct(present) }} />
                      <span className="bg-amber-500" style={{ width: pct(late) }} />
                      <span className="bg-red-500" style={{ width: pct(absent) }} />
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-4">
                      {[
                        ['Present', present, 'text-green-700'],
                        ['Late', late, 'text-amber-700'],
                        ['Absent', absent, 'text-red-700'],
                      ].map(([label, value, tone]) => (
                        <div key={label as string}>
                          <dt className="text-xs text-ink-faint">{label}</dt>
                          <dd className={`figure mt-0.5 text-2xl ${tone}`}>{value as number}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 text-xs text-ink-faint">
                      {recorded} of {expected} expected members recorded
                    </p>
                  </div>
                );
              })()}
            </div>
          ) : (
            <EmptyState
              title="No sessions recorded"
              description="Once a session has been recorded it will appear here with its attendance."
            />
          )}
        </section>

        {/* Secondary column: what is next, and who leads. */}
        <div className="min-w-0 space-y-10 lg:col-span-2">
          <section aria-labelledby="upcoming">
            <div className="flex items-baseline justify-between gap-4 border-b border-ink-900/15 pb-3">
              <h2 id="upcoming" className="font-display text-lg font-medium text-ink-900">
                Coming up
              </h2>
              <TextButton onClick={() => onNavigateToTab('calendar')}>
                Schedule
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
              </TextButton>
            </div>

            {nextEvent ? (
              <div className="pt-5">
                <p className="text-xs text-ink-faint">{formatRelativeEventTime(nextEvent.start_time)}</p>
                <h3 className="mt-1 font-display text-lg font-medium leading-snug text-ink-900">
                  {nextEvent.title}
                </h3>
                {nextEvent.description && (
                  <p className="mt-2 text-sm leading-6 text-ink-soft">{nextEvent.description}</p>
                )}
              </div>
            ) : (
              <p className="pt-5 text-sm text-ink-faint">Nothing scheduled.</p>
            )}

            {events.length > 1 && (
              <ul className="mt-6 space-y-3 border-t border-rule pt-4">
                {events.slice(1, 4).map(event => (
                  <li key={event.id} className="flex items-baseline gap-3">
                    <span className="w-20 shrink-0 font-mono text-2xs text-ink-faint">
                      {formatRelativeEventTime(event.start_time)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-700">{event.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {topStudents.length > 0 && (
            <section aria-labelledby="standings">
              <div className="flex items-baseline justify-between gap-4 border-b border-ink-900/15 pb-3">
                <h2 id="standings" className="font-display text-lg font-medium text-ink-900">
                  Top evaluations
                </h2>
                <TextButton onClick={() => onNavigateToTab('scoreboard')}>
                  All
                  <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                </TextButton>
              </div>
              <ol className="pt-2">
                {topStudents.map((student, index) => (
                  <li key={student.student_id} className="flex items-baseline gap-3 border-b border-rule py-3 last:border-0">
                    <span className="w-5 shrink-0 font-mono text-2xs text-ink-faint tnum">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-800" dir="auto">{student.student_name}</span>
                    <span className="shrink-0 font-mono text-sm text-ink-900 tnum">
                      {student.total_score ?? student.total_behavior_score ?? '—'}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      {isMember && reminders.length > 0 && (
        <section aria-labelledby="my-reminders">
          <div className="flex items-baseline justify-between gap-4 border-b border-ink-900/15 pb-3">
            <h2 id="my-reminders" className="font-display text-lg font-medium text-ink-900">
              Reminders for you
            </h2>
            <TextButton onClick={() => onNavigateToTab('notifications')}>
              All reminders
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </TextButton>
          </div>
          <ul className="pt-2">
            {reminders.slice(0, 4).map(reminder => (
              <li key={reminder.id} className="flex items-baseline gap-3 border-b border-rule py-3 last:border-0">
                <Bell aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink-800" dir="auto">
                    {reminder.title || reminder.message_content}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-faint">
                    {reminder.sent_at
                      ? `Sent ${new Date(reminder.sent_at).toLocaleString()}`
                      : reminder.status}
                  </span>
                </span>
                <Badge variant={reminder.status?.toLowerCase() === 'sent' ? 'success' : 'neutral'}>
                  {reminder.status}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Assistant prompts ───────────────────────────────────────────
          Rendered as an index of real questions the assistant can answer.
          Clicking one asks it, so the affordance is genuinely functional. */}
      <section aria-labelledby="assistant-queries">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink-900/15 pb-3">
          <h2 id="assistant-queries" className="font-display text-lg font-medium text-ink-900">
            Ask the assistant
          </h2>
          <p className="text-xs text-ink-faint">Questions about the records above</p>
        </div>

        <ul className="grid gap-x-8 sm:grid-cols-2">
          {contextualPrompts.map(prompt => {
            const Icon = prompt.icon;
            return (
              <li key={prompt.title} className="border-b border-rule">
                <button
                  type="button"
                  onClick={() => onSendChatQuery(prompt.prompt)}
                  className="group flex w-full items-start gap-3 py-4 text-left transition-colors hover:bg-paper-100"
                >
                  <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint group-hover:text-indigo-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-900">{prompt.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-ink-soft">{prompt.desc}</span>
                  </span>
                  <ArrowRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export default Dashboard;
