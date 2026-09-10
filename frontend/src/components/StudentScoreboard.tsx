import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { StudentScoreSummary, UserProfile } from '../types';
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  Shield,
  Edit3,
  Check,
  Eye,
  Award,
} from 'lucide-react';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';
import { useToast } from '../context/ToastContext';

interface StudentScoreboardProps {
  currentUser?: UserProfile | null;
}

export const StudentScoreboard: React.FC<StudentScoreboardProps> = ({ currentUser }) => {
  const toast = useToast();
  const [data, setData] = useState<StudentScoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Editing state for HR members
  const [editingStudent, setEditingStudent] = useState<StudentScoreSummary | null>(null);
  const [editForm, setEditForm] = useState({
    group_interaction: 5,
    social_media: 5,
    hierarchy_rules: 5,
    polite_conduct: 8,
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  // Bonus awarding state for HR Leader
  const [bonusStudent, setBonusStudent] = useState<StudentScoreSummary | null>(null);
  const [bonusPoints, setBonusPoints] = useState<number>(2.0);
  const [bonusReason, setBonusReason] = useState<string>('');
  const [awardingBonus, setAwardingBonus] = useState(false);

  const isCommitteeMember = currentUser?.role === 'committee_member' || currentUser?.role === 'member';
  const isCommitteeHead = currentUser?.role === 'committee_head' || currentUser?.role === 'team_lead';
  const isHrLeader =
    currentUser?.role === 'committee_hr_leader' ||
    currentUser?.role === 'hr_admin';
  const canEditBehavior =
    currentUser?.role === 'committee_hr_member' ||
    currentUser?.role === 'committee_hr_leader' ||
    currentUser?.role === 'region_hr_head' ||
    currentUser?.role === 'hr_admin';

  const loadData = async () => {
    if (isCommitteeMember) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const board = await api.getScoreboard();
      setData(board);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser?.role]);

  const handleOpenEdit = (student: StudentScoreSummary) => {
    setEditingStudent(student);
    setEditForm({
      group_interaction: student.group_interaction_score,
      social_media: student.social_media_score,
      hierarchy_rules: student.hierarchy_rules_score,
      polite_conduct: student.polite_conduct_score,
      notes: '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    try {
      setSaving(true);
      await api.updateBehaviorScore(editingStudent.student_id, editForm);
      setEditingStudent(null);
      await loadData();
      toast.success('Behavior score updated successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update behavior score');
    } finally {
      setSaving(false);
    }
  };

  const handleAwardBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bonusStudent || !bonusReason.trim()) return;
    try {
      setAwardingBonus(true);
      await api.awardBonus(bonusStudent.student_id, { points: bonusPoints, notes: bonusReason });
      setBonusStudent(null);
      setBonusPoints(2.0);
      setBonusReason('');
      await loadData();
      toast.success('Bonus awarded successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to award bonus');
    } finally {
      setAwardingBonus(false);
    }
  };

  if (isCommitteeMember) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Scorecards are Confidential</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Member behavioral evaluations and scorecards are confidential and only accessible to Committee Heads
            and HR coordinators.
          </p>
        </div>
      </div>
    );
  }

  const filteredData = data.filter(
    (s) =>
      s.student_name.toLowerCase().includes(search.toLowerCase()) ||
      s.arabic_name.includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Member Evaluations</h2>
            {isCommitteeHead && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                <Eye className="w-3 h-3" />
                Read-Only (Committee Head)
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">Behavior score (/23), interaction score (/5), task quality (/10), and bonuses</p>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full sm:w-64 transition-all"
            />
          </div>
          <button className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center space-x-2 text-sm font-medium transition-colors shrink-0">
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filter</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading evaluations…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-4 font-medium flex items-center space-x-1">
                    <span>Rank</span>
                    <ChevronDown className="w-3 h-3" />
                  </th>
                  <th className="px-6 py-4 font-medium">Member</th>
                  <th className="px-6 py-4 font-medium text-right">Attendance</th>
                  <th className="px-6 py-4 font-medium text-right">Task Quality (/10)</th>
                  <th className="px-6 py-4 font-medium text-right">Behavior (/23)</th>
                  <th className="px-6 py-4 font-medium text-right">Interaction (/5)</th>
                  <th className="px-6 py-4 font-medium text-right">Bonus</th>
                  <th className="px-6 py-4 font-medium text-right font-bold text-slate-800" title="Composite score across behavior, tasks, and bonus points">Total Score</th>
                  <th className="px-6 py-4 font-medium text-right">Final Status</th>
                  {(canEditBehavior || isHrLeader) && <th className="px-6 py-4 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-100">
                {filteredData.map((student, idx) => (
                  <tr key={student.student_id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        {idx < 3 ? (
                          <div
                            className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${
                              idx === 0
                                ? 'bg-amber-100 text-amber-700'
                                : idx === 1
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {idx + 1}
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded flex items-center justify-center text-xs font-medium text-slate-400 bg-slate-50">
                            {idx + 1}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {student.arabic_name}
                        </span>
                        <span className="text-[11px] text-slate-500">{student.student_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-slate-700">
                      {student.on_time_attendance_count + student.late_attendance_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-slate-700">
                      {student.average_task_quality.toFixed(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-mono">
                      <span
                        className={
                          student.total_behavior_score >= 20 ? 'text-emerald-600 font-bold' : 'text-slate-700'
                        }
                      >
                        {student.total_behavior_score} / 23
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-slate-700">
                      {student.group_interaction_score ?? 5.0} / 5
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-xs">
                      {student.bonus_points && student.bonus_points > 0 ? (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-100">
                          +{student.bonus_points}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-bold text-indigo-700">
                      {student.total_score !== undefined && student.total_score !== null ? (
                        student.total_score
                      ) : (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200"
                          title="Score components are kept separate. Total score formula is pending organization definition."
                        >
                          Separate Components
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {student.overall_rating === 'Outstanding' ? (
                        <Badge variant="success">Outstanding</Badge>
                      ) : student.overall_rating === 'Good' ? (
                        <Badge variant="info">Good</Badge>
                      ) : (
                        <Badge variant="warning">Needs Review</Badge>
                      )}
                    </td>
                    {(canEditBehavior || isHrLeader) && (
                      <td className="px-6 py-4 whitespace-nowrap text-right space-x-1.5">
                        {canEditBehavior && (
                          <button
                            onClick={() => handleOpenEdit(student)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Grade /23
                          </button>
                        )}
                        {isHrLeader && (
                          <button
                            onClick={() => {
                              setBonusStudent(student);
                              setBonusPoints(2.0);
                              setBonusReason('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md border border-indigo-100 transition-colors"
                          >
                            <Award className="w-3.5 h-3.5" />
                            Bonus
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal for Grading Behavior */}
      <Modal
        isOpen={!!editingStudent}
        onClose={() => setEditingStudent(null)}
        title={editingStudent ? `Evaluate Behavior: ${editingStudent.arabic_name}` : 'Evaluate Behavior'}
        description={editingStudent ? editingStudent.student_name : undefined}
        size="md"
      >
        {editingStudent && (
          <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Group Interaction (/5)</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.5"
                  value={editForm.group_interaction}
                  onChange={(e) =>
                    setEditForm({ ...editForm, group_interaction: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Social Media (/5)</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.5"
                  value={editForm.social_media}
                  onChange={(e) =>
                    setEditForm({ ...editForm, social_media: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Hierarchy Rules (/5)</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.5"
                  value={editForm.hierarchy_rules}
                  onChange={(e) =>
                    setEditForm({ ...editForm, hierarchy_rules: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Polite Conduct (/8)</label>
                <input
                  type="number"
                  min="0"
                  max="8"
                  step="0.5"
                  value={editForm.polite_conduct}
                  onChange={(e) =>
                    setEditForm({ ...editForm, polite_conduct: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">HR Evaluation Notes</label>
              <textarea
                rows={2}
                placeholder="Optional observation notes..."
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="pt-3 flex items-center justify-between border-t border-slate-100">
              <span className="font-semibold text-slate-800">
                Total:{' '}
                {(
                  editForm.group_interaction +
                  editForm.social_media +
                  editForm.hierarchy_rules +
                  editForm.polite_conduct
                ).toFixed(1)}{' '}
                / 23
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : 'Save Evaluation'}
                </button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Award Bonus (HR Leader) */}
      <Modal
        isOpen={!!bonusStudent}
        onClose={() => setBonusStudent(null)}
        title={bonusStudent ? `Award Member Bonus: ${bonusStudent.arabic_name || bonusStudent.student_name}` : 'Award Member Bonus'}
        description="The HR Leader can grant merit bonus points that flow directly into the member's Total Score."
        size="md"
      >
        {bonusStudent && (
          <form onSubmit={handleAwardBonus} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Bonus Points (e.g. 1.0 to 5.0)
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="10.0"
                value={bonusPoints}
                onChange={(e) => setBonusPoints(parseFloat(e.target.value) || 0)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-600 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Recognition Reason / Justification
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Exceptional reel editing turn-around and active community moderation..."
                value={bonusReason}
                onChange={(e) => setBonusReason(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBonusStudent(null)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={awardingBonus}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
              >
                {awardingBonus ? 'Awarding...' : 'Grant Bonus Points'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
