import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { StudentScoreSummary } from '../types';
import { Search, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Badge } from './ui/Badge';

export const StudentScoreboard: React.FC = () => {
  const [data, setData] = useState<StudentScoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const board = await api.getScoreboard();
        setData(board);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredData = data.filter(s => 
    s.student_name.toLowerCase().includes(search.toLowerCase()) ||
    s.arabic_name.includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">8.xlsx Master Scoreboard</h2>
          <p className="text-sm text-slate-500 mt-1">Official evaluation metrics (Behavior /23, Tasks /10)</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-64 transition-all"
            />
          </div>
          <button className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center space-x-2 text-sm font-medium transition-colors">
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filter</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Syncing with 8.xlsx records...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-4 font-medium flex items-center space-x-1">
                    <span>Rank</span>
                    <ChevronDown className="w-3 h-3" />
                  </th>
                  <th className="px-6 py-4 font-medium">Member</th>
                  <th className="px-6 py-4 font-medium text-right">Attendance Count</th>
                  <th className="px-6 py-4 font-medium text-right">Task Quality (Avg/10)</th>
                  <th className="px-6 py-4 font-medium text-right">Behavior (/23)</th>
                  <th className="px-6 py-4 font-medium text-right">Final Status</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-100">
                {filteredData.map((student, idx) => (
                  <tr key={student.student_id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        {idx < 3 ? (
                          <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${
                            idx === 0 ? 'bg-amber-100 text-amber-700' :
                            idx === 1 ? 'bg-slate-200 text-slate-700' :
                            'bg-amber-50 text-amber-800'
                          }`}>
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
                        <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{student.arabic_name}</span>
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
                      <span className={student.total_behavior_score >= 20 ? 'text-emerald-600 font-bold' : 'text-slate-700'}>
                        {student.total_behavior_score}
                      </span>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
