import React, { useState } from 'react';
import { Bell, Send, Clock, CheckCircle2, AlertCircle, MessageSquare, Plus, Users, Video, Calendar } from 'lucide-react';

type ReminderChannel = 'whatsapp' | 'in_app';
type ReminderStatus  = 'scheduled' | 'sent' | 'failed';

interface Reminder {
  id: string;
  title: string;
  message: string;
  channel: ReminderChannel;
  targetAudience: string;
  scheduledAt: string;
  status: ReminderStatus;
  recipientCount: number;
}

// Mock demo reminders — static data, no real API needed
const DEMO_REMINDERS: Reminder[] = [
  {
    id: '1',
    title: 'Meeting Tomorrow Reminder',
    message: 'تذكير: اجتماع غداً الساعة 8 مساءً على Google Meet. حضورك إلزامي.',
    channel: 'whatsapp',
    targetAudience: 'All Members',
    scheduledAt: '2026-08-27T20:00:00Z',
    status: 'scheduled',
    recipientCount: 3,
  },
  {
    id: '2',
    title: 'Task 5 Submission Deadline',
    message: 'Last chance — Task 5 deadline is in 24 hours. Submit your work before midnight.',
    channel: 'whatsapp',
    targetAudience: 'Pending Submitters',
    scheduledAt: '2026-08-25T22:00:00Z',
    status: 'sent',
    recipientCount: 2,
  },
  {
    id: '3',
    title: 'Attendance Warning',
    message: 'Your attendance rate has dropped below 60%. Please contact the HR team.',
    channel: 'in_app',
    targetAudience: 'Low Attendance Members',
    scheduledAt: '2026-08-24T10:00:00Z',
    status: 'sent',
    recipientCount: 1,
  },
  {
    id: '4',
    title: 'Score Review Notification',
    message: 'Your evaluation scores have been updated. Check your scoreboard for the latest results.',
    channel: 'in_app',
    targetAudience: 'All Members',
    scheduledAt: '2026-08-20T09:00:00Z',
    status: 'failed',
    recipientCount: 3,
  },
];

const QUICK_TEMPLATES = [
  {
    icon: Video,
    label: 'Meeting Reminder',
    message: 'تذكير: اجتماع قادم على Google Meet. حضورك إلزامي.',
    audience: 'All Members',
  },
  {
    icon: Clock,
    label: 'Task Deadline',
    message: 'Reminder: your task submission deadline is approaching. Please submit before midnight.',
    audience: 'Pending Submitters',
  },
  {
    icon: Users,
    label: 'Low Attendance Alert',
    message: 'Your attendance rate is below the required threshold. Please reach out to the HR team.',
    audience: 'Low Attendance Members',
  },
  {
    icon: Calendar,
    label: 'Event Announcement',
    message: 'New event has been added to your calendar. Check the schedule for details.',
    audience: 'All Members',
  },
];

const statusStyle: Record<ReminderStatus, string> = {
  scheduled: 'bg-amber-50  border-amber-200  text-amber-700',
  sent:      'bg-emerald-50 border-emerald-200 text-emerald-700',
  failed:    'bg-rose-50   border-rose-200   text-rose-700',
};

const statusIcon = (s: ReminderStatus) => {
  if (s === 'sent')      return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (s === 'scheduled') return <Clock className="w-3.5 h-3.5" />;
  return <AlertCircle className="w-3.5 h-3.5" />;
};

export const NotificationsPage: React.FC = () => {
  const [reminders, setReminders] = useState<Reminder[]>(DEMO_REMINDERS);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ title: '', message: '', audience: 'All Members', channel: 'whatsapp' as ReminderChannel });
  const [sending, setSending] = useState(false);

  const handleSend = () => {
    if (!draft.title.trim() || !draft.message.trim()) return;
    setSending(true);
    setTimeout(() => {
      setReminders(prev => [{
        id: String(Date.now()),
        title: draft.title,
        message: draft.message,
        channel: draft.channel,
        targetAudience: draft.audience,
        scheduledAt: new Date().toISOString(),
        status: 'sent',
        recipientCount: 3,
      }, ...prev]);
      setDraft({ title: '', message: '', audience: 'All Members', channel: 'whatsapp' });
      setComposing(false);
      setSending(false);
    }, 900);
  };

  const applyTemplate = (tpl: typeof QUICK_TEMPLATES[0]) => {
    setDraft(d => ({ ...d, message: tpl.message, audience: tpl.audience, title: tpl.label }));
    setComposing(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Reminders & Notifications</h2>
          <p className="text-sm text-slate-500 mt-1">Dispatch WhatsApp and in-app messages to members.</p>
        </div>
        <button
          onClick={() => setComposing(c => !c)}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white rounded-lg text-sm font-semibold shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>New Reminder</span>
        </button>
      </div>

      {/* Compose Panel */}
      {composing && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Compose Reminder</h3>
            <span className="text-xs text-slate-400">Human-authorized dispatch only</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Title</label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  placeholder="e.g. Meeting Reminder"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Channel</label>
                  <select
                    value={draft.channel}
                    onChange={e => setDraft(d => ({ ...d, channel: e.target.value as ReminderChannel }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 transition-all"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="in_app">In-App</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Audience</label>
                  <select
                    value={draft.audience}
                    onChange={e => setDraft(d => ({ ...d, audience: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 transition-all"
                  >
                    <option>All Members</option>
                    <option>Pending Submitters</option>
                    <option>Low Attendance Members</option>
                    <option>Team Leads</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Message</label>
              <textarea
                value={draft.message}
                onChange={e => setDraft(d => ({ ...d, message: e.target.value }))}
                placeholder="Write your message here…"
                rows={3}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all resize-none"
              />
              <p className="text-[11px] text-slate-400">{draft.message.length} characters</p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => setComposing(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!draft.title || !draft.message || sending}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-lg text-sm font-semibold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Templates */}
      {!composing && (
        <div>
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Quick Templates</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {QUICK_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                onClick={() => applyTemplate(tpl)}
                className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-blue-400 hover:shadow-sm text-left group transition-all"
              >
                <tpl.icon className="w-4 h-4 text-slate-400 group-hover:text-blue-600 mb-2 transition-colors" />
                <div className="text-xs font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{tpl.label}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{tpl.audience}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reminders Log */}
      <div>
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Sent & Scheduled</h3>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden divide-y divide-slate-100">
          {reminders.map(r => (
            <div key={r.id} className="p-4 flex items-start justify-between gap-4 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-start space-x-3">
                <div className={`mt-0.5 p-1.5 rounded-md ${
                  r.channel === 'whatsapp' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                }`}>
                  {r.channel === 'whatsapp' ? <MessageSquare className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                </div>
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-slate-900">{r.title}</div>
                  <div className="text-[12px] text-slate-500 max-w-md">{r.message}</div>
                  <div className="flex items-center space-x-3 text-[11px] text-slate-400 font-mono pt-0.5">
                    <span>{new Date(r.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    <span>·</span>
                    <span>{r.recipientCount} recipients</span>
                    <span>·</span>
                    <span className="capitalize">{r.targetAudience}</span>
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${statusStyle[r.status]}`}>
                  {statusIcon(r.status)}
                  <span className="capitalize">{r.status}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
