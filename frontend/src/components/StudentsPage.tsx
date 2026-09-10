import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Student } from '../types';
import { 
  Search, Plus, MoreHorizontal, 
  UserCheck, UserX, Mail, Phone, University
} from 'lucide-react';

export const StudentsPage: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    async function load() {
      try { 
        const data = await api.getStudents();
        setStudents(data); 
      } catch (err) { 
        console.error('Failed to load students', err); 
      } finally { 
        setLoading(false); 
      }
    }
    load();
  }, []);

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
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Member Registry</h2>
          <p className="text-sm text-slate-500 mt-1">
            {students.length} total enrolled members across committees.
          </p>
        </div>
        <button className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white rounded-lg text-sm font-semibold shadow-xs transition-all w-full sm:w-auto justify-center">
          <Plus className="w-4 h-4" />
          <span>Add Member</span>
        </button>
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
          <div className="p-16 text-center text-slate-400 text-sm">Loading member registry…</div>
        ) : (
          <>
            {/* Desktop Table View (hidden on mobile, zero overflow bugs) */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
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
    </div>
  );
};
export default StudentsPage;
