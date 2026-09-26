import React, { useState } from 'react';
import { PageHeader } from './ui/PageHeader';
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
      <PageHeader
        eyebrow="Registry"
        title="Member registry"
        description="Every member with their committee, contact details and student code."
        meta={
          <>
            <span>{filtered.length} of {students.length} shown</span>
            {search && <span>Filtered by "{search}"</span>}
          </>
        }
      />
      <div className="-mt-4 flex justify-end">
        {canAddMember && (
          <button
            onClick={() => {
              resetForm();
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-ink-900 hover:bg-ink-800 active:scale-[0.98] text-white rounded-lg text-sm font-semibold shadow-xs transition-all w-full sm:w-auto justify-center cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Member</span>
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative w-full sm:w-auto flex-1 max-w-sm">
          <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, email, or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-rule rounded-lg text-sm focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 shadow-xs transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-rule bg-paper-200/60 p-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${
                statusFilter === f
                  ? 'bg-white text-ink-900 shadow-xs border border-rule'
                  : 'text-ink-soft hover:text-ink-800'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-hidden rounded-lg border border-rule bg-paper-50">
        {loading ? (
          <div>
            {/* Desktop Table Skeletons */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-ink-900/15 text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
                    <th className="px-5 py-3.5">Member Identity</th>
                    <th className="px-5 py-3.5">Contact Details</th>
                    <th className="px-5 py-3.5">Role & University</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                    <th className="px-5 py-3.5 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
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
                  <tr className="border-b border-ink-900/15 text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
                    <th className="px-5 py-3.5">Member Identity</th>
                    <th className="px-5 py-3.5">Contact Details</th>
                    <th className="px-5 py-3.5">Role & University</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                    <th className="px-5 py-3.5 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {filtered.map(s => (
                    <tr key={s.id} className="group hover:bg-paper-100/60 transition-colors">
                      {/* Composite Member Identity: Arabic primary + English secondary + Code */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-paper-200 border border-rule flex items-center justify-center text-ink-800 text-xs font-bold shrink-0">
                            {s.full_name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-ink-900 text-sm font-['Cairo'] group-hover:text-indigo-700 transition-colors">
                              {s.arabic_name}
                            </div>
                            <div className="text-[11px] text-ink-soft flex items-center gap-1.5">
                              <span>{s.full_name}</span>
                              <span className="font-mono text-ink-faint text-[10px]">· {s.student_code}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Stacked Contact */}
                      <td className="px-5 py-3.5">
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-1.5 text-[12px] text-ink-800">
                            <Mail className="w-3 h-3 text-ink-faint shrink-0" />
                            <span className="truncate max-w-[200px]">{s.email}</span>
                          </div>
                          {s.phone && (
                            <div className="flex items-center space-x-1.5 text-[11px] text-ink-soft">
                              <Phone className="w-3 h-3 text-ink-faint shrink-0" />
                              <span className="font-mono">{s.phone}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Stacked Role & University */}
                      <td className="px-5 py-3.5">
                        <div className="space-y-1">
                          <span className="inline-block text-[11px] font-semibold text-ink-800 bg-paper-200 px-2 py-0.5 rounded border border-rule capitalize">
                            {s.role.replace('_', ' ')}
                          </span>
                          <div className="flex items-center space-x-1.5 text-[11px] text-ink-soft">
                            <University className="w-3 h-3 text-ink-faint shrink-0" />
                            <span className="truncate max-w-[170px]">{s.university || '—'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5 text-center">
                        {s.status === 'active' ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-[11px] font-semibold">
                            <UserCheck className="w-3 h-3" />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-800 text-[11px] font-semibold">
                            <UserX className="w-3 h-3" />
                            <span className="capitalize">{s.status}</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <button 
                          className="p-1.5 text-ink-faint hover:text-ink-800 rounded-md hover:bg-paper-200 transition-colors"
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
            <div className="block md:hidden divide-y divide-rule">
              {filtered.map(s => (
                <div key={s.id} className="p-4 space-y-3 hover:bg-paper-100/50 transition-colors">
                  {/* Card Header: Avatar + Identity + Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-paper-200 border border-rule flex items-center justify-center text-ink-800 text-xs font-bold shrink-0">
                        {s.full_name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-ink-900 text-sm font-['Cairo'] truncate">
                          {s.arabic_name}
                        </div>
                        <div className="text-[11px] text-ink-soft truncate">
                          {s.full_name} <span className="font-mono text-ink-faint text-[10px]">({s.student_code})</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {s.status === 'active' ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-[10px] font-semibold">
                          <UserCheck className="w-2.5 h-2.5" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-800 text-[10px] font-semibold">
                          <UserX className="w-2.5 h-2.5" />
                          <span className="capitalize">{s.status}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Details: Role & University */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-[11px] font-semibold text-ink-800 bg-paper-200 px-2 py-0.5 rounded border border-rule capitalize">
                      {s.role.replace('_', ' ')}
                    </span>
                    {s.university && (
                      <span className="text-[11px] text-ink-soft flex items-center space-x-1 truncate">
                        <University className="w-3 h-3 text-ink-faint shrink-0" />
                        <span>{s.university}</span>
                      </span>
                    )}
                  </div>

                  {/* Card Footer: Contacts & Action */}
                  <div className="pt-2 border-t border-ink-100 flex items-center justify-between gap-2 text-xs text-ink-soft">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center space-x-1.5 text-[11px] truncate">
                        <Mail className="w-3 h-3 text-ink-faint shrink-0" />
                        <span className="truncate">{s.email}</span>
                      </div>
                      {s.phone && (
                        <div className="flex items-center space-x-1.5 text-[11px] font-mono text-ink-soft">
                          <Phone className="w-3 h-3 text-ink-faint shrink-0" />
                          <span>{s.phone}</span>
                        </div>
                      )}
                    </div>

                    <button 
                      className="p-2 text-ink-faint hover:text-ink-800 rounded-lg hover:bg-paper-200 transition-colors shrink-0"
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
                <p className="text-ink-soft text-sm">No members match your search.</p>
                <button
                  onClick={() => { setSearch(''); setStatusFilter('all'); }}
                  className="inline-flex min-h-11 items-center rounded-lg border border-paper-400 bg-white px-4 text-sm font-medium text-ink-800 transition-colors hover:bg-paper-100"
                >
                  Clear filters
                </button>
              </div>
            )}

            {/* Table Footer */}
            <div className="px-5 py-3 border-t border-ink-100 bg-paper-100/50 flex items-center justify-between text-xs text-ink-soft">
              <span>Showing {filtered.length} of {students.length} members</span>
              {statusFilter !== 'all' && (
                <span className="text-ink-faint capitalize">Filtered by: {statusFilter}</span>
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
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
              <span className="leading-relaxed">{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name (Latin) */}
            <div>
              <label className="block text-xs font-semibold text-ink-800 mb-1">
                Full Name (English / Latin) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Mostafa Mahmoud"
                className="w-full text-xs border border-rule rounded-lg px-3 py-2 bg-white text-ink-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
                required
              />
            </div>

            {/* Arabic Name */}
            <div>
              <label className="block text-xs font-semibold text-ink-800 mb-1">
                Arabic Name (الاسم بالعربية) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                dir="rtl"
                value={arabicName}
                onChange={(e) => setArabicName(e.target.value)}
                placeholder="مثال: مصطفى محمود"
                className="w-full text-xs border border-rule rounded-lg px-3 py-2 bg-white text-ink-900 font-['Cairo'] focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
                required
              />
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs font-semibold text-ink-800 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. mostafa@studentops.org"
                className="w-full text-xs border border-rule rounded-lg px-3 py-2 bg-white text-ink-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
                required
              />
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs font-semibold text-ink-800 mb-1">
                WhatsApp Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +20 100 123 4567"
                className="w-full text-xs border border-rule rounded-lg px-3 py-2 bg-white text-ink-900 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
                required
              />
            </div>

            {/* University / Faculty */}
            <div>
              <label className="block text-xs font-semibold text-ink-800 mb-1">
                University / Institution
              </label>
              <input
                type="text"
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
                placeholder="Faculty of Engineering"
                className="w-full text-xs border border-rule rounded-lg px-3 py-2 bg-white text-ink-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
              />
            </div>

            {/* Committee / Team */}
            <div>
              <label className="block text-xs font-semibold text-ink-800 mb-1">
                Committee / Team
              </label>
              {canSelectTeam ? (
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full text-xs border border-rule rounded-lg px-3 py-2 bg-white text-ink-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
                >
                  <option value="">General / Unassigned</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full text-xs border border-rule bg-paper-100 rounded-lg px-3 py-2 text-ink-soft font-medium truncate">
                  {currentUser?.team_name || 'Assigned Committee'}
                </div>
              )}
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-semibold text-ink-800 mb-1">
                Role in Committee
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full text-xs border border-rule rounded-lg px-3 py-2 bg-white text-ink-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
              >
                <option value="Member">Member</option>
                <option value="Head">Head</option>
                <option value="Vice Head">Vice Head</option>
                <option value="Lead">Lead</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-ink-800 mb-1">
                Enrollment Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full text-xs border border-rule rounded-lg px-3 py-2 bg-white text-ink-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="PROBATION">Probation</option>
              </select>
            </div>

            {/* Student Code (Optional) */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-ink-800 mb-1">
                Student Code <span className="text-ink-faint font-normal">(Optional — auto-generated if left blank)</span>
              </label>
              <input
                type="text"
                value={studentCode}
                onChange={(e) => setStudentCode(e.target.value)}
                placeholder="e.g. CORE-2026-007 (leave blank for automatic assignment)"
                className="w-full text-xs font-mono border border-rule rounded-lg px-3 py-2 bg-white text-ink-900 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-colors"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-ink-100 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={() => {
                setIsAddModalOpen(false);
                setFormError(null);
              }}
              className="px-4 py-2 text-xs font-semibold text-ink-soft hover:text-ink-900 hover:bg-paper-200 rounded-lg transition-colors border border-rule cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-ink-900 hover:bg-ink-800 active:scale-[0.98] text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 transition-all cursor-pointer"
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
