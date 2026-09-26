import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { MemberFeedbackItem, UserProfile } from '../types';
import {
  Plus,
  Search,
  ShieldCheck,
  Edit2,
  Shield,
  MessageSquareHeart,
} from 'lucide-react';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';
import { useToast } from '../context/ToastContext';

interface MemberFeedbackViewProps {
  currentUser?: UserProfile | null;
}

export const MemberFeedbackView: React.FC<MemberFeedbackViewProps> = ({ currentUser }) => {
  const toast = useToast();
  const [feedbacks, setFeedbacks] = useState<MemberFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUBMITTED' | 'REVIEWED' | 'ACTIONED'>('ALL');

  // Submit Feedback Modal (Member)
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [hrMemberName, setHrMemberName] = useState('Farah Tarek (Social Media HR Member)');
  const [category, setCategory] = useState('COMMUNICATION');
  const [content, setContent] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  // Review Status Modal (HR Leader only)
  const [reviewingItem, setReviewingItem] = useState<MemberFeedbackItem | null>(null);
  const [newStatus, setNewStatus] = useState<'REVIEWED' | 'ACTIONED'>('REVIEWED');
  const [leaderNotes, setLeaderNotes] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  const isMember = currentUser?.role === 'committee_member' || currentUser?.role === 'member';
  const isHrLeader = currentUser?.role === 'committee_hr_leader' || currentUser?.role === 'hr_admin';
  const isHrHead = currentUser?.role === 'region_hr_head';
  const isForbidden = currentUser?.role === 'committee_head' || currentUser?.role === 'committee_hr_member';

  const loadFeedbacks = async () => {
    if (isForbidden) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await api.getFeedback();
      setFeedbacks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeedbacks();
  }, [currentUser?.role]);

  if (isForbidden) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
        <div className="w-12 h-12 rounded-full bg-paper-200 flex items-center justify-center text-ink-faint">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base font-bold text-ink-900">Confidential HR Channel</h2>
          <p className="text-xs text-ink-soft mt-1 leading-relaxed">
            Member evaluations regarding HR members flow directly to the HR Committee Leader and are confidential.
            HR Members and Committee Heads do not have access to peer evaluations.
          </p>
        </div>
      </div>
    );
  }

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      setSubmittingFeedback(true);
      await api.submitFeedback({
        hr_member_name: hrMemberName,
        category,
        content: content.trim(),
      });
      setContent('');
      setShowSubmitModal(false);
      await loadFeedbacks();
      toast.success('Feedback submitted confidentially to HR Leader.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit feedback');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingItem) return;
    try {
      setSavingStatus(true);
      await api.updateFeedbackStatus(reviewingItem.id, {
        status: newStatus,
        notes: leaderNotes || undefined,
      });
      setReviewingItem(null);
      setLeaderNotes('');
      await loadFeedbacks();
      toast.success('Feedback status updated successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update feedback status');
    } finally {
      setSavingStatus(false);
    }
  };

  const filteredFeedbacks = feedbacks.filter((f) => {
    const matchesSearch =
      f.content.toLowerCase().includes(search.toLowerCase()) ||
      (f.student_name && f.student_name.toLowerCase().includes(search.toLowerCase())) ||
      (f.hr_member_name && f.hr_member_name.toLowerCase().includes(search.toLowerCase())) ||
      (f.arabic_name && f.arabic_name.includes(search));

    if (statusFilter === 'SUBMITTED') return matchesSearch && f.status === 'SUBMITTED';
    if (statusFilter === 'REVIEWED') return matchesSearch && f.status === 'REVIEWED';
    if (statusFilter === 'ACTIONED') return matchesSearch && f.status === 'ACTIONED';
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rule pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-medium leading-tight tracking-[-0.02em] text-ink-900">Feedback</h1>
            {isHrHead && (
              <span className="text-[11px] font-medium bg-paper-200 text-ink-soft px-2 py-0.5 rounded border border-rule">
                Oversight View (HR Region Head)
              </span>
            )}
          </div>
          <p className="text-[12px] text-ink-soft mt-0.5">
            Members submit feedback regarding HR Members. Reviewed and actioned by the HR Committee Leader.
          </p>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-auto">
            <Search className="w-3.5 h-3.5 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search feedback..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full min-w-0 rounded-md border border-rule bg-paper-100 pl-8 pr-3 text-base transition-colors placeholder:text-ink-faint focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20 sm:w-48 sm:text-[13px]"
            />
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-center gap-1 rounded-md border border-rule bg-paper-200/60 p-1 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`min-h-9 flex-1 rounded px-2.5 py-1.5 font-medium transition-colors sm:flex-none ${
                statusFilter === 'ALL' ? 'bg-ink-900 text-white' : 'text-ink-soft hover:bg-paper-100 hover:text-ink-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('SUBMITTED')}
              className={`min-h-9 flex-1 rounded px-2.5 py-1.5 font-medium transition-colors sm:flex-none ${
                statusFilter === 'SUBMITTED' ? 'bg-amber-100 text-amber-800' : 'text-ink-soft hover:bg-paper-100 hover:text-ink-900'
              }`}
            >
              Submitted
            </button>
            <button
              onClick={() => setStatusFilter('REVIEWED')}
              className={`min-h-9 flex-1 rounded px-2.5 py-1.5 font-medium transition-colors sm:flex-none ${
                statusFilter === 'REVIEWED' ? 'bg-indigo-100 text-indigo-800' : 'text-ink-soft hover:bg-paper-100 hover:text-ink-900'
              }`}
            >
              Reviewed
            </button>
            <button
              onClick={() => setStatusFilter('ACTIONED')}
              className={`min-h-9 flex-1 rounded px-2.5 py-1.5 font-medium transition-colors sm:flex-none ${
                statusFilter === 'ACTIONED' ? 'bg-green-100 text-green-800' : 'text-ink-soft hover:bg-paper-100 hover:text-ink-900'
              }`}
            >
              Actioned
            </button>
          </div>

          {isMember && (
            <button
              onClick={() => setShowSubmitModal(true)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 sm:w-auto sm:text-[13px]"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              <span>Submit feedback</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedbacks List */}
      {loading ? (
        <div className="p-12 text-center text-ink-soft text-sm">Loading member feedback records...</div>
      ) : filteredFeedbacks.length === 0 ? (
        <div className="bg-white border border-rule rounded-lg p-12 text-center text-ink-soft space-y-2">
          <MessageSquareHeart className="w-8 h-8 text-ink-300 mx-auto" />
          <p className="font-medium text-ink-800">No feedback submissions found</p>
          <p className="text-xs text-ink-faint">
            {isMember
              ? 'Have input regarding your HR Member interaction, attendance support, or communication? Submit feedback to your HR Leader.'
              : 'All member feedback for HR members has been processed.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFeedbacks.map((f) => (
            <div
              key={f.id}
              className="bg-white border border-rule rounded-lg p-5 shadow-sm space-y-3 hover:border-paper-400 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-paper-200 text-ink-800">
                      {f.category}
                    </span>
                    {f.status === 'ACTIONED' ? (
                      <Badge variant="success">Actioned by HR Leader</Badge>
                    ) : f.status === 'REVIEWED' ? (
                      <Badge variant="info">Reviewed</Badge>
                    ) : (
                      <Badge variant="warning">Submitted to HR Leader</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                    <span>
                      From: {f.arabic_name ? `${f.arabic_name} (${f.student_name})` : f.student_name || 'Member'}
                    </span>
                    {f.hr_member_name && (
                      <>
                        <span>•</span>
                        <span className="text-green-700 font-medium">HR Member: {f.hr_member_name}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>
                      {new Date(f.submitted_at || f.created_at || Date.now()).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {isHrLeader && f.status === 'SUBMITTED' && (
                  <button
                    onClick={() => {
                      setReviewingItem(f);
                      setNewStatus('REVIEWED');
                      setLeaderNotes(f.notes || '');
                    }}
                    className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md bg-ink-900 px-3 py-1.5 text-xs font-medium text-paper-50 transition-colors hover:bg-ink-800"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Review &amp; Action</span>
                  </button>
                )}
              </div>

              {/* Feedback Content */}
              <p className="text-xs text-ink-800 bg-paper-100/70 p-3 rounded-lg border border-ink-100 whitespace-pre-wrap">
                {f.content}
              </p>

              {/* Leader Notes */}
              {f.notes && (
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-3 space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-indigo-800 text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>HR Leader Assessment &amp; Actions:</span>
                  </div>
                  <p className="text-ink-800 whitespace-pre-wrap">{f.notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal: Submit Feedback */}
      <Modal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        title="Feedback for HR Member"
        description="Share confidential feedback regarding communication, support, or conduct."
        size="md"
      >
        <form onSubmit={handleSubmitFeedback} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-800 mb-1">HR Member</label>
            <input
              type="text"
              value={hrMemberName}
              onChange={(e) => setHrMemberName(e.target.value)}
              className="w-full text-xs border border-rule rounded-lg px-3 py-2 bg-paper-100 text-ink-800 focus:outline-none"
              placeholder="Target HR Member"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-800 mb-1">Feedback Topic</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full text-xs border border-rule rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-green-600"
            >
              <option value="COMMUNICATION">Communication &amp; Response Promptness</option>
              <option value="ATTENDANCE_SUPPORT">Attendance Tracking &amp; Excuses Support</option>
              <option value="BEHAVIOR_EVALUATION">Behavior &amp; Interaction Scoring</option>
              <option value="CONDUCT">Professional Conduct &amp; Respect</option>
              <option value="GENERAL_HR">General HR Guidance &amp; Mentorship</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-800 mb-1">Feedback Details</label>
            <textarea
              rows={4}
              placeholder="Share your experience, observations, or suggestions regarding the HR Member..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full text-xs border border-rule rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-600"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
            <button
              type="button"
              onClick={() => setShowSubmitModal(false)}
              className="px-3 py-1.5 border border-rule rounded-lg text-xs font-medium text-ink-soft hover:bg-paper-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingFeedback}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {submittingFeedback ? 'Sending...' : 'Submit to HR Leader'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Process Feedback (HR Leader) */}
      <Modal
        isOpen={!!reviewingItem}
        onClose={() => setReviewingItem(null)}
        title="Process Member HR Feedback"
        size="md"
      >
        {reviewingItem && (
          <div className="space-y-4">
            <div className="bg-paper-100 p-3 rounded-lg border border-ink-100 text-xs text-ink-800">
              <p className="font-semibold text-ink-900 mb-1">
                From {reviewingItem.arabic_name || reviewingItem.student_name} regarding {reviewingItem.hr_member_name || 'HR Member'}:
              </p>
              <p>{reviewingItem.content}</p>
            </div>

            <form onSubmit={handleSaveStatus} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink-800 mb-1">Status Update</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="w-full text-xs border border-rule rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-ink-900"
                >
                  <option value="REVIEWED">Reviewed (Acknowledged)</option>
                  <option value="ACTIONED">Actioned (Addressed with HR Member)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-800 mb-1">
                  HR Leader Internal Assessment &amp; Actions
                </label>
                <textarea
                  rows={3}
                  placeholder="Notes on coaching provided, internal review, or follow-up taken..."
                  value={leaderNotes}
                  onChange={(e) => setLeaderNotes(e.target.value)}
                  className="w-full text-xs border border-rule rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ink-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-ink-100">
                <button
                  type="button"
                  onClick={() => setReviewingItem(null)}
                  className="px-3 py-1.5 border border-rule rounded-lg text-xs font-medium text-ink-soft hover:bg-paper-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingStatus}
                  className="px-4 py-1.5 bg-ink-900 hover:bg-ink-800 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  {savingStatus ? 'Saving...' : 'Save Assessment'}
                </button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
};
