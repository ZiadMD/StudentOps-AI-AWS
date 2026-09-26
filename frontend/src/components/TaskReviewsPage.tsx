import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { TaskItem, SubmissionItem, UserProfile } from '../types';
import {
  ChevronRight, CheckCircle2, Circle, Clock, Search,
  ExternalLink, Shield
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
      catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, [isMember]);

  if (isMember) {
    return (
      <div className="bg-white border border-rule rounded-lg p-8 text-center max-w-md mx-auto my-12 space-y-3">
        <div className="w-12 h-12 rounded-full bg-paper-200 flex items-center justify-center text-ink-faint mx-auto">
          <Shield className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-ink-900">Task Reviews are Restricted</h2>
        <p className="text-xs text-ink-soft leading-relaxed">
          Technical evaluation and grading of deliverables is reserved for Committee Heads.
        </p>
      </div>
    );
  }

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
      case 'graded':     return 'bg-green-50 text-green-700 border-green-200';
      case 'submitted':  return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'pending':    return 'bg-paper-200 text-ink-soft border-rule';
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
        <h1 className="font-display text-3xl font-medium leading-tight tracking-[-0.02em] text-ink-900">Task reviews</h1>
        <p className="text-sm text-ink-soft mt-1">
          Review and grade individual member task submissions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[600px]">
        {/* Task List (Left Panel) */}
        <div className="lg:col-span-4 bg-white border border-rule rounded-lg shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-ink-100 bg-paper-100/60">
            <span className="text-[11px] font-bold text-ink-soft uppercase tracking-wider">
              Sprint Tasks
            </span>
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-ink-faint text-sm">Loading…</div>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-rule">
              {tasks.map(task => (
                <button
                  key={task.id}
                  onClick={() => selectTask(task)}
                  className={`w-full text-left p-4 flex items-center justify-between group transition-colors ${
                    selectedTask?.id === task.id
                      ? 'bg-indigo-50/80 border-l-2 border-indigo-500'
                      : 'hover:bg-paper-100'
                  }`}
                >
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-[10px] text-ink-faint">TSK-{task.task_number}</span>
                      {task.pending_count > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                          {task.pending_count} pending
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-sm text-ink-900 truncate">{task.title}</div>
                    <div className="text-[11px] text-ink-soft">
                      {task.submission_count} submitted · max {task.max_score} pts
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-colors ${
                    selectedTask?.id === task.id ? 'text-indigo-700' : 'text-ink-300 group-hover:text-ink-soft'
                  }`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Submissions Panel (Right) */}
        <div className="lg:col-span-8 bg-white border border-rule rounded-lg shadow-sm overflow-hidden flex flex-col">
          {!selectedTask ? (
            <div className="flex-1 flex items-center justify-center text-ink-faint text-sm">
              Select a task to review its submissions.
            </div>
          ) : (
            <>
              {/* Sub-header */}
              <div className="px-5 py-4 border-b border-ink-100 bg-paper-100/60 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[10px] text-ink-faint">TSK-{selectedTask.task_number}</span>
                    <span className="text-[10px] text-ink-300">·</span>
                    <span className="text-[11px] text-ink-soft">Max {selectedTask.max_score} pts</span>
                  </div>
                  <h3 className="font-bold text-ink-900">{selectedTask.title}</h3>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search member…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-white border border-rule rounded-md text-xs focus:outline-none focus:border-indigo-600 w-44 transition-all"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-rule">
                {subsLoading ? (
                  <div className="py-16 text-center text-ink-faint text-sm">Loading submissions…</div>
                ) : filteredSubs.length === 0 ? (
                  <div className="py-16 text-center text-ink-faint text-sm">No submissions found.</div>
                ) : filteredSubs.map(sub => {
                  const local = grades[sub.id] || { score: sub.score?.toString() ?? '', note: sub.reviewer_notes ?? '' };

                  return (
                    <div key={sub.id} className="p-5 space-y-3">
                      {/* Member row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {(sub.student_name || '?').charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-ink-900">{sub.student_name || sub.student_id}</div>
                            {sub.submitted_at && (
                              <div className="text-[11px] text-ink-faint font-mono">
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
                              className="p-1.5 text-ink-faint hover:text-indigo-700 rounded-md hover:bg-indigo-50 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Grading row */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 pl-0 sm:pl-11">
                        {/* Score chips */}
                        <div className="flex items-center space-x-1 shrink-0">
                          {[...Array(selectedTask.max_score)].map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setGrades(g => ({ ...g, [sub.id]: { ...local, score: String(i + 1) } }))}
                              className={`w-7 h-7 rounded-md text-xs font-bold transition-all border ${
                                Number(local.score) === i + 1
                                  ? 'bg-indigo-700 text-white border-indigo-600 shadow-sm scale-105'
                                  : Number(local.score) > i
                                    ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                                    : 'bg-paper-100 text-ink-soft border-rule hover:border-paper-400'
                              }`}
                            >
                              {i + 1}
                            </button>
                          ))}
                          <span className="text-xs text-ink-faint pl-1">/ {selectedTask.max_score}</span>
                        </div>

                        {/* Notes & Save button */}
                        <div className="flex items-center space-x-2 flex-1 w-full">
                          <input
                            type="text"
                            placeholder="Reviewer note…"
                            value={local.note}
                            onChange={e => setGrades(g => ({ ...g, [sub.id]: { ...local, note: e.target.value } }))}
                            className="flex-1 px-3 py-1.5 bg-paper-100 border border-rule rounded-md text-xs focus:outline-none focus:border-indigo-600 transition-all"
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
                            className="px-3 py-1.5 bg-ink-900 hover:bg-ink-800 text-white rounded-md text-xs font-semibold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
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
