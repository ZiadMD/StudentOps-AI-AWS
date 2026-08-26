import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Filter, Plus, Search } from 'lucide-react';
import { api } from '../api/client';
import { TaskItem } from '../types';

export const TaskManagement: React.FC = () => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getTasks();
        setTasks(data);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center shadow-sm">
            <CheckSquareIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Issues & Sprints</h2>
            <p className="text-[12px] text-slate-500">Track task submissions and peer reviews.</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Filter tasks..."
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-blue-500 focus:bg-white w-48 transition-all"
            />
          </div>
          <button className="p-1.5 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-md shadow-sm">
            <Filter className="w-4 h-4" />
          </button>
          <button className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white border border-slate-900 rounded-md shadow-sm text-[13px] font-medium flex items-center space-x-1.5 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            <span>New Issue</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Loading workspace tasks...</div>
      ) : (
        <div className="bg-white border border-slate-200 shadow-sm rounded-lg overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">All Active Issues</span>
            <span className="text-[11px] text-slate-400 font-mono">{tasks.length} items</span>
          </div>
          
          <div className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/80 transition-colors group cursor-pointer">
                <div className="flex items-center space-x-3 w-1/2">
                  <div className="flex-shrink-0 mt-0.5">
                    {task.pending_count === 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-slate-300" />}
                  </div>
                  <span className="font-mono text-[11px] text-slate-400 w-14 shrink-0">TSK-{task.task_number}</span>
                  <span className="text-[13px] font-medium text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                    {task.title}
                  </span>
                </div>
                
                <div className="flex items-center space-x-4 w-1/2 justify-end">
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                    Max: {task.max_score}pts
                  </span>

                  <div className="flex items-center space-x-2 w-32 shrink-0 border-l border-slate-100 pl-4">
                    <span className="text-[11px] text-slate-600 truncate">{task.submission_count} Submitted</span>
                  </div>
                </div>
              </div>
            ))}
            
            {tasks.length === 0 && (
              <div className="px-4 py-8 text-center text-[13px] text-slate-500">
                No issues found matching your filters.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const CheckSquareIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 11 12 14 22 4"></polyline>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
  </svg>
);
