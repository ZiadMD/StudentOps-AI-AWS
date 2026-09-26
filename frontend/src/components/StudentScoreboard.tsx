import React, { useState } from 'react';
import { api } from '../api/client';
import { StudentScoreSummary, UserProfile } from '../types';
import {
  Search,
  SlidersHorizontal,
  Shield,
  Edit3,
  Check,
  Eye,
  Award,
} from 'lucide-react';
import { Badge } from './ui/Badge';
import { Modal } from './ui/Modal';
import { SkeletonTableRow, SkeletonCard } from './ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { useCachedData } from '../hooks/useCachedData';

interface StudentScoreboardProps {
  currentUser?: UserProfile | null;
}

export const StudentScoreboard: React.FC<StudentScoreboardProps> = ({ currentUser }) => {
  const toast = useToast();
  const [search, setSearch] = useState('');

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

  // Secure In-Memory Cached Scoreboard with SWR
  const {
    data: cachedData,
    loading,
    refresh: loadData,
  } = useCachedData<StudentScoreSummary[]>(
    'scoreboard_list',
    () => api.getScoreboard(),
    { enabled: !isCommitteeMember, userId: currentUser?.id }
  );
  const data = cachedData || [];

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

      <div className="bg-white border border-slate-200 shadow-xs rounded-xl overflow-hidden">
        {loading ? (
          <div>
            {/* Desktop Table Skeletons */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3.5 w-16">Rank</th>
                    <th className="px-5 py-3.5">Member</th>
                    <th className="px-5 py-3.5 text-right">Attendance</th>
                    <th className="px-5 py-3.5 text-right">Task Quality</th>
                    <th className="px-5 py-3.5 text-right">Behavior Score</th>
                    <th className="px-5 py-3.5 text-right">Bonus</th>
                    <th className="px-5 py-3.5 text-center">Rating Tier</th>
                    {(canEditBehavior || isHrLeader) && <th className="px-5 py-3.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-100">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonTableRow key={i} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Skeletons */}
            <div className="block md:hidden p-3 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table View (hidden on mobile) */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-5 py-3.5 w-16">Rank</th>
                    <th className="px-5 py-3.5">Member</th>
                    <th className="px-5 py-3.5 text-right">Attendance</th>
                    <th className="px-5 py-3.5 text-right">Task Quality</th>
                    <th className="px-5 py-3.5 text-right">Behavior Score</th>
                    <th className="px-5 py-3.5 text-right">Bonus</th>
                    <th className="px-5 py-3.5 text-center">Rating Tier</th>
                    {(canEditBehavior || isHrLeader) && <th className="px-5 py-3.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-100">
                  {filteredData.map((student, idx) => (
                    <tr key={student.student_id} className="hover:bg-slate-50/60 transition-colors group">
                      {/* Rank */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div
                          className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${
                            idx === 0
                              ? 'bg-amber-100 text-amber-800'
                              : idx === 1
                              ? 'bg-slate-200 text-slate-800'
                              : idx === 2
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'text-slate-400 bg-slate-50 font-medium'
                          }`}
                        >
                          {idx + 1}
                        </div>
                      </td>

                      {/* Member Identity */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 font-['Cairo'] text-sm group-hover:text-blue-700 transition-colors">
                            {student.arabic_name}
                          </span>
                          <span className="text-[11px] text-slate-500">{student.student_name}</span>
                        </div>
                      </td>

                      {/* Attendance */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono text-slate-700 text-xs">
                        <span>{student.on_time_attendance_count + student.late_attendance_count}</span>
                        <span className="text-slate-400 text-[10px] ml-1">sessions</span>
                      </td>

                      {/* Task Quality */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono text-slate-800 text-xs font-semibold">
                        <span>{student.average_task_quality.toFixed(1)}</span>
                        <span className="text-slate-400 text-[10px] ml-0.5">/10</span>
                      </td>

                      {/* Behavior (/23) */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono text-xs">
                        <span
                          className={
                            student.total_behavior_score >= 20 
                              ? 'text-emerald-700 font-bold' 
                              : student.total_behavior_score >= 15 
                              ? 'text-slate-800 font-medium' 
                              : 'text-amber-700 font-medium'
                          }
                        >
                          {student.total_behavior_score}
                        </span>
                        <span className="text-slate-400 text-[10px] ml-0.5">/23</span>
                      </td>

                      {/* Bonus */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono text-xs">
                        {student.bonus_points && student.bonus_points > 0 ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-100">
                            +{student.bonus_points}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Rating Tier */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        {student.overall_rating === 'Outstanding' ? (
                          <Badge variant="success">Outstanding</Badge>
                        ) : student.overall_rating === 'Good' ? (
                          <Badge variant="info">Good</Badge>
                        ) : (
                          <Badge variant="warning">Needs Review</Badge>
                        )}
                      </td>

                      {/* Actions */}
                      {(canEditBehavior || isHrLeader) && (
                        <td className="px-5 py-3.5 whitespace-nowrap text-right space-x-1.5">
                          {canEditBehavior && (
                            <button
                              onClick={() => handleOpenEdit(student)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                              <span>Grade</span>
                            </button>
                          )}
                          {isHrLeader && (
                            <button
                              onClick={() => {
                                setBonusStudent(student);
                                setBonusPoints(2.0);
                                setBonusReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:text-blue-900 bg-blue-50/70 hover:bg-blue-100 border border-blue-200/80 rounded-md transition-colors"
                            >
                              <Award className="w-3.5 h-3.5 text-blue-600" />
                              <span>Bonus</span>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Evaluation Card Transform (Zero horizontal scroll!) */}
            <div className="block md:hidden divide-y divide-slate-100">
              {filteredData.map((student, idx) => (
                <div key={student.student_id} className="p-4 space-y-3 hover:bg-slate-50/50 transition-colors">
                  {/* Card Header: Rank + Bilingual Identity + Rating Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div
                        className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold shrink-0 ${
                          idx === 0
                            ? 'bg-amber-100 text-amber-800'
                            : idx === 1
                            ? 'bg-slate-200 text-slate-800'
                            : idx === 2
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'text-slate-400 bg-slate-50 font-medium'
                        }`}
                      >
                        #{idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm font-['Cairo'] truncate">
                          {student.arabic_name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {student.student_name}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {student.overall_rating === 'Outstanding' ? (
                        <Badge variant="success">Outstanding</Badge>
                      ) : student.overall_rating === 'Good' ? (
                        <Badge variant="info">Good</Badge>
                      ) : (
                        <Badge variant="warning">Needs Review</Badge>
                      )}
                    </div>
                  </div>

                  {/* 3-Metric Key-Value Strip */}
                  <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-center font-mono">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-sans font-medium">Behavior</div>
                      <div className="text-xs font-bold text-slate-800 mt-0.5">{student.total_behavior_score}/23</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-sans font-medium">Task Qual</div>
                      <div className="text-xs font-bold text-slate-800 mt-0.5">{student.average_task_quality.toFixed(1)}/10</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-sans font-medium">Attendance</div>
                      <div className="text-xs font-bold text-slate-800 mt-0.5">{student.on_time_attendance_count + student.late_attendance_count} ses</div>
                    </div>
                  </div>

                  {/* Optional Bonus Chip & Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div>
                      {student.bonus_points && student.bonus_points > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-100">
                          +{student.bonus_points} Bonus Pts
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">No bonus points</span>
                      )}
                    </div>

                    {(canEditBehavior || isHrLeader) && (
                      <div className="flex items-center space-x-2">
                        {canEditBehavior && (
                          <button
                            onClick={() => handleOpenEdit(student)}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                          >
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
                            className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                          >
                            Bonus
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {filteredData.length === 0 && (
              <div className="py-16 text-center text-slate-400 text-sm">
                No evaluation records found matching your query.
              </div>
            )}
          </>
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
