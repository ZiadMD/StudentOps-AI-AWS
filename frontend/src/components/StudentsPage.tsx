import React, { useState } from 'react';
import { api } from '../api/client';
import { Student, StudentCreatePayload, TeamItem, UserProfile } from '../types';
import { useToast } from '../context/ToastContext';
import { Modal } from './ui/Modal';
import { SkeletonTableRow, SkeletonCard } from './ui/Skeleton';
import { useCachedData } from '../hooks/useCachedData';
import { 
  Search, Plus, MoreHorizontal, 
  UserCheck, UserX, Mail, Phone, University,
  AlertCircle, Loader2
} from 'lucide-react';

interface StudentsPageProps {
  currentUser?: UserProfile | null;
}

export const StudentsPage: React.FC<StudentsPageProps> = ({ currentUser }) => {
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const canAddMember = !currentUser || [
    'region_hr_head',
    'committee_hr_leader',
    'committee_head',
    'team_lead',
    'hr_admin',
    'committee_hr_member',
  ].includes(currentUser.role);

  const canSelectTeam = currentUser?.role === 'hr_admin' || currentUser?.role === 'region_hr_head';

  // Secure In-Memory Cached Data with SWR
  const {
    data: cachedStudents,
    loading,
    mutate: mutateStudents,
  } = useCachedData<Student[]>(
    'students_list',
    () => api.getStudents(),
    { userId: currentUser?.id }
  );
  const students = cachedStudents || [];

  const { data: cachedTeams } = useCachedData<TeamItem[]>(
    'teams_list',
    () => api.getTeams(),
    { enabled: canSelectTeam, userId: currentUser?.id }
  );
  const teams = cachedTeams || [];

  // Modal & Form State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [submitting, setSubmitting]         = useState(false);
  const [formError, setFormError]           = useState<string | null>(null);

  // Form Fields
  const [fullName, setFullName]             = useState('');
  const [arabicName, setArabicName]         = useState('');
  const [email, setEmail]                   = useState('');
  const [phone, setPhone]                   = useState('');
  const [university, setUniversity]         = useState('Faculty of Engineering');
  const [role, setRole]                     = useState('Member');
  const [status, setStatus]                 = useState('ACTIVE');
  const [studentCode, setStudentCode]       = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');

  const toast = useToast();

  const resetForm = () => {
    setFullName('');
    setArabicName('');
    setEmail('');
    setPhone('');
    setUniversity('Faculty of Engineering');
    setRole('Member');
    setStatus('ACTIVE');
    setStudentCode('');
    setSelectedTeamId('');
    setFormError(null);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!fullName.trim() || !arabicName.trim() || !email.trim() || !phone.trim()) {
      setFormError('Please fill in all required fields (Full Name, Arabic Name, Email, Phone).');
      return;
    }

    setSubmitting(true);
    try {
      const payload: StudentCreatePayload = {
        full_name: fullName.trim(),
        arabic_name: arabicName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        university: university.trim() || 'Faculty of Engineering',
        role: role.trim() || 'Member',
        status: status,
        student_code: studentCode.trim() || undefined,
        team_id: canSelectTeam ? (selectedTeamId || null) : (currentUser?.team_id || null),
      };

      const newStudent = await api.createStudent(payload);
      mutateStudents(prev => [newStudent, ...(prev || [])]);
      toast.success(`Member ${newStudent.full_name} enrolled successfully.`);
      setIsAddModalOpen(false);
      resetForm();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to enroll member. Please verify data and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    const matchSearch =
      s.full_name.toLowerCase().includes(q) ||
      s.arabic_name.includes(search) ||
      s.email.toLowerCase().includes(q) ||
      s.student_code.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const STATUS_FILTERS = ['all', 'active', 'inactive', 'probation'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[26px] leading-tight font-bold text-slate-900 tracking-tight">Member Registry</h2>
          <p className="text-sm text-slate-500 mt-1">
            {students.length} total enrolled members across committees.
          </p>
        </div>
        {canAddMember && (
          <button
            onClick={() => {
              resetForm();
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-lg text-sm font-semibold shadow-xs transition-all w-full sm:w-auto justify-center cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Member</span>
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative w-full sm:w-auto flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, email, or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-xs transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${
                statusFilter === f
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div>
            {/* Desktop Table Skeletons */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="px-5 py-3.5">Member Identity</th>
                    <th className="px-5 py-3.5">Contact Details</th>
                    <th className="px-5 py-3.5">Role & University</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                    <th className="px-5 py-3.5 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from({ length: 6 }).map((_, i) => (
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
            {/* Desktop Table View (hidden on mobile, zero overflow bugs) */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="px-5 py-3.5">Member Identity</th>
                    <th className="px-5 py-3.5">Contact Details</th>
                    <th className="px-5 py-3.5">Role & University</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                    <th className="px-5 py-3.5 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(s => (
                    <tr key={s.id} className="group hover:bg-slate-50/60 transition-colors">
                      {/* Composite Member Identity: Arabic primary + English secondary + Code */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 text-xs font-bold shrink-0">
                            {s.full_name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-sm font-['Cairo'] group-hover:text-blue-700 transition-colors">
                              {s.arabic_name}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                              <span>{s.full_name}</span>
                              <span className="font-mono text-slate-400 text-[10px]">· {s.student_code}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Stacked Contact */}
                      <td className="px-5 py-3.5">
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-1.5 text-[12px] text-slate-700">
                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[200px]">{s.email}</span>
                          </div>
                          {s.phone && (
                            <div className="flex items-center space-x-1.5 text-[11px] text-slate-500">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="font-mono">{s.phone}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Stacked Role & University */}
                      <td className="px-5 py-3.5">
                        <div className="space-y-1">
                          <span className="inline-block text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 capitalize">
                            {s.role.replace('_', ' ')}
                          </span>
                          <div className="flex items-center space-x-1.5 text-[11px] text-slate-500">
                            <University className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[170px]">{s.university || '—'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5 text-center">
                        {s.status === 'active' ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
                            <UserCheck className="w-3 h-3" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold">
                            <UserX className="w-3 h-3" />
                            <span className="capitalize">{s.status}</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <button 
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
                          aria-label={`Options for ${s.full_name}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Transform (Zero horizontal scroll!) */}
            <div className="block md:hidden divide-y divide-slate-100">
              {filtered.map(s => (
                <div key={s.id} className="p-4 space-y-3 hover:bg-slate-50/50 transition-colors">
                  {/* Card Header: Avatar + Identity + Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 text-xs font-bold shrink-0">
                        {s.full_name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm font-['Cairo'] truncate">
                          {s.arabic_name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {s.full_name} <span className="font-mono text-slate-400 text-[10px]">({s.student_code})</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {s.status === 'active' ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">
                          <UserCheck className="w-2.5 h-2.5" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-semibold">
                          <UserX className="w-2.5 h-2.5" />
                          <span className="capitalize">{s.status}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Details: Role & University */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 capitalize">
                      {s.role.replace('_', ' ')}
                    </span>
                    {s.university && (
                      <span className="text-[11px] text-slate-500 flex items-center space-x-1 truncate">
                        <University className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{s.university}</span>
                      </span>
                    )}
                  </div>

                  {/* Card Footer: Contacts & Action */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-600">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center space-x-1.5 text-[11px] truncate">
                        <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{s.email}</span>
                      </div>
                      {s.phone && (
                        <div className="flex items-center space-x-1.5 text-[11px] font-mono text-slate-500">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{s.phone}</span>
                        </div>
                      )}
                    </div>

                    <button 
                      className="p-2 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
                      aria-label={`Options for ${s.full_name}`}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="py-16 text-center space-y-2">
                <p className="text-slate-500 text-sm">No members match your search.</p>
                <button
                  onClick={() => { setSearch(''); setStatusFilter('all'); }}
                  className="text-blue-600 text-xs hover:underline font-medium"
                >
                  Clear filters
                </button>
              </div>
            )}

            {/* Table Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
              <span>Showing {filtered.length} of {students.length} members</span>
              {statusFilter !== 'all' && (
                <span className="text-slate-400 capitalize">Filtered by: {statusFilter}</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal: Enroll New Member */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setFormError(null);
        }}
        title="Enroll New Member"
        description="Register an active member into the organization and committee roster."
        size="lg"
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="leading-relaxed">{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name (Latin) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name (English / Latin) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Mostafa Mahmoud"
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-colors"
                required
              />
            </div>

            {/* Arabic Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Arabic Name (الاسم بالعربية) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                dir="rtl"
                value={arabicName}
                onChange={(e) => setArabicName(e.target.value)}
                placeholder="مثال: مصطفى محمود"
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-900 font-['Cairo'] focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-colors"
                required
              />
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. mostafa@studentops.org"
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-colors"
                required
              />
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                WhatsApp Phone <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +20 100 123 4567"
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-colors"
                required
              />
            </div>

            {/* University / Faculty */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                University / Institution
              </label>
              <input
                type="text"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
                placeholder="Faculty of Engineering"
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-colors"
              />
            </div>

            {/* Committee / Team */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Committee / Team
              </label>
              {canSelectTeam ? (
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-colors"
                >
                  <option value="">General / Unassigned</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full text-xs border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-slate-600 font-medium truncate">
                  {currentUser?.team_name || 'Assigned Committee'}
                </div>
              )}
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Role in Committee
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-colors"
              >
                <option value="Member">Member</option>
                <option value="Head">Head</option>
                <option value="Vice Head">Vice Head</option>
                <option value="Lead">Lead</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Enrollment Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-colors"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="PROBATION">Probation</option>
              </select>
            </div>

            {/* Student Code (Optional) */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Student Code <span className="text-slate-400 font-normal">(Optional — auto-generated if left blank)</span>
              </label>
              <input
                type="text"
                value={studentCode}
                onChange={(e) => setStudentCode(e.target.value)}
                placeholder="e.g. CORE-2026-007 (leave blank for automatic assignment)"
                className="w-full text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition-colors"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={() => {
                setIsAddModalOpen(false);
                setFormError(null);
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 transition-all cursor-pointer"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submitting ? 'Enrolling…' : 'Enroll Member'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
export default StudentsPage;
