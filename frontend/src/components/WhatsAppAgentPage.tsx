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
  QrCode,
  Edit3,
  Save,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { UserProfile, OfficialWhatsAppStatus, EscalationRecord, Student, TaskItem } from '../types';
import { WhatsAppChatWindow } from './WhatsAppChatWindow';

interface WhatsAppAgentPageProps {
  currentUser: UserProfile;
}

export const WhatsAppAgentPage: React.FC<WhatsAppAgentPageProps> = ({ currentUser }) => {
  const isRegionHead = currentUser.role === 'region_hr_head' || currentUser.role === 'hr_admin';
  const isHrLeader = currentUser.role === 'committee_hr_leader';
  const isCommitteeHead = currentUser.role === 'committee_head' || currentUser.role === 'team_lead';

  // Sub-view Tab State
  const [activeView, setActiveView] = useState<'chat' | 'escalations' | 'official'>('chat');

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

  // QR pairing state (Region Head)
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrPayload, setQrPayload] = useState<{ qr?: string; message?: string } | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  // Student phone edit state
  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhoneInput, setNewPhoneInput] = useState('');
  const [phoneSaveStatus, setPhoneSaveStatus] = useState<string | null>(null);

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

  const handleFetchQr = async () => {
    setShowQrModal(true);
    setLoadingQr(true);
    try {
      const res = await api.getWhatsAppQr();
      setQrPayload(res);
    } catch (err: any) {
      setQrPayload({ message: err.message || 'Unable to fetch pairing QR code' });
    } finally {
      setLoadingQr(false);
    }
  };

  const handleSavePhone = async () => {
    if (!selectedStudentId || !newPhoneInput.trim()) return;
    try {
      setPhoneSaveStatus('Saving...');
      const updated = await api.updateStudentPhone(selectedStudentId, newPhoneInput.trim());
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? { ...s, phone: updated.phone } : s)));
      setPhoneSaveStatus('Saved!');
      setEditingPhone(false);
      setTimeout(() => setPhoneSaveStatus(null), 2500);
    } catch (err: any) {
      setPhoneSaveStatus(`Failed: ${err.message}`);
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
            <h1 className="text-[26px] leading-tight font-bold text-slate-900 tracking-tight">
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

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        <button
          type="button"
          onClick={() => setActiveView('chat')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            activeView === 'chat'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat Window
        </button>

        <button
          type="button"
          onClick={() => setActiveView('escalations')}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            activeView === 'escalations'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          SLA Escalations
          {escalations.filter((e) => e.is_escalated).length > 0 && (
            <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-full">
              {escalations.filter((e) => e.is_escalated).length}
            </span>
          )}
        </button>

        {(isRegionHead || isHrLeader) && (
          <button
            type="button"
            onClick={() => setActiveView('official')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeView === 'official'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Official SIM & Daemon
          </button>
        )}
      </div>

      {/* Primary View: WhatsApp Chat Window */}
      {activeView === 'chat' && (
        <WhatsAppChatWindow currentUser={currentUser} />
      )}

      {/* Track 1: Official Organization Daemon (Region HR Head / Leader view) */}
      {activeView === 'official' && isRegionHead && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-slate-900">Official Organization Channel (ops_official)</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleFetchQr}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition-colors"
              >
                <QrCode className="w-3.5 h-3.5" />
                Pair Official SIM (Scan QR)
              </button>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
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

      {/* Track 2: Zero-Trust Client-Side wa.me Link Generator (Requirement 5: Hidden from UI while code is preserved) */}
      {false && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
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
              {(() => {
                const selectedStudent = students.find((s) => s.id === selectedStudentId);
                if (!selectedStudent) return null;
                return (
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                    {editingPhone ? (
                      <div className="flex items-center gap-1.5 w-full">
                        <input
                          type="text"
                          value={newPhoneInput}
                          onChange={(e) => setNewPhoneInput(e.target.value)}
                          placeholder="+2010XXXXXXXX"
                          className="text-[11px] px-1.5 py-0.5 border border-slate-300 rounded flex-1 focus:outline-none focus:ring-1 focus:ring-slate-900 font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleSavePhone}
                          className="text-emerald-700 hover:text-emerald-800 font-semibold px-1"
                          title="Save Phone"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPhone(false)}
                          className="text-slate-400 hover:text-slate-600 px-1"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="font-mono">{selectedStudent?.phone || 'No phone set'}</span>
                        {(isRegionHead || isHrLeader) && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setNewPhoneInput(selectedStudent?.phone || '');
                                setEditingPhone(true);
                              }}
                              className="inline-flex items-center gap-0.5 text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                              <Edit3 className="w-2.5 h-2.5" />
                              Edit Phone
                            </button>
                            {phoneSaveStatus && (
                              <span className="text-[10px] text-emerald-600 ml-1">{phoneSaveStatus}</span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Template Preset</label>
              <select
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="MEETING_REMINDER">Meeting Approaching Reminder (Social Media)</option>
                <option value="TASK_DEADLINE_REMINDER">Task Deadline Approaching Reminder</option>
                <option value="OVERDUE_TASK">Overdue Task Escalation (Bilingual)</option>
                <option value="ATTENDANCE_WARNING">Attendance & Absence Follow-up</option>
                <option value="GENERAL">General Operational Follow-Up</option>
              </select>
            </div>

            {(templateType === 'OVERDUE_TASK' || templateType === 'TASK_DEADLINE_REMINDER') && (
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

          {generatedLink !== null && (
            <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-lg p-4 space-y-3 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900">Link Ready for Dispatch</span>
                <a
                  href={generatedLink!.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 transition-colors"
                >
                  Open in WhatsApp
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="bg-white border border-slate-200 rounded p-3 text-xs text-slate-700 whitespace-pre-line font-sans">
                {generatedLink!.text}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3-Day SLA Escalation Table */}
      {activeView === 'escalations' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
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
            <>
              {/* Desktop Table View (hidden on mobile) */}
              <div className="hidden md:block">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50/70 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Member</th>
                      <th className="py-3 px-4">Flag Reason</th>
                      <th className="py-3 px-4">Responsible HR</th>
                      <th className="py-3 px-4">SLA Status &amp; Age</th>
                      <th className="py-3 px-4 text-right">Quick Follow-Up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {escalations.map((esc) => (
                      <tr key={esc.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Composite Member Identity */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 font-['Cairo'] text-[13px]">
                              {esc.arabic_name}
                            </span>
                            <span className="text-[11px] text-slate-500">{esc.student_name}</span>
                          </div>
                        </td>

                        {/* Reason */}
                        <td className="py-3 px-4">
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
                            {esc.flagged_reason}
                          </span>
                        </td>

                        {/* Responsible HR */}
                        <td className="py-3 px-4 text-slate-600 font-medium">{esc.hr_member_name}</td>

                        {/* Combined SLA Status & Days Open */}
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-2">
                            {esc.is_escalated ? (
                              <span className="inline-flex items-center gap-1 text-rose-700 font-semibold text-[11px] bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                                <Flame className="w-3.5 h-3.5 text-rose-600" />
                                Escalated (3d+ Breach)
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-amber-700 text-[11px] font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                Pending ({esc.days_open}d open)
                              </span>
                            )}
                            {esc.is_escalated && (
                              <span className="font-mono text-slate-500 text-[11px]">{esc.days_open}d open</span>
                            )}
                          </div>
                        </td>

                        {/* Action */}
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setActiveView('chat');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium text-[11px] shadow-2xs transition-colors"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>Open Chat</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Transform (Zero horizontal scroll!) */}
              <div className="block md:hidden divide-y divide-slate-100">
                {escalations.map((esc) => (
                  <div key={esc.id} className="p-4 space-y-3 hover:bg-slate-50/50 transition-colors">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-sm font-['Cairo'] truncate">
                          {esc.arabic_name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{esc.student_name}</div>
                      </div>

                      <div className="shrink-0">
                        {esc.is_escalated ? (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold text-[10px] bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                            <Flame className="w-3 h-3 text-rose-600" />
                            Escalated ({esc.days_open}d)
                          </span>
                        ) : (
                          <span className="text-amber-700 text-[10px] font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                            Pending ({esc.days_open}d)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metadata Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 pt-1">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[10px] text-slate-400 font-medium">Reason:</span>
                        <span className="px-1.5 py-0.2 rounded font-mono text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                          {esc.flagged_reason}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Assigned to: <span className="font-medium text-slate-700">{esc.hr_member_name}</span>
                      </div>
                    </div>

                    {/* Action */}
                    <div className="pt-2 border-t border-slate-100">
                      <button
                        onClick={() => {
                          setActiveView('chat');
                        }}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-2xs transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Open WhatsApp Chat</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Official WhatsApp SIM QR Pairing Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Pair Official Organization SIM</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-2">
              <p className="font-medium text-slate-900">How to link the official organization phone number:</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-500 pl-1">
                <li>Open WhatsApp on the official organization phone</li>
                <li>Go to <strong>Settings</strong> &gt; <strong>Linked Devices</strong></li>
                <li>Tap <strong>Link a Device</strong></li>
                <li>Scan the QR code below using your phone camera</li>
              </ol>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center min-h-[220px]">
              {loadingQr ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                  Generating secure pairing QR...
                </div>
              ) : qrPayload?.qr ? (
                qrPayload.qr.startsWith('data:image') || qrPayload.qr.startsWith('http') ? (
                  <img src={qrPayload.qr} alt="WhatsApp QR Code" className="w-52 h-52 rounded border border-slate-200" />
                ) : (
                  <pre className="font-mono text-[9px] leading-none bg-white p-2 border rounded max-w-full overflow-auto">
                    {qrPayload.qr}
                  </pre>
                )
              ) : (
                <div className="text-center space-y-2">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                  <p className="text-xs text-slate-700 font-semibold">
                    {qrPayload?.message || 'OpenWA Container Offline'}
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                    Start the OpenWA Docker daemon to display the live pairing QR code:
                    <br />
                    <code className="bg-slate-200 px-1.5 py-0.5 rounded text-slate-800 text-[10px] mt-1.5 inline-block font-mono">
                      docker compose up -d openwa
                    </code>
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleFetchQr}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh QR
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowQrModal(false);
                  loadData();
                }}
                className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
