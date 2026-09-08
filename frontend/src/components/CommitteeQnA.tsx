import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { MemberQuestionItem, UserProfile } from '../types';
import {
  HelpCircle,
  MessageCircleQuestion,
  CheckCircle2,
  Send,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { Badge } from './ui/Badge';

interface CommitteeQnAProps {
  currentUser?: UserProfile | null;
}

export const CommitteeQnA: React.FC<CommitteeQnAProps> = ({ currentUser }) => {
  const [questions, setQuestions] = useState<MemberQuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'ANSWERED'>('ALL');

  // Member Ask Question Modal
  const [showAskModal, setShowAskModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [submittingAsk, setSubmittingAsk] = useState(false);

  // Committee Head Answer Modal
  const [answeringQuestion, setAnsweringQuestion] = useState<MemberQuestionItem | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

  const isMember = currentUser?.role === 'committee_member' || currentUser?.role === 'member';
  const canAnswer =
    currentUser?.role === 'committee_head' ||
    currentUser?.role === 'team_lead' ||
    currentUser?.role === 'hr_admin';

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const data = await api.getQuestions();
      setQuestions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  const handleAskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    try {
      setSubmittingAsk(true);
      await api.askQuestion({ title: newTitle, content: newContent });
      setNewTitle('');
      setNewContent('');
      setShowAskModal(false);
      await loadQuestions();
    } catch (err: any) {
      alert(err.message || 'Failed to submit question');
    } finally {
      setSubmittingAsk(false);
    }
  };

  const handleAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answeringQuestion || !answerText.trim()) return;
    try {
      setSubmittingAnswer(true);
      await api.answerQuestion(answeringQuestion.id, answerText);
      setAnsweringQuestion(null);
      setAnswerText('');
      await loadQuestions();
    } catch (err: any) {
      alert(err.message || 'Failed to answer question');
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const filteredQuestions = questions.filter((q) => {
    const matchesSearch =
      q.title.toLowerCase().includes(search.toLowerCase()) ||
      q.content.toLowerCase().includes(search.toLowerCase()) ||
      (q.student_name && q.student_name.toLowerCase().includes(search.toLowerCase())) ||
      (q.arabic_name && q.arabic_name.includes(search));

    if (statusFilter === 'OPEN') return matchesSearch && q.status === 'OPEN';
    if (statusFilter === 'ANSWERED') return matchesSearch && q.status === 'ANSWERED';
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center shadow-sm">
            <MessageCircleQuestion className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Social Media Committee Q&amp;A
            </h2>
            <p className="text-[12px] text-slate-500">
              Members ask technical &amp; workflow questions; Committee Head provides authoritative answers.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search inquiries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-blue-500 focus:bg-white w-48 transition-all"
            />
          </div>

          <div className="flex items-center border border-slate-200 rounded-md bg-white p-0.5 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('OPEN')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === 'OPEN' ? 'bg-amber-100 text-amber-800' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setStatusFilter('ANSWERED')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === 'ANSWERED' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Answered
            </button>
          </div>

          {isMember && (
            <button
              onClick={() => setShowAskModal(true)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm text-[13px] font-medium flex items-center space-x-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ask Committee Head</span>
            </button>
          )}
        </div>
      </div>

      {/* Questions List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Loading inquiries...</div>
      ) : filteredQuestions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 space-y-2">
          <HelpCircle className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="font-medium text-slate-700">No questions found</p>
          <p className="text-xs text-slate-400">
            {isMember
              ? 'Have a question about campaigns, reel formats, or guidelines? Click Ask Committee Head.'
              : 'All member technical questions are answered.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuestions.map((q) => (
            <div
              key={q.id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{q.title}</span>
                    {q.status === 'ANSWERED' ? (
                      <Badge variant="success">Answered</Badge>
                    ) : (
                      <Badge variant="warning">Awaiting Head Review</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>
                      Asked by: {q.arabic_name ? `${q.arabic_name} (${q.student_name})` : q.student_name || 'Member'}
                    </span>
                    <span>•</span>
                    <span>{new Date(q.asked_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                {canAnswer && q.status === 'OPEN' && (
                  <button
                    onClick={() => {
                      setAnsweringQuestion(q);
                      setAnswerText('');
                    }}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center gap-1 shrink-0"
                  >
                    <Send className="w-3 h-3" />
                    <span>Answer</span>
                  </button>
                )}
              </div>

              {/* Question body */}
              <p className="text-xs text-slate-700 bg-slate-50/70 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
                {q.content}
              </p>

              {/* Answer if present */}
              {q.answer && (
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg p-3 space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-800 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Committee Head Guidance:</span>
                    {q.answered_at && (
                      <span className="font-normal text-emerald-600">
                        ({new Date(q.answered_at).toLocaleDateString([], { month: 'short', day: 'numeric' })})
                      </span>
                    )}
                  </div>
                  <p className="text-slate-800 whitespace-pre-wrap">{q.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal: Ask Question */}
      {showAskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Ask Committee Head</h3>
              <button
                onClick={() => setShowAskModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAskSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Subject / Topic</label>
                <input
                  type="text"
                  placeholder="e.g., Target Aspect Ratio for Reel Submission"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Question Details</label>
                <textarea
                  rows={4}
                  placeholder="Describe your technical or workflow question in detail..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAskModal(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAsk}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  {submittingAsk ? 'Submitting...' : 'Send Inquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Answer Question */}
      {answeringQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">
                Answer Question: {answeringQuestion.title}
              </h3>
              <button
                onClick={() => setAnsweringQuestion(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-700">
              <p className="font-semibold text-slate-900 mb-1">Member Inquired:</p>
              <p>{answeringQuestion.content}</p>
            </div>

            <form onSubmit={handleAnswerSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Official Guidance / Answer
                </label>
                <textarea
                  rows={4}
                  placeholder="Provide technical specifications, reference links, or directions..."
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAnsweringQuestion(null)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAnswer}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  {submittingAnswer ? 'Posting...' : 'Publish Answer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
