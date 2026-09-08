import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { MeetingDetail, UserProfile } from '../types';
import { Video, ArrowUpRight, Search, Plus, RefreshCw } from 'lucide-react';
import { ProgressBar } from './ui/ProgressBar';

interface AttendanceViewProps {
  currentUser?: UserProfile | null;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({ currentUser }) => {
  const [meetings, setMeetings] = useState<MeetingDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

  const loadMeetings = async () => {
    try {
      setLoading(true);
      const data = await api.getMeetings();
      setMeetings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeetings();
  }, []);

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
    } catch (err: any) {
      alert(err.message || 'Failed to schedule meeting session');
    } finally {
      setScheduling(false);
    }
  };

  const handleProcessAttendance = async (meetingId: string) => {
    try {
      setProcessingId(meetingId);
      await api.reprocessAttendance(meetingId);
      await loadMeetings();
      alert('Attendance processed successfully. Any absences have been flagged for HR follow-up.');
    } catch (err: any) {
      alert(err.message || 'Failed to process attendance');
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
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Meet Attendance Logs</h2>
          <p className="text-sm text-slate-500 mt-1">
            Deterministic attendance matching against Google Meet logs and session numbers.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search meetings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-64 transition-all"
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
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center space-x-1.5 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule Session</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Ingesting Meet records...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-4 font-medium">Session / Event</th>
                  <th className="px-6 py-4 font-medium">Date &amp; Duration</th>
                  <th className="px-6 py-4 font-medium">Attendance Ratio</th>
                  <th className="px-6 py-4 font-medium text-right">Metrics (P / L / A)</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-100">
                {filteredMeetings.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                          <Video className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{m.title}</span>
                            {m.session_number && (
                              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                                Session #{m.session_number}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">{m.meeting_code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-slate-700">
                          {new Date(m.start_time).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        <span className="text-[11px] text-slate-500">{m.duration_minutes} minutes</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 w-64">
                      <ProgressBar
                        value={m.present_count}
                        max={m.total_expected || 1}
                        color={m.present_count / (m.total_expected || 1) > 0.8 ? 'emerald' : 'amber'}
                        label="Ratio"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end space-x-2 font-mono text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                          {m.present_count} P
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                          {m.late_count} L
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-100">
                          {m.absent_count} A
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                      {isHrMember && (
                        <button
                          onClick={() => handleProcessAttendance(m.id)}
                          disabled={processingId === m.id}
                          className="inline-flex items-center space-x-1 text-slate-600 hover:text-slate-900 font-medium text-xs border border-slate-200 px-2 py-1 rounded bg-white hover:bg-slate-50 transition-colors disabled:opacity-50"
                          title="Take/re-process attendance and update absence follow-up flags"
                        >
                          <RefreshCw className={`w-3 h-3 ${processingId === m.id ? 'animate-spin' : ''}`} />
                          <span>Process</span>
                        </button>
                      )}

                      {m.meet_url ? (
                        <a
                          href={m.meet_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-medium text-xs transition-colors"
                        >
                          <span>Join Room</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Ended</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Schedule Session (Committee Head) */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Schedule Committee Session</h3>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Session Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
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
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
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
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
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
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
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
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
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
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  placeholder="https://meet.google.com/abc-defg-hij"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  {scheduling ? 'Scheduling...' : 'Confirm Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
