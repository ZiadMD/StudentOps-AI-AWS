import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { EventItem } from '../types';
import { Calendar, Video, Clock } from 'lucide-react';

export const CalendarView: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getEvents();
        setEvents(data);
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
      <div className="flex items-end justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Schedule & Deadlines</h2>
          <p className="text-[12px] text-slate-500 mt-1">Cohort timeline synced with Google Calendar and operations tasks.</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 shadow-sm rounded-lg overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Syncing calendar...</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {events.map((evt) => (
              <div key={evt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-50/50 transition-colors group">
                <div className="flex items-start space-x-4">
                  <div className="mt-1">
                    {evt.event_type === 'meeting' ? (
                      <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center">
                        <Video className="w-4 h-4 text-blue-600" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-amber-600" />
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-[14px] font-semibold text-slate-900">{evt.title}</h4>
                      {evt.event_type === 'meeting' ? (
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-bold uppercase tracking-wider border border-blue-100">Live Session</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold uppercase tracking-wider border border-amber-100">Deadline</span>
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
                      <span>Join Meet</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
            
            {events.length === 0 && (
              <div className="px-4 py-8 text-center text-[13px] text-slate-500">
                No upcoming events found.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
