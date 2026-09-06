import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Send,
  ExternalLink,
  Clock,
  RefreshCw,
  Phone,
  UserCheck,
  Flame,
} from 'lucide-react';
import { api } from '../api/client';
import { UserProfile, OfficialWhatsAppStatus, EscalationRecord, Student, TaskItem } from '../types';

interface WhatsAppAgentPageProps {
  currentUser: UserProfile;
}

export const WhatsAppAgentPage: React.FC<WhatsAppAgentPageProps> = ({ currentUser }) => {
  const isRegionHead = currentUser.role === 'region_hr_head' || currentUser.role === 'hr_admin';
  const isHrLeader = currentUser.role === 'committee_hr_leader';
  const isCommitteeHead = currentUser.role === 'committee_head' || currentUser.role === 'team_lead';

  // State
  const [status, setStatus] = useState<OfficialWhatsAppStatus | null>(null);
  const [escalations, setEscalations] = useState<EscalationRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Link generator modal / state
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [templateType, setTemplateType] = useState<string>('OVERDUE_TASK');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [generatedLink, setGeneratedLink] = useState<{ url: string; text: string } | null>(null);

  // Official broadcast state (Region Head)
  const [officialPhone, setOfficialPhone] = useState('');
  const [officialMsg, setOfficialMsg] = useState('');
  const [broadcastStatus, setBroadcastStatus] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setRefreshing(true);
      const [waStatus, escList, stdList, tskList] = await Promise.all([
        api.getWhatsAppStatus().catch(() => null),
        api.getSlaEscalations().catch(() => []),
        api.getStudents().catch(() => []),
        api.getTasks().catch(() => []),
      ]);
      if (waStatus) setStatus(waStatus);
      setEscalations(escList);
      setStudents(stdList);
      setTasks(tskList);
      if (stdList.length > 0 && !selectedStudentId) {
        setSelectedStudentId(stdList[0].id);
      }
      if (tskList.length > 0 && !selectedTaskId) {
        setSelectedTaskId(tskList[0].id);
      }
    } catch {
      // Handled cleanly
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerateLink = async () => {
    if (!selectedStudentId) return;
    try {
      const res = await api.generateWhatsAppLink(
        selectedStudentId,
        templateType,
        selectedTaskId || undefined
      );
      setGeneratedLink({ url: res.encoded_url, text: res.message_text });
      // Reload escalations as contact timestamp was updated
      const updatedEsc = await api.getSlaEscalations().catch(() => []);
      setEscalations(updatedEsc);
    } catch {
      // Error handled
    }
  };

  const handleSendOfficial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!officialPhone || !officialMsg) return;
    try {
      setBroadcastStatus('Sending...');
      const res = await api.sendOfficialWhatsApp({
        phone_number: officialPhone,
        message: officialMsg,
      });
      if (res.success) {
        setBroadcastStatus('Message dispatched successfully via official daemon.');
        setOfficialPhone('');
        setOfficialMsg('');
      } else {
        setBroadcastStatus(`Failed: ${res.error || 'Check container connectivity'}`);
      }
    } catch (err: any) {
      setBroadcastStatus(`Error: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading WhatsApp Operations Console…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              WhatsApp Operations & SLA Hub
            </h1>
            {isHrLeader && (
              <span className="text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
                Committee HR Leader
              </span>
            )}
            {isCommitteeHead && (
              <span className="text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                Committee Head
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Dual-track messaging: Official automated broadcasts + zero-trust client-side links for personal follow-up.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={refreshing}
          className="mt-3 sm:mt-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>

      {/* Track 1: Official Organization Daemon (Region HR Head view) */}
      {isRegionHead && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-slate-900">Official Organization Channel (ops_official)</h2>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                status?.status === 'CONNECTED'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {status?.status === 'CONNECTED' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Live ({status.phone_number || 'Official Number'})
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {status?.status || 'Docker Daemon Disconnected'}
                </>
              )}
            </span>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Headless OpenWA daemon running in isolated Docker container. Used exclusively for scheduled Stage-1 reminders
            and regional announcements. Personal coordinator numbers never touch this server.
          </p>

          <form onSubmit={handleSendOfficial} className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Target Phone (+20...)</label>
              <input
                type="text"
                placeholder="+2010XXXXXXXX"
                value={officialPhone}
                onChange={(e) => setOfficialPhone(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Official Message</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Official notification content..."
                  value={officialMsg}
                  onChange={(e) => setOfficialMsg(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800"
                >
                  <Send className="w-3.5 h-3.5" />
                  Dispatch
                </button>
              </div>
            </div>
          </form>
          {broadcastStatus && (
            <p className="text-xs font-mono text-slate-600 pt-1">{broadcastStatus}</p>
          )}
        </div>
      )}

      {/* Track 2: Zero-Trust Client-Side wa.me Link Generator */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">
              Zero-Trust 1-Click Direct Follow-Up (wa.me)
            </h2>
          </div>
          <span className="text-[11px] font-medium text-slate-400 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">
            Client-Side Only
          </span>
        </div>

        <p className="text-xs text-slate-500">
          Clicking generate creates an instant direct link that opens your native WhatsApp client. No credentials, tokens,
          or chat histories are stored on the server.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Target Member</label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.arabic_name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Template Preset</label>
            <select
              value={templateType}
              onChange={(e) => setTemplateType(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="OVERDUE_TASK">Overdue Task Reminder (Bilingual)</option>
              <option value="ATTENDANCE_WARNING">Attendance & Absence Check-in</option>
              <option value="GENERAL">General Operational Follow-Up</option>
            </select>
          </div>

          {templateType === 'OVERDUE_TASK' && (
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Select Task</label>
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    Task {t.task_number}: {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={handleGenerateLink}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 shadow-sm"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Generate WhatsApp Link
        </button>

        {generatedLink && (
          <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-lg p-4 space-y-3 mt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-900">Link Ready for Dispatch</span>
              <a
                href={generatedLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 transition-colors"
              >
                Open in WhatsApp
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <div className="bg-white border border-slate-200 rounded p-3 text-xs text-slate-700 whitespace-pre-line font-sans">
              {generatedLink.text}
            </div>
          </div>
        )}
      </div>

      {/* 3-Day SLA Escalation Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-slate-900">3-Day SLA Escalation Monitor</h2>
          </div>
          <span className="text-xs text-slate-500">
            {escalations.length} Active Flag{escalations.length === 1 ? '' : 's'}
          </span>
        </div>

        {escalations.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            <UserCheck className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
            All committee member follow-ups are on schedule. No overdue SLA breaches.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Member</th>
                  <th className="py-3 px-4">Arabic Name</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Responsible HR</th>
                  <th className="py-3 px-4">Days Open</th>
                  <th className="py-3 px-4">SLA Status</th>
                  <th className="py-3 px-4 text-right">Quick Follow-Up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {escalations.map((esc) => (
                  <tr key={esc.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-medium text-slate-900">{esc.student_name}</td>
                    <td className="py-3 px-4 font-sans text-slate-600">{esc.arabic_name}</td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700">
                        {esc.flagged_reason}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{esc.hr_member_name}</td>
                    <td className="py-3 px-4 font-mono">{esc.days_open}d</td>
                    <td className="py-3 px-4">
                      {esc.is_escalated ? (
                        <span className="inline-flex items-center gap-1 text-rose-600 font-semibold text-[11px]">
                          <Flame className="w-3.5 h-3.5" />
                          Escalated (3d+ SLA Breach)
                        </span>
                      ) : (
                        <span className="text-amber-600 text-[11px] font-medium">Pending Follow-up</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={async () => {
                          const res = await api.generateWhatsAppLink(esc.student_id, 'OVERDUE_TASK');
                          window.open(res.encoded_url, '_blank');
                          loadData();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium text-[11px]"
                      >
                        <MessageSquare className="w-3 h-3" />
                        wa.me
                      </button>
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
