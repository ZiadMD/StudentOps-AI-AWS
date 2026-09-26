import React, { useState } from 'react';
import { api } from '../api/client';
import { MeetingDetail, UserProfile } from '../types';
import { Video, ArrowUpRight, Search, Plus, RefreshCw } from 'lucide-react';
import { ProgressBar } from './ui/ProgressBar';
import { Modal } from './ui/Modal';
import { Skeleton, SkeletonCard } from './ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { useCachedData } from '../hooks/useCachedData';

interface AttendanceViewProps {
  currentUser?: UserProfile | null;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({ currentUser }) => {
  const toast = useToast();
  const [search, setSearch] = useState('');

  // Secure In-Memory Cached Meetings with SWR
  const {
    data: cachedMeetings,
    loading,
    refresh: loadMeetings,
  } = useCachedData<MeetingDetail[]>(
    'attendance_sessions',
    () => api.getMeetings(),
    { userId: currentUser?.id }
  );
  const meetings = cachedMeetings || [];

  // Schedule Session Modal (Committee Head)
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [sessionNumber, setSessionNumber] = useState<number>(1);
  const [meetUrl, setMeetUrl] = useState('');
  const [scheduling, setScheduling] = useState(false);

  // Processing Attendance (HR Member)
  const [processingId, setProcessingId] = useState<string | null>(null);

  const isCommitteeHead =
    currentUser?.role === 'committee_head' ||
    currentUser?.role === 'team_lead' ||
    currentUser?.role === 'hr_admin';

  const isHrMember =
    currentUser?.role === 'committee_hr_member' ||
    currentUser?.role === 'committee_hr_leader' ||
    currentUser?.role === 'region_hr_head' ||
    currentUser?.role === 'hr_admin';



  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startTime) return;
    try {
      setScheduling(true);
      const start = new Date(startTime);
      const end = new Date(start.getTime() + durationMinutes * 60000);
      await api.createMeeting({
        title,
        topic: topic || undefined,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        duration_minutes: durationMinutes,
        session_number: sessionNumber,
        meet_url: meetUrl || undefined,
      });
      setShowScheduleModal(false);
      setTitle('');
      setTopic('');
      setStartTime('');
      setMeetUrl('');
      await loadMeetings();
      toast.success('Committee session scheduled successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to schedule meeting session');
    } finally {
      setScheduling(false);
    }
  };

  const handleProcessAttendance = async (meetingId: string) => {
    try {
      setProcessingId(meetingId);
      await api.reprocessAttendance(meetingId);
      await loadMeetings();
      toast.success('Attendance processed successfully. Any absences have been flagged for HR follow-up.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to process attendance');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredMeetings = meetings.filter(
    (m) =>
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.meeting_code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium leading-tight tracking-[-0.02em] text-ink-900">Attendance</h1>
          <p className="text-sm text-ink-soft mt-1">
            Deterministic attendance matching against Google Meet logs and session numbers.
          </p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search meetings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-rule rounded-lg text-sm focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-500 w-full sm:w-64 transition-all"
            />
          </div>

          {isCommitteeHead && (
            <button
              onClick={() => {
                const nextNum = meetings.length + 1;
                setSessionNumber(nextNum);
                setTitle(`Session ${nextNum}: Social Media Workshop`);
                setShowScheduleModal(true);
              }}
              className="px-3 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-sm font-medium flex items-center space-x-1.5 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule Session</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-rule shadow-xs rounded-lg overflow-hidden">
        {loading ? (
          <div>
            {/* Desktop Table Skeletons */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-ink-900/15 text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
                    <th className="px-5 py-3.5">Session / Event</th>
                    <th className="px-5 py-3.5">Date &amp; Duration</th>
                    <th className="px-5 py-3.5 w-72">Attendance Health</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-ink-100">
                      <td className="px-5 py-4">
                        <div className="flex items-center space-x-3">
                          <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                          <div className="space-y-1.5 flex-1 max-w-[220px]">
                            <Skeleton className="h-4 w-3/4 rounded" />
                            <Skeleton className="h-3 w-1/2 rounded" />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-1.5 max-w-[150px]">
                          <Skeleton className="h-3.5 w-4/5 rounded" />
                          <Skeleton className="h-3 w-3/5 rounded" />
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-2 max-w-[240px]">
                          <Skeleton className="h-3 w-full rounded-full" />
                          <Skeleton className="h-3 w-1/2 rounded" />
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Skeleton className="h-7 w-20 rounded-lg ml-auto" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Skeletons */}
            <div className="block md:hidden p-3 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table View (hidden on mobile) */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-ink-900/15 text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
                    <th className="px-5 py-3.5">Session / Event</th>
                    <th className="px-5 py-3.5">Date &amp; Duration</th>
                    <th className="px-5 py-3.5 w-72">Attendance Health</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-rule">
                  {filteredMeetings.map((m) => {
                    const totalRecorded = (m.present_count || 0) + (m.late_count || 0) + (m.absent_count || 0);
                    const totalExpected = m.total_expected > 0 ? m.total_expected : totalRecorded;
                    const calculatedMax = totalExpected > 0 ? totalExpected : 1;
                    const ratio = Math.round(((m.present_count || 0) / calculatedMax) * 100);

                    return (
                      <tr key={m.id} className="hover:bg-paper-100/60 transition-colors group">
                        {/* Session Identity */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                              <Video className="w-4 h-4 text-indigo-700" />
                            </div>
                            <div>
                              <div className="font-semibold text-ink-900">{m.title}</div>
                              <div className="text-[11px] font-mono text-ink-soft">{m.meeting_code}</div>
                            </div>
                          </div>
                        </td>

                        {/* Date & Duration */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-ink-800 text-xs font-medium">
                              {new Date(m.start_time).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                            <span className="text-[11px] text-ink-soft">{m.duration_minutes} minutes</span>
                          </div>
                        </td>

                        {/* Unified Attendance Health (Merged Progress Bar + P/L/A Metrics) */}
                        <td className="px-5 py-3.5">
                          <div className="space-y-1.5">
                            <ProgressBar
                              value={m.present_count}
                              max={calculatedMax}
                              color={ratio >= 70 ? 'emerald' : 'amber'}
                              showPercentage={false}
                            />
                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span className="text-ink-soft font-sans font-medium">{ratio}% Present</span>
                              <div className="space-x-1.5">
                                <span className="text-green-700 font-bold">{m.present_count} P</span>
                                <span className="text-ink-300">·</span>
                                <span className="text-amber-700 font-bold">{m.late_count} L</span>
                                <span className="text-ink-300">·</span>
                                <span className="text-red-800 font-bold">{m.absent_count} A</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 whitespace-nowrap text-right space-x-2">
                          {isHrMember && (
                            <button
                              onClick={() => handleProcessAttendance(m.id)}
                              disabled={processingId === m.id}
                              className="inline-flex items-center space-x-1 text-ink-800 hover:text-ink-900 font-semibold text-xs border border-rule px-2.5 py-1 rounded-md bg-white hover:bg-paper-100 transition-colors disabled:opacity-50"
                              title="Take/re-process attendance and update absence follow-up flags"
                            >
                              <RefreshCw className={`w-3 h-3 ${processingId === m.id ? 'animate-spin text-indigo-700' : 'text-ink-soft'}`} />
                              <span>Process</span>
                            </button>
                          )}

                          {m.meet_url ? (
                            <a
                              href={m.meet_url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Join the meeting: ${m.title}`}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50 hover:text-indigo-800"
                            >
                              <span>Join</span>
                              <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <span className="text-ink-faint text-xs italic">Ended</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Session Card Transform (Zero horizontal scroll!) */}
            <div className="block md:hidden divide-y divide-rule">
              {filteredMeetings.map((m) => {
                const totalRecorded = (m.present_count || 0) + (m.late_count || 0) + (m.absent_count || 0);
                const totalExpected = m.total_expected > 0 ? m.total_expected : totalRecorded;
                const calculatedMax = totalExpected > 0 ? totalExpected : 1;
                const ratio = Math.round(((m.present_count || 0) / calculatedMax) * 100);

                return (
                  <div key={m.id} className="p-4 space-y-3 hover:bg-paper-100/50 transition-colors">
                    {/* Session Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                          <Video className="w-4 h-4 text-indigo-700" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-ink-900 text-sm truncate">{m.title}</div>
                          <div className="text-[11px] font-mono text-ink-soft flex items-center gap-1.5 mt-0.5">
                            <span>{m.meeting_code}</span>
                            <span>·</span>
                            <span>{new Date(m.start_time).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Attendance Health Meter */}
                    <div className="p-2.5 bg-paper-100 rounded-lg border border-ink-100 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink-800">Attendance: {ratio}%</span>
                        <div className="font-mono text-[11px] space-x-1.5">
                          <span className="text-green-700 font-bold">{m.present_count} P</span>
                          <span className="text-ink-300">·</span>
                          <span className="text-amber-700 font-bold">{m.late_count} L</span>
                          <span className="text-ink-300">·</span>
                          <span className="text-red-800 font-bold">{m.absent_count} A</span>
                        </div>
                      </div>
                      <ProgressBar
                        value={m.present_count}
                        max={calculatedMax}
                        color={ratio >= 70 ? 'emerald' : 'amber'}
                        showPercentage={false}
                      />
                    </div>

                    {/* Actions Strip */}
                    <div className="flex items-center justify-end space-x-2 pt-1">
                      {isHrMember && (
                        <button
                          onClick={() => handleProcessAttendance(m.id)}
                          disabled={processingId === m.id}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-md border border-rule bg-white hover:bg-paper-100 text-ink-800 font-semibold text-xs shadow-2xs transition-colors"
                        >
                          <RefreshCw className={`w-3 h-3 ${processingId === m.id ? 'animate-spin text-indigo-700' : 'text-ink-soft'}`} />
                          <span>Process Roster</span>
                        </button>
                      )}
                      {m.meet_url ? (
                        <a
                          href={m.meet_url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Join the meeting: ${m.title}`}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-ink-900 px-3 py-2 text-xs font-medium text-paper-50 transition-colors hover:bg-ink-800"
                        >
                          <span>Join meeting</span>
                          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-xs text-ink-faint italic">Session Concluded</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredMeetings.length === 0 && (
              <div className="py-16 text-center text-ink-faint text-sm">
                No meeting records match your filter.
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal: Schedule Session (Committee Head) */}
      <Modal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        title="Schedule Committee Session"
        description="Configure meeting details and session number for the committee."
        size="md"
      >
        <form onSubmit={handleScheduleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-800 mb-1">Session Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xs border border-rule rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                placeholder="e.g. Session 7: TikTok Virality"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-800 mb-1">Session #</label>
              <input
                type="number"
                min={1}
                value={sessionNumber}
                onChange={(e) => setSessionNumber(parseInt(e.target.value) || 1)}
                className="w-full text-xs border border-rule rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-800 mb-1">Session Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full text-xs border border-rule rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-600"
              placeholder="e.g. Hook writing and audience retention metrics"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-800 mb-1">Start Time</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full text-xs border border-rule rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-800 mb-1">Duration (minutes)</label>
              <input
                type="number"
                min={15}
                step={15}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 60)}
                className="w-full text-xs border border-rule rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-800 mb-1">Google Meet URL</label>
            <input
              type="url"
              value={meetUrl}
              onChange={(e) => setMeetUrl(e.target.value)}
              className="w-full text-xs border border-rule rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-600"
              placeholder="https://meet.google.com/abc-defg-hij"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
            <button
              type="button"
              onClick={() => setShowScheduleModal(false)}
              className="px-3 py-1.5 border border-rule rounded-lg text-xs font-medium text-ink-soft hover:bg-paper-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={scheduling}
              className="px-4 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {scheduling ? 'Scheduling...' : 'Confirm Session'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
