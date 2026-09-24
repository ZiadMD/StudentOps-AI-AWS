import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { CommitteeReportItem, UserProfile } from '../types';
import {
  FileText,
  Send,
  Plus,
  TrendingUp,
  Award,
  Users,
  Calendar,
} from 'lucide-react';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';
import { useToast } from '../context/ToastContext';

export interface ReportMetrics {
  total_members?: number;
  avg_total_score?: number | string;
  avg_task_quality?: number | string;
  avg_attendance_rate?: number | string;
  overall_attendance_rate?: number | string;
  top_performers_count?: number;
  critical_followups_count?: number;
  [key: string]: unknown;
}

interface CommitteeReportsViewProps {
  currentUser?: UserProfile | null;
}

export const CommitteeReportsView: React.FC<CommitteeReportsViewProps> = ({ currentUser }) => {
  const toast = useToast();
  const [reports, setReports] = useState<CommitteeReportItem[]>([]);
  const [summary, setSummary] = useState<ReportMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  // Submit Report Modal (HR Leader)
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isHrLeader = currentUser?.role === 'committee_hr_leader' || currentUser?.role === 'hr_admin';

  const loadData = async () => {
    try {
      setLoading(true);
      const [reps, commSummary] = await Promise.all([
        api.getCommitteeReports().catch(() => []),
        api.getCommitteeSummary().catch(() => null),
      ]);
      setReports(reps);
      setSummary(commSummary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTitle.trim()) return;
    try {
      setSubmitting(true);
      await api.submitCommitteeReport({
        report_title: reportTitle,
        notes: reportNotes || undefined,
      });
      setReportTitle('');
      setReportNotes('');
      setShowSubmitModal(false);
      await loadData();
      toast.success('Executive report dispatched to Region HR Head successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-[26px] leading-tight font-bold text-slate-900 tracking-tight">
            Executive Committee Reports
          </h2>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Social Media Committee performance synthesis from HR Leader to HR Region Head.
          </p>
        </div>

        {isHrLeader && (
          <button
            onClick={() => {
              setReportTitle(`Social Media Sprint Performance Report — ${new Date().toLocaleDateString([], { month: 'short', year: 'numeric' })}`);
              setShowSubmitModal(true);
            }}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md shadow-sm text-[13px] font-medium flex items-center space-x-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Submit Sprint Report to Head</span>
          </button>
        )}
      </div>

      {/* Real-time Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Committee Size</span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-900 font-mono">{summary.total_members}</div>
            <p className="text-[11px] text-slate-400">Active Social Media Members</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Average Total Score</span>
              <Award className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-bold text-indigo-600 font-mono">{summary.avg_total_score}</div>
            <p className="text-[11px] text-slate-400">Across behavior, quality &amp; attendance</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Task Quality Avg</span>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-emerald-600 font-mono">{summary.avg_task_quality} / 10</div>
            <p className="text-[11px] text-slate-400">Graded by Committee Head</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Attendance Rate</span>
              <Calendar className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-blue-600 font-mono">{summary.overall_attendance_rate}%</div>
            <p className="text-[11px] text-slate-400">Target baseline: 70%</p>
          </div>
        </div>
      )}

      {/* Submitted Reports Timeline */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Submitted Reports to Region Head</h3>
          <span className="text-xs font-mono text-slate-400">{reports.length} reports logged</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading executive reports...</div>
        ) : reports.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 space-y-2">
            <FileText className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-medium text-slate-700">No committee reports submitted yet</p>
            <p className="text-xs text-slate-400">
              The HR Leader compiles performance metrics and submits the executive report upward to the Region HR Head.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((rep) => {
              let metrics: ReportMetrics | null = null;
              if (typeof rep.metrics_summary === 'string') {
                try {
                  metrics = JSON.parse(rep.metrics_summary);
                } catch {
                  metrics = null;
                }
              } else {
                metrics = rep.metrics_summary;
              }

              return (
                <div
                  key={rep.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{rep.report_title}</span>
                        <Badge variant="success">Submitted to HR Head</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>Submitted by {rep.submitted_by_name || 'HR Leader'}</span>
                        <span>•</span>
                        <span>
                          {new Date(rep.submitted_at).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Metrics Breakdown */}
                  {metrics && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono text-xs">
                      <div>
                        <span className="text-slate-500 text-[11px] block">Active Members</span>
                        <span className="font-bold text-slate-800">{metrics.total_members}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block">Avg Total Score</span>
                        <span className="font-bold text-indigo-600">{metrics.avg_total_score}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block">Avg Quality</span>
                        <span className="font-bold text-emerald-600">{metrics.avg_task_quality} / 10</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block">Attendance</span>
                        <span className="font-bold text-blue-600">{metrics.overall_attendance_rate}%</span>
                      </div>
                    </div>
                  )}

                  {/* Leader Notes */}
                  {rep.notes && (
                    <div className="text-xs text-slate-700 bg-slate-50/50 p-3 rounded-lg border border-slate-100 space-y-1">
                      <span className="font-semibold text-slate-900 block text-[11px]">HR Leader Executive Notes:</span>
                      <p className="whitespace-pre-wrap">{rep.notes}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Submit Report to Head */}
      <Modal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        title="Submit Report to HR Head (Region)"
        description="This compiles current Social Media Committee scores, attendance stats, and member feedback metrics into a formal briefing for the Region HR Head."
        size="md"
      >
        <form onSubmit={handleSubmitReport} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Report Title</label>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-600"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Executive Notes &amp; Observations
            </label>
            <textarea
              rows={4}
              placeholder="Detail committee progress, campaign highlights, member retention, or operational challenges..."
              value={reportNotes}
              onChange={(e) => setReportNotes(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-600"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowSubmitModal(false)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
            >
              <Send className="w-3 h-3" />
              <span>{submitting ? 'Transmitting...' : 'Dispatch Report to Region Head'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
