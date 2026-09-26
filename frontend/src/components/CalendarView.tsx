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
      <div className="flex items-end justify-between border-b border-rule pb-4">
        <div>
          <h1 className="font-display text-3xl font-medium leading-tight tracking-[-0.02em] text-ink-900">Schedule</h1>
          <p className="text-[12px] text-ink-soft mt-1">Cohort timeline synced with Google Calendar and operations tasks.</p>
        </div>
      </div>

      <div className="bg-white border border-rule shadow-sm rounded-lg overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-12 text-center text-ink-soft text-sm">Syncing calendar...</div>
        ) : (
          <div className="divide-y divide-rule">
            {events.map((evt) => (
              <div key={evt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-paper-100/50 transition-colors group">
                <div className="flex items-start space-x-4">
                  <div className="mt-1">
                    {evt.event_type === 'meeting' ? (
                      <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                        <Video className="w-4 h-4 text-indigo-700" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-amber-600" />
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-[14px] font-semibold text-ink-900">{evt.title}</h4>
                      {evt.event_type === 'meeting' ? (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold uppercase tracking-wider border border-indigo-100">Live Session</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold uppercase tracking-wider border border-amber-100">Deadline</span>
                      )}
                    </div>
                    <div className="text-[12px] text-ink-soft mt-0.5 flex items-center">
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
                      className="px-3 py-1.5 bg-white border border-rule shadow-sm rounded-md text-[12px] font-medium text-ink-800 hover:text-indigo-700 hover:border-indigo-300 flex items-center space-x-1.5 transition-all"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Join Meet</span>
                    </a>
                  )}
                </div>
              </div>
            ))}
            
            {events.length === 0 && (
              <div className="px-4 py-8 text-center text-[13px] text-ink-soft">
                No upcoming events found.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
