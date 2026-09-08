import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  Plus,
  Search,
  CheckSquare,
  Upload,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { api } from '../api/client';
import { TaskItem, SubmissionItem, UserProfile } from '../types';

interface TaskManagementProps {
  currentUser?: UserProfile | null;
}

export const TaskManagement: React.FC<TaskManagementProps> = ({ currentUser }) => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [memberSubmissions, setMemberSubmissions] = useState<Record<string, SubmissionItem>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Committee Head Create Task Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [maxScore, setMaxScore] = useState(10.0);
  const [taskNumber, setTaskNumber] = useState(1);
  const [creating, setCreating] = useState(false);

  // Member Submit Work Modal
  const [submitTaskTarget, setSubmitTaskTarget] = useState<TaskItem | null>(null);
  const [fileUrl, setFileUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isCommitteeHead =
    currentUser?.role === 'committee_head' ||
    currentUser?.role === 'team_lead' ||
    currentUser?.role === 'hr_admin';

  const isMember =
    currentUser?.role === 'committee_member' || currentUser?.role === 'member';

  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await api.getTasks();
      setTasks(data);

      if (isMember) {
        try {
          const subPairs = await Promise.all(
            data.map(async (t) => {
              try {
                const s = await api.getTaskSubmissions(t.id);
                return [t.id, s[0] || null] as const;
              } catch {
                return [t.id, null] as const;
              }
            })
          );
          const map: Record<string, SubmissionItem> = {};
          for (const [tid, sub] of subPairs) {
            if (sub && sub.file_url) {
              map[tid] = sub;
            }
          }
          setMemberSubmissions(map);
        } catch (e) {
          console.error(e);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [currentUser?.role]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskDeadline) return;
    try {
      setCreating(true);
      await api.createTask({
        title: taskTitle,
        description: taskDesc || undefined,
        deadline: new Date(taskDeadline).toISOString(),
        max_score: maxScore,
        task_number: taskNumber,
      });
      setShowCreateModal(false);
      setTaskTitle('');
      setTaskDesc('');
      setTaskDeadline('');
      await loadTasks();
    } catch (err: any) {
      alert(err.message || 'Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  const handleSubmitWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitTaskTarget || !fileUrl.trim()) return;
    try {
      setSubmitting(true);
      await api.submitTask(submitTaskTarget.id, fileUrl);
      setSubmitTaskTarget(null);
      setFileUrl('');
      await loadTasks();
      alert('Deliverable submitted successfully! Your Committee Head will review your work.');
    } catch (err: any) {
      alert(err.message || 'Failed to submit work');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTasks = tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      `TSK-${t.task_number}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center shadow-sm">
            <CheckSquare className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Tasks &amp; Deliverables</h2>
            <p className="text-[12px] text-slate-500">
              {isMember
                ? 'Your assigned Social Media Committee deliverables and deadlines.'
                : 'Social Media Committee deliverables, deadlines, and member submissions.'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-blue-500 focus:bg-white w-48 transition-all"
            />
          </div>

          {isCommitteeHead && (
            <button
              onClick={() => {
                const nextNum = tasks.length + 1;
                setTaskNumber(nextNum);
                setTaskTitle(`Task ${nextNum}: Campaign Content Deliverable`);
                setShowCreateModal(true);
              }}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md shadow-sm text-[13px] font-medium flex items-center space-x-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Task</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Loading workspace tasks...</div>
      ) : (
        <div className="bg-white border border-slate-200 shadow-sm rounded-lg overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              {isMember ? 'My Assigned Sprints' : 'Social Media Committee Sprint Tasks'}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">{filteredTasks.length} items</span>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/80 transition-colors group"
              >
                <div className="flex items-center space-x-3 w-1/2 min-w-0">
                  <div className="flex-shrink-0 mt-0.5">
                    {isMember ? (
                      memberSubmissions[task.id]?.file_url ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300" />
                      )
                    ) : task.pending_count === 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-300" />
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-slate-400 w-14 shrink-0">
                    TSK-{task.task_number}
                  </span>
                  <div className="truncate">
                    <span className="text-[13px] font-medium text-slate-900 truncate group-hover:text-blue-600 transition-colors block">
                      {task.title}
                    </span>
                    {task.description && (
                      <span className="text-[11px] text-slate-400 truncate block">
                        {task.description}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-4 w-1/2 justify-end">
                  {task.deadline && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                    </div>
                  )}

                  {isMember ? (
                    <>
                      {/* Submission Status for this member */}
                      {memberSubmissions[task.id] && memberSubmissions[task.id].file_url ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-semibold border ${
                              memberSubmissions[task.id].status === 'LATE'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {memberSubmissions[task.id].status === 'LATE' ? 'Submitted (Late)' : 'Submitted (On-Time)'}
                          </span>
                          <a
                            href={memberSubmissions[task.id].file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-blue-600 p-1"
                            title="Open submitted deliverable link"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-semibold border bg-slate-50 text-slate-500 border-slate-200">
                          <Circle className="w-3 h-3 text-slate-400" />
                          Not Submitted
                        </span>
                      )}

                      <button
                        onClick={() => {
                          setSubmitTaskTarget(task);
                          setFileUrl(memberSubmissions[task.id]?.file_url || '');
                        }}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium flex items-center gap-1 shrink-0"
                      >
                        <Upload className="w-3 h-3" />
                        <span>{memberSubmissions[task.id]?.file_url ? 'Resubmit' : 'Submit Work'}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      {task.max_score != null && (
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          Max: {task.max_score}pts
                        </span>
                      )}

                      <div className="flex items-center space-x-2 w-28 shrink-0 border-l border-slate-100 pl-4">
                        <span className="text-[11px] text-slate-600 truncate">
                          {task.submission_count} Submitted
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}

            {filteredTasks.length === 0 && (
              <div className="px-4 py-8 text-center text-[13px] text-slate-500">
                No tasks found matching your filters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create Task (Committee Head) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Create Committee Task</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Task Title</label>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="e.g. Task 6: Reel Script & Storyboard"
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Task #</label>
                  <input
                    type="number"
                    min={1}
                    value={taskNumber}
                    onChange={(e) => setTaskNumber(parseInt(e.target.value) || 1)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Brief Description</label>
                <textarea
                  rows={3}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  placeholder="Task instructions, delivery criteria, or templates..."
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Deadline</label>
                  <input
                    type="datetime-local"
                    value={taskDeadline}
                    onChange={(e) => setTaskDeadline(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Max Score</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={maxScore}
                    onChange={(e) => setMaxScore(parseFloat(e.target.value) || 10.0)}
                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  {creating ? 'Publishing...' : 'Publish Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Submit Deliverable (Member) */}
      {submitTaskTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">
                Submit Deliverable: {submitTaskTarget.title}
              </h3>
              <button
                onClick={() => setSubmitTaskTarget(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Provide the direct link to your deliverable (Google Drive, Figma, Canva, or GitHub).
            </p>

            <form onSubmit={handleSubmitWork} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Deliverable URL</label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/your-work"
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSubmitTaskTarget(null)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1"
                >
                  <Upload className="w-3 h-3" />
                  <span>{submitting ? 'Submitting...' : 'Confirm Submission'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
