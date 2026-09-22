import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { MemberQuestionItem, UserProfile } from '../types';
import {
  HelpCircle,
  CheckCircle2,
  Send,
  Plus,
  Search,
} from 'lucide-react';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';

interface CommitteeQnAProps {
  currentUser?: UserProfile | null;
}

export const CommitteeQnA: React.FC<CommitteeQnAProps> = ({ currentUser }) => {
  const toast = useToast();
  const { t } = useLanguage();
  const [questions, setQuestions] = useState<MemberQuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'ANSWERED'>('ALL');

  // Member Ask Question Modal
  const [showAskModal, setShowAskModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [submittingAsk, setSubmittingAsk] = useState(false);

  // Committee Head / HR Head Answer Modal
  const [answeringQuestion, setAnsweringQuestion] = useState<MemberQuestionItem | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

  const isMember = currentUser?.role === 'committee_member' || currentUser?.role === 'member';
  const canAnswer =
    currentUser?.role === 'committee_head' ||
    currentUser?.role === 'team_lead' ||
    currentUser?.role === 'hr_admin' ||
    currentUser?.role === 'region_hr_head';

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
      toast.success('Inquiry submitted to Committee Head successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit question');
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
      toast.success('Guidance and answer published successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to answer question');
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
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {t('qnaTitle')}
          </h2>
          <p className="text-[12px] text-slate-500 mt-0.5">
            {t('qnaSubtitle')}
          </p>
        </div>

        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 rtl:pl-3 rtl:pr-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-[13px] focus:outline-none focus:border-blue-500 focus:bg-white w-48 transition-all"
            />
          </div>

          <div className="flex items-center border border-slate-200 rounded-md bg-white p-0.5 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('all')}
            </button>
            <button
              onClick={() => setStatusFilter('OPEN')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === 'OPEN' ? 'bg-amber-100 text-amber-800' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('open')}
            </button>
            <button
              onClick={() => setStatusFilter('ANSWERED')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === 'ANSWERED' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('answered')}
            </button>
          </div>

          {isMember && (
            <button
              onClick={() => setShowAskModal(true)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm text-[13px] font-medium flex items-center space-x-1.5 rtl:space-x-reverse transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('askHead')}</span>
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
                    <span>{t('answerQuestion')}</span>
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
                    <span>{t('headGuidance')}:</span>
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
      <Modal
        isOpen={showAskModal}
        onClose={() => setShowAskModal(false)}
        title={t('askHead')}
        description="Submit a question regarding deliverables, workflow, or tools."
        size="md"
      >
        <form onSubmit={handleAskSubmit} className="space-y-4">
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

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAskModal(false)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={submittingAsk}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {submittingAsk ? t('submitting') : 'Send Inquiry'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Answer Question */}
      <Modal
        isOpen={!!answeringQuestion}
        onClose={() => setAnsweringQuestion(null)}
        title={answeringQuestion ? `${t('answerQuestion')}: ${answeringQuestion.title}` : t('answerQuestion')}
        size="md"
      >
        {answeringQuestion && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-700">
              <p className="font-semibold text-slate-900 mb-1">Member Inquired:</p>
              <p>{answeringQuestion.content}</p>
            </div>

            <form onSubmit={handleAnswerSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('headGuidance')}
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

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAnsweringQuestion(null)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submittingAnswer}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  {submittingAnswer ? t('submitting') : t('answerQuestion')}
                </button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
};
