import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AuditLogItem } from '../types';
import { Search, RefreshCw } from 'lucide-react';

export const AuditViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAuditLogs();
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load audit records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredLogs = logs.filter(l => 
    l.intent.toLowerCase().includes(filter.toLowerCase()) || 
    l.tool_name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="workspace-page min-w-0 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-[28px] leading-tight font-semibold text-slate-900 tracking-tight">
            Activity Log
          </h2>
          <p className="text-sm text-slate-600 mt-2">Review recorded assistant actions, tool results, and authorization status.</p>
        </div>
        
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              aria-label="Search activity records"
              placeholder="Search actions or tools…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-md text-[12px] font-mono focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 w-full sm:w-48 shadow-sm"
            />
          </div>
          <button
            aria-label="Refresh activity records"
            disabled={loading}
            onClick={load}
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg transition-colors shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <section aria-label="Recorded activity" className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
          {loading ? 'Loading activity…' : error ? 'Activity unavailable' : `${filteredLogs.length} matching records`}
        </div>
        {loading ? <p role="status" className="p-8 text-sm text-slate-600">Loading activity records…</p> : error ? (
          <p role="alert" className="p-5 text-sm text-rose-700">{error} Use Refresh to try again.</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredLogs.map(log => (
              <article key={log.id} className="grid gap-3 p-5 md:grid-cols-[12rem_minmax(0,1fr)]">
                <time className="text-xs text-slate-500" dateTime={log.timestamp}>{new Date(log.timestamp).toLocaleString()}</time>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-all font-mono text-xs font-medium text-slate-700">{log.tool_name}</span>
                    <span className={`rounded border px-2 py-0.5 text-xs ${log.status.toLowerCase().includes('error') ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{log.status}</span>
                    {log.requires_confirmation && <span className="text-xs text-slate-500">{log.confirmed ? 'Authorized' : 'Not authorized'}</span>}
                  </div>
                  <p className="break-words text-sm leading-relaxed text-slate-900">{log.intent}</p>
                </div>
              </article>
            ))}
            {filteredLogs.length === 0 && <p className="p-8 text-sm text-slate-600">{filter ? 'No records match your search.' : 'No activity records available.'}</p>}
          </div>
        )}
      </section>
    </div>
  );
};
