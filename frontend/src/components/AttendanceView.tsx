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
    error,
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
    <div className="workspace-page min-w-0 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end justify-between">
        <div>
          <h2 className="text-[28px] leading-tight font-semibold text-slate-900 tracking-tight">Attendance</h2>
          <p className="text-sm text-slate-600 mt-2">
            Session rosters matched against Google Meet participation logs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search meetings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search sessions"
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-500 w-full sm:w-64 transition-all"
            />
          </div>

          {isCommitteeHead && (
            <button
              onClick={() => {
                const nextNum = meetings.length + 1;
                setSessionNumber(nextNum);
                setTitle('');
                setShowScheduleModal(true);
              }}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold flex items-center space-x-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule Session</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {error ? (
          <div role="alert" className="p-5 text-sm text-rose-700"><p>{error.message}</p><button onClick={() => void loadMeetings()} className="mt-3 rounded-lg border border-slate-200 px-4 py-2 text-slate-900">Retry sessions</button></div>
        ) : loading ? (
          <div>
            {/* Desktop Table Skeletons */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3.5">Session / Event</th>
                    <th className="px-5 py-3.5">Date &amp; Duration</th>
                    <th className="px-5 py-3.5 w-72">Attendance Health</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-100">
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
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3.5">Session / Event</th>
                    <th className="px-5 py-3.5">Date &amp; Duration</th>
                    <th className="px-5 py-3.5 w-72">Attendance Health</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-100">
                  {filteredMeetings.map((m) => {
                    const totalRecorded = (m.present_count || 0) + (m.late_count || 0) + (m.absent_count || 0);
                    const totalExpected = m.total_expected > 0 ? m.total_expected : totalRecorded;
                    const calculatedMax = totalExpected > 0 ? totalExpected : 1;
                    const ratio = Math.round(((m.present_count || 0) / calculatedMax) * 100);

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/60 transition-colors group">
                        {/* Session Identity */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                              <Video className="w-4 h-4 text-slate-500" />
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900">{m.title}</div>
                              <div className="text-[11px] font-mono text-slate-500">{m.meeting_code}</div>
                            </div>
                          </div>
                        </td>

                        {/* Date & Duration */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-slate-800 text-xs font-medium">
                              {new Date(m.start_time).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                            <span className="text-[11px] text-slate-500">{m.duration_minutes} minutes</span>
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
                              <span className="text-slate-500 font-sans font-medium">{ratio}% Present</span>
                              <div className="space-x-1.5">
                                <span className="text-emerald-700 font-bold">{m.present_count} P</span>
                                <span className="text-slate-300">·</span>
                                <span className="text-amber-700 font-bold">{m.late_count} L</span>
                                <span className="text-slate-300">·</span>
                                <span className="text-rose-700 font-bold">{m.absent_count} A</span>
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
                              className="inline-flex items-center space-x-1 text-slate-700 hover:text-slate-900 font-semibold text-xs border border-slate-200 px-2.5 py-1 rounded-md bg-white hover:bg-slate-50 transition-colors disabled:opacity-50"
                              title="Take/re-process attendance and update absence follow-up flags"
                            >
                              <RefreshCw className={`w-3 h-3 ${processingId === m.id ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
                              <span>Process</span>
                            </button>
                          )}

                          {m.meet_url ? (
                            <a
                              href={m.meet_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center space-x-1 text-slate-600 hover:text-slate-900 font-semibold text-xs transition-colors"
                            >
                              <span>Join</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            <span className="text-slate-500 text-xs">No meeting link</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Session Card Transform (Zero horizontal scroll!) */}
            <div className="block md:hidden divide-y divide-slate-100">
              {filteredMeetings.map((m) => {
                const totalRecorded = (m.present_count || 0) + (m.late_count || 0) + (m.absent_count || 0);
                const totalExpected = m.total_expected > 0 ? m.total_expected : totalRecorded;
                const calculatedMax = totalExpected > 0 ? totalExpected : 1;
                const ratio = Math.round(((m.present_count || 0) / calculatedMax) * 100);

                return (
                  <div key={m.id} className="p-4 space-y-3 hover:bg-slate-50/50 transition-colors">
                    {/* Session Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                          <Video className="w-4 h-4 text-slate-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 text-sm truncate">{m.title}</div>
                          <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span>{m.meeting_code}</span>
                            <span>·</span>
                            <span>{new Date(m.start_time).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Attendance Health Meter */}
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">Attendance: {ratio}%</span>
                        <div className="font-mono text-[11px] space-x-1.5">
                          <span className="text-emerald-700 font-bold">{m.present_count} P</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-amber-700 font-bold">{m.late_count} L</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-rose-700 font-bold">{m.absent_count} A</span>
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
                          className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-2xs transition-colors"
                        >
                          <RefreshCw className={`w-3 h-3 ${processingId === m.id ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
                          <span>Process Roster</span>
                        </button>
                      )}
                      {m.meet_url ? (
                        <a
                          href={m.meet_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center space-x-1 px-3 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors"
                        >
                          <span>Join Meet</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500">No meeting link</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredMeetings.length === 0 && (
              <div className="py-16 text-center text-slate-400 text-sm">
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Session Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500"
                placeholder="e.g. Session 7: TikTok Virality"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Session #</label>
              <input
                type="number"
                min={1}
                value={sessionNumber}
                onChange={(e) => setSessionNumber(parseInt(e.target.value) || 1)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Session Topic</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500"
              placeholder="e.g. Hook writing and audience retention metrics"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start Time</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Duration (minutes)</label>
              <input
                type="number"
                min={15}
                step={15}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 60)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Google Meet URL</label>
            <input
              type="url"
              value={meetUrl}
              onChange={(e) => setMeetUrl(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500"
              placeholder="https://meet.google.com/abc-defg-hij"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowScheduleModal(false)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={scheduling}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              {scheduling ? 'Scheduling…' : 'Confirm session'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
