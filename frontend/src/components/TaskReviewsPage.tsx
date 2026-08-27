import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { TaskItem, SubmissionItem } from '../types';
import {
  ChevronRight, CheckCircle2, Circle, Clock, Search,
  ExternalLink
} from 'lucide-react';

export const TaskReviewsPage: React.FC = () => {
  const [tasks, setTasks]               = useState<TaskItem[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [subs, setSubs]                 = useState<SubmissionItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [subsLoading, setSubsLoading]   = useState(false);
  const [search, setSearch]             = useState('');
  // Local grading state: { [subId]: { score: string, note: string } }
  const [grades, setGrades]             = useState<Record<string, { score: string; note: string }>>({});

  useEffect(() => {
    async function load() {
      try { const t = await api.getTasks(); setTasks(t); if (t.length) selectTask(t[0]); }
      catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const selectTask = async (task: TaskItem) => {
    setSelectedTask(task);
    setSubsLoading(true);
    try {
      const data = await api.getTaskSubmissions(task.id);
      setSubs(data);
    } catch (e) {
      setSubs([]);
    } finally {
      setSubsLoading(false);
    }
  };

  const filteredSubs = subs.filter(s =>
    !search || (s.student_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (status: string) => {
    switch (status) {
      case 'graded':     return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'submitted':  return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'pending':    return 'bg-slate-100 text-slate-500 border-slate-200';
      default:           return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  };

  const statusIcon = (status: string) => {
    if (status === 'graded')    return <CheckCircle2 className="w-3.5 h-3.5" />;
    if (status === 'submitted') return <Clock className="w-3.5 h-3.5" />;
    return <Circle className="w-3.5 h-3.5" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Task Reviews</h2>
        <p className="text-sm text-slate-500 mt-1">
          Review and grade individual member task submissions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[600px]">
        {/* Task List (Left Panel) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Sprint Tasks
            </span>
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {tasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => selectTask(task)}
                  className={`w-full text-left p-4 flex items-center justify-between group transition-colors ${
                    selectedTask?.id === task.id
                      ? 'bg-blue-50/80 border-l-2 border-blue-500'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-[10px] text-slate-400">TSK-{task.task_number}</span>
                      {task.pending_count > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                          {task.pending_count} pending
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-sm text-slate-900 truncate">{task.title}</div>
                    <div className="text-[11px] text-slate-500">
                      {task.submission_count} submitted · max {task.max_score} pts
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-colors ${
                    selectedTask?.id === task.id ? 'text-blue-500' : 'text-slate-300 group-hover:text-slate-500'
                  }`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Submissions Panel (Right) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          {!selectedTask ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              Select a task to review its submissions.
            </div>
          ) : (
            <>
              {/* Sub-header */}
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[10px] text-slate-400">TSK-{selectedTask.task_number}</span>
                    <span className="text-[10px] text-slate-300">·</span>
                    <span className="text-[11px] text-slate-500">Max {selectedTask.max_score} pts</span>
                  </div>
                  <h3 className="font-bold text-slate-900">{selectedTask.title}</h3>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search member…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:border-blue-500 w-44 transition-all"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {subsLoading ? (
                  <div className="py-16 text-center text-slate-400 text-sm">Loading submissions…</div>
                ) : filteredSubs.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 text-sm">No submissions found.</div>
                ) : filteredSubs.map(sub => {
                  const local = grades[sub.id] || { score: sub.score?.toString() ?? '', note: sub.reviewer_notes ?? '' };

                  return (
                    <div key={sub.id} className="p-5 space-y-3">
                      {/* Member row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {(sub.student_name || '?').charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{sub.student_name || sub.student_id}</div>
                            {sub.submitted_at && (
                              <div className="text-[11px] text-slate-400 font-mono">
                                {new Date(sub.submitted_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${statusColor(sub.status)}`}>
                            {statusIcon(sub.status)}
                            <span className="capitalize">{sub.status}</span>
                          </span>
                          {sub.file_url && (
                            <a
                              href={sub.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Grading row */}
                      <div className="flex items-center space-x-3 pl-11">
                        {/* Score chips */}
                        <div className="flex items-center space-x-1">
                          {[...Array(selectedTask.max_score)].map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setGrades(g => ({ ...g, [sub.id]: { ...local, score: String(i + 1) } }))}
                              className={`w-7 h-7 rounded-md text-xs font-bold transition-all border ${
                                Number(local.score) === i + 1
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm scale-105'
                                  : Number(local.score) > i
                                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              {i + 1}
                            </button>
                          ))}
                        </div>

                        <span className="text-xs text-slate-400">/ {selectedTask.max_score}</span>

                        {/* Notes */}
                        <input
                          type="text"
                          placeholder="Reviewer note…"
                          value={local.note}
                          onChange={e => setGrades(g => ({ ...g, [sub.id]: { ...local, note: e.target.value } }))}
                          className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:border-blue-500 transition-all"
                        />

                        {/* Save */}
                        <button
                          disabled={!local.score}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
