import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { MeetingDetail } from '../types';
import { Video, ArrowUpRight, Search } from 'lucide-react';
import { ProgressBar } from './ui/ProgressBar';

export const AttendanceView: React.FC = () => {
  const [meetings, setMeetings] = useState<MeetingDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getMeetings();
        setMeetings(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Meet Attendance Logs</h2>
          <p className="text-sm text-slate-500 mt-1">Deterministic attendance matching against Google Meet exports.</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search meetings..."
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-64 transition-all"
            />
          </div>
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
                  <th className="px-6 py-4 font-medium">Date & Duration</th>
                  <th className="px-6 py-4 font-medium">Attendance Ratio</th>
                  <th className="px-6 py-4 font-medium text-right">Metrics (P / L / A)</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-100">
                {meetings.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                          <Video className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{m.title}</div>
                          <div className="text-[11px] font-mono text-slate-500">{m.meeting_code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-slate-700">{new Date(m.start_time).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
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
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">{m.present_count} P</span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">{m.late_count} L</span>
                        <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-100">{m.absent_count} A</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
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
    </div>
  );
};
