import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Student } from '../types';
import { 
  Search, Plus, MoreHorizontal, 
  UserCheck, UserX, Mail, Phone, University, Filter
} from 'lucide-react';

export const StudentsPage: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    async function load() {
      try { setStudents(await api.getStudents()); }
      catch (err) { console.error(err); }
      finally { setLoading(false); }
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
            {students.length} total members
          </p>
        </div>
        <button className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white rounded-lg text-sm font-semibold shadow-sm transition-all">
          <Plus className="w-4 h-4" />
          <span>Add Member</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, email, or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-xs transition-all"
          />
        </div>

        <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
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

        <button className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 shadow-xs transition-colors">
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400 text-sm">Loading member registry…</div>
        ) : (
          <>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Member</th>
                  <th className="px-5 py-3.5">Contact</th>
                  <th className="px-5 py-3.5">University</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(s => (
                  <tr key={s.id} className="group hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center space-x-3">
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {s.full_name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 text-sm group-hover:text-blue-700 transition-colors">
                            {s.arabic_name}
                          </div>
                          <div className="text-[11px] text-slate-500">{s.full_name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-1.5 text-[12px] text-slate-600">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{s.email}</span>
                        </div>
                        {s.phone && (
                          <div className="flex items-center space-x-1.5 text-[12px] text-slate-500">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span className="font-mono">{s.phone}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center space-x-1.5 text-[12px] text-slate-600">
                        <University className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[160px]">{s.university || '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 capitalize">
                        {s.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {s.status === 'active' ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
                          <UserCheck className="w-3 h-3" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold">
                          <UserX className="w-3 h-3" />
                          <span className="capitalize">{s.status}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="py-16 text-center space-y-2">
                <p className="text-slate-500 text-sm">No members match your search.</p>
                <button
                  onClick={() => { setSearch(''); setStatusFilter('all'); }}
                  className="text-blue-600 text-xs hover:underline"
                >
                  Clear filters
                </button>
              </div>
            )}

            {/* Table Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
              <span>Showing {filtered.length} of {students.length} members</span>
              <span className="font-mono text-slate-400">Registry v1.0</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
