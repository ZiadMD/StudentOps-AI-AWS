import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { EventItem } from '../types';
import { Calendar, Video, Clock } from 'lucide-react';

export const CalendarView: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    async function load() {
      try {
        const data = await api.getEvents();
        if (active) setEvents([...data].sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time)));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load the schedule.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [retry]);

  return (
    <div className="workspace-page min-w-0 space-y-8">
      <div className="flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-[28px] leading-tight font-semibold text-slate-900 tracking-tight">Schedule & Deadlines</h2>
          <p className="text-sm text-slate-600 mt-2">Committee sessions and task deadlines, in chronological order.</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        {loading ? (
          <div role="status" className="p-8 text-slate-600 text-sm">Loading schedule…</div>
        ) : error ? (
          <div role="alert" className="p-5 text-sm text-rose-700">
            <p>{error}</p>
            <button onClick={() => setRetry(value => value + 1)} className="mt-3 min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-slate-900">Retry schedule</button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {events.map((evt) => (
              <div key={evt.id} className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center justify-between p-5 sm:p-6 hover:bg-slate-50/50 transition-colors group">
                <div className="flex items-start space-x-4">
                  <div className="mt-1">
                    {evt.event_type === 'meeting' ? (
                      <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
                        <Video className="w-4 h-4 text-slate-500" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-slate-500" />
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-[14px] font-semibold text-slate-900">{evt.title}</h4>
                      {evt.event_type === 'meeting' ? (
                        <span className="px-2 py-0.5 rounded bg-slate-50 text-slate-600 text-xs font-medium border border-slate-200">Meeting</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-50 text-slate-600 text-xs font-medium border border-slate-200">{evt.event_type.replace(/_/g, ' ')}</span>
                      )}
                    </div>
                    <div className="text-[12px] text-slate-500 mt-0.5 flex items-center">
                      <Calendar className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                      {new Date(evt.start_time).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                <div className="mt-4 sm:mt-0 flex items-center justify-end w-full sm:w-auto">
                  {evt.meet_url && (
                    <a 
                      href={evt.meet_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-white border border-slate-200 shadow-sm rounded-md text-[12px] font-medium text-slate-700 hover:text-blue-600 hover:border-blue-300 flex items-center space-x-1.5 transition-all"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Open meeting</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
            
            {events.length === 0 && (
              <div className="px-4 py-8 text-center text-[13px] text-slate-500">
                No scheduled events found.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
