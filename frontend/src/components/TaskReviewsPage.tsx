import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { TaskItem, SubmissionItem, UserProfile } from '../types';
import {
  ChevronRight, CheckCircle2, Circle, Clock, Search,
  ExternalLink
} from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface TaskReviewsPageProps {
  currentUser?: UserProfile | null;
}

export const TaskReviewsPage: React.FC<TaskReviewsPageProps> = ({ currentUser }) => {
  const toast = useToast();
  const [tasks, setTasks]               = useState<TaskItem[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [subs, setSubs]                 = useState<SubmissionItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [subsLoading, setSubsLoading]   = useState(false);
  const [search, setSearch]             = useState('');
  const [error, setError] = useState<string | null>(null);
  const [subsError, setSubsError] = useState<string | null>(null);
  const selectionRequest = useRef(0);
  // Local grading state: { [subId]: { score: string, note: string } }
  const [grades, setGrades]             = useState<Record<string, { score: string; note: string }>>({});
  const [savingSubId, setSavingSubId]   = useState<string | null>(null);

  const isMember = currentUser?.role === 'committee_member' || currentUser?.role === 'member';

  useEffect(() => {
    if (isMember) {
      setLoading(false);
      return;
    }
    async function load() {
      try { const t = await api.getTasks(); setTasks(t); if (t.length) selectTask(t[0]); }
      catch (e) { setError(e instanceof Error ? e.message : 'Unable to load tasks.'); }
      finally { setLoading(false); }
    }
    load();
  }, [isMember]);

  if (isMember) {
    return (
      <div className="workspace-page min-w-0 space-y-3">
        <h2 className="text-[28px] leading-tight font-semibold text-slate-900">Task Reviews are Restricted</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Technical evaluation and grading of deliverables is reserved for Committee Heads.
        </p>
      </div>
    );
  }

  const selectTask = async (task: TaskItem) => {
    const request = ++selectionRequest.current;
    setSelectedTask(task);
    setSubsLoading(true);
    setSubsError(null);
    setSubs([]);
    try {
      const data = await api.getTaskSubmissions(task.id);
      if (request === selectionRequest.current) setSubs(data);
    } catch (e) {
      if (request === selectionRequest.current) setSubsError(e instanceof Error ? e.message : 'Unable to load submissions.');
    } finally {
      if (request === selectionRequest.current) setSubsLoading(false);
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
    <div className="workspace-page min-w-0 space-y-8">
      <div>
        <h2 className="text-[28px] leading-tight font-semibold text-slate-900 tracking-tight">Task Reviews</h2>
        <p className="text-sm text-slate-500 mt-1">
          Review and grade individual member task submissions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[600px]">
        {/* Task List (Left Panel) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Tasks to review
            </span>
          </div>
          {error ? <p role="alert" className="p-5 text-sm text-rose-700">{error}</p> : loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Loading…</div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {tasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => selectTask(task)}
                  className={`w-full text-left p-4 flex items-center justify-between group transition-colors ${
                    selectedTask?.id === task.id
                      ? 'bg-slate-100 border-l-2 border-slate-900'
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
              <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                    aria-label="Search submissions by member"
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
                ) : subsError ? (
                  <div role="alert" className="p-5 text-sm text-rose-700"><p>{subsError}</p><button onClick={() => selectTask(selectedTask)} className="mt-3 rounded-lg border border-slate-200 px-4 py-2 text-slate-900">Retry submissions</button></div>
                ) : filteredSubs.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 text-sm">No submissions found.</div>
                ) : filteredSubs.map(sub => {
                  const local = grades[sub.id] || { score: sub.score?.toString() ?? '', note: sub.reviewer_notes ?? '' };

                  return (
                    <div key={sub.id} className="p-5 space-y-3">
                      {/* Member row */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 text-xs font-semibold shrink-0">
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
                      <div className="flex min-w-0 flex-col gap-3 pl-0 sm:pl-11">
                        {/* Score chips */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {[...Array(selectedTask.max_score)].map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setGrades(g => ({ ...g, [sub.id]: { ...local, score: String(i + 1) } }))}
                              aria-label={`Score ${i + 1} for ${sub.student_name || sub.student_id}`}
                              aria-pressed={Number(local.score) === i + 1}
                              className={`w-9 h-9 rounded-md text-xs font-semibold transition-colors border ${
                                Number(local.score) === i + 1
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : Number(local.score) > i
                                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              {i + 1}
                            </button>
                          ))}
                          <span className="text-xs text-slate-400 pl-1">/ {selectedTask.max_score}</span>
                        </div>

                        {/* Notes & Save button */}
                        <div className="flex items-center space-x-2 flex-1 w-full">
                          <input
                            type="text"
                            aria-label={`Reviewer note for ${sub.student_name || sub.student_id}`}
                            placeholder="Reviewer note…"
                            value={local.note}
                            onChange={e => setGrades(g => ({ ...g, [sub.id]: { ...local, note: e.target.value } }))}
                            className="min-w-0 flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-500 transition-colors"
                          />

                          <button
                            disabled={!local.score || savingSubId === sub.id}
                            onClick={async () => {
                              try {
                                setSavingSubId(sub.id);
                                await api.reviewTaskSubmission(sub.id, {
                                  score: Number(local.score),
                                  reviewer_notes: local.note,
                                });
                                toast.success('Review saved successfully');
                                if (selectedTask) selectTask(selectedTask);
                              } catch (err: any) {
                                toast.error(err.message || 'Failed to save review');
                              } finally {
                                setSavingSubId(null);
                              }
                            }}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                          >
                            {savingSubId === sub.id ? 'Saving…' : 'Save'}
                          </button>
                        </div>
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
