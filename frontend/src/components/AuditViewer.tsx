import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AuditLogItem } from '../types';
import { Search, Terminal, RefreshCw } from 'lucide-react';

export const AuditViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs();
      setLogs(data);
    } catch (err) {
      console.error(err);
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
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-end justify-between pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center">
            <Terminal className="w-5 h-5 mr-2 text-slate-700" />
            Audit & System Logs
          </h2>
          <p className="text-[12px] text-slate-500 mt-1">Immutable record of all agentic operations and HR changes.</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Grep logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-md text-[12px] font-mono focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 w-48 shadow-sm"
            />
          </div>
          <button 
            onClick={load}
            className="p-1.5 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-md shadow-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 bg-[#0A0A0A] border border-slate-800 rounded-lg overflow-hidden flex flex-col shadow-xl">
        <div className="px-4 py-2 border-b border-slate-800 bg-[#111] flex items-center justify-between">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">system.log</span>
          <span className="text-[10px] font-mono text-emerald-500 flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
            Streaming
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {filteredLogs.map((log) => (
            <div key={log.id} className="font-mono text-[11px] hover:bg-white/5 px-2 py-1 -mx-2 rounded transition-colors group flex items-start space-x-3">
              <span className="text-slate-500 shrink-0">
                {new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19)}
              </span>
              
              <span className={`shrink-0 w-24 ${
                log.status.includes('error') ? 'text-rose-400' :
                log.requires_confirmation && !log.confirmed ? 'text-amber-400' : 'text-blue-400'
              }`}>
                [{log.status.toUpperCase()}]
              </span>
              
              <span className="text-slate-400 shrink-0 w-24 truncate">
                {log.tool_name}
              </span>
              
              <span className="text-slate-300 break-all">
                {log.intent}
              </span>
            </div>
          ))}
          
          {filteredLogs.length === 0 && (
            <div className="text-slate-500 font-mono text-[11px] text-center pt-8">
              EOF: No logs match the specified filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
