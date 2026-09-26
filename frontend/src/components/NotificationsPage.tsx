import React, { useState, useEffect } from 'react';
import { Bell, Send, Clock, CheckCircle2, AlertCircle, MessageSquare, Plus, Users, Video, Calendar, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { ReminderItem, UserProfile } from '../types';
import { useLanguage } from '../context/LanguageContext';

type ReminderChannel = 'whatsapp' | 'in_app';

interface NotificationsPageProps {
  currentUser?: UserProfile | null;
}

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

const statusStyle: Record<string, string> = {
  scheduled: 'bg-amber-50  border-amber-200  text-amber-700',
  sent:      'bg-green-50 border-green-200 text-green-700',
  failed:    'bg-red-50   border-red-200   text-red-800',
};

const statusIcon = (s: string) => {
  if (s === 'sent')      return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (s === 'scheduled') return <Clock className="w-3.5 h-3.5" />;
  return <AlertCircle className="w-3.5 h-3.5" />;
};

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ currentUser }) => {
  const { t } = useLanguage();
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ title: '', message: '', audience: 'All Members', channel: 'whatsapp' as ReminderChannel });
  const [sending, setSending] = useState(false);

  const isMember = currentUser?.role === 'committee_member' || currentUser?.role === 'member';

  const loadReminders = async () => {
    try {
      setLoading(true);
      const data = await api.getReminders();
      setReminders(data || []);
    } catch (err) {
      console.error('Failed to load reminders', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReminders();
  }, [currentUser]);

  const handleSend = () => {
    if (!draft.title.trim() || !draft.message.trim()) return;
    setSending(true);
    setTimeout(() => {
      const newMockItem: ReminderItem = {
        id: `rem_${Date.now()}`,
        recipient_id: currentUser?.student_id || 'all',
        recipient_name: draft.audience,
        channel: draft.channel,
        message_content: draft.message,
        status: 'sent',
        sent_at: new Date().toISOString(),
        title: draft.title,
      };
      setReminders(prev => [newMockItem, ...prev]);
      setDraft({ title: '', message: '', audience: 'All Members', channel: 'whatsapp' });
      setComposing(false);
      setSending(false);
    }, 800);
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
          <h1 className="font-display text-3xl font-medium leading-tight tracking-[-0.02em] text-ink-900">{t('remindersTitle')}</h1>
          <p className="text-sm text-ink-soft mt-1">{t('remindersSubtitle')}</p>
        </div>
        {!isMember && (
          <button
            onClick={() => setComposing(c => !c)}
            className="inline-flex items-center space-x-2 rtl:space-x-reverse px-4 py-2 bg-ink-900 hover:bg-ink-800 active:scale-[0.98] text-white rounded-lg text-sm font-semibold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{t('newReminder')}</span>
          </button>
        )}
      </div>

      {/* Compose Panel (Hidden from general members) */}
      {!isMember && composing && (
        <div className="bg-white border border-rule rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-ink-100 bg-paper-100/60 flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-900">Compose Reminder</h3>
            <span className="text-xs text-ink-faint">Human-authorized dispatch only</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-800">Title</label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  placeholder="e.g. Meeting Reminder"
                  className="w-full px-3 py-2 bg-paper-100 border border-rule rounded-lg text-sm focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-ink-800">Channel</label>
                  <select
                    value={draft.channel}
                    onChange={e => setDraft(d => ({ ...d, channel: e.target.value as ReminderChannel }))}
                    className="w-full px-3 py-2 bg-paper-100 border border-rule rounded-lg text-sm focus:outline-none focus:border-indigo-600 transition-all"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="in_app">In-App</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-ink-800">Audience</label>
                  <select
                    value={draft.audience}
                    onChange={e => setDraft(d => ({ ...d, audience: e.target.value }))}
                    className="w-full px-3 py-2 bg-paper-100 border border-rule rounded-lg text-sm focus:outline-none focus:border-indigo-600 transition-all"
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
              <label className="text-xs font-semibold text-ink-800">Message</label>
              <textarea
                value={draft.message}
                onChange={e => setDraft(d => ({ ...d, message: e.target.value }))}
                placeholder="Write your message here…"
                rows={3}
                className="w-full px-3 py-2 bg-paper-100 border border-rule rounded-lg text-sm focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all resize-none"
              />
              <p className="text-[11px] text-ink-faint">{draft.message.length} characters</p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-ink-100">
              <button
                onClick={() => setComposing(false)}
                className="px-4 py-2 text-sm text-ink-soft hover:text-ink-900 font-medium transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSend}
                disabled={!draft.title || !draft.message || sending}
                className="inline-flex items-center space-x-2 rtl:space-x-reverse px-4 py-2 bg-green-600 hover:bg-green-700 active:scale-[0.98] text-white rounded-lg text-sm font-semibold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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

      {/* Quick Templates (Management only) */}
      {!isMember && !composing && (
        <div>
          <h3 className="text-[11px] font-bold text-ink-soft uppercase tracking-wider mb-3">Quick Templates</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {QUICK_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                onClick={() => applyTemplate(tpl)}
                className="p-3.5 bg-white border border-rule rounded-lg hover:border-indigo-400 hover:shadow-sm text-left rtl:text-right group transition-all"
              >
                <tpl.icon className="w-4 h-4 text-ink-faint group-hover:text-indigo-700 mb-2 transition-colors" />
                <div className="text-xs font-bold text-ink-800 group-hover:text-indigo-700 transition-colors">{tpl.label}</div>
                <div className="text-[11px] text-ink-faint mt-0.5">{tpl.audience}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reminders Log / Member Feed */}
      <div>
        <h3 className="text-[11px] font-bold text-ink-soft uppercase tracking-wider mb-3">
          {isMember ? t('myRemindersTitle') : 'Sent & Scheduled'}
        </h3>

        {loading ? (
          <div className="bg-white border border-rule rounded-lg p-8 flex items-center justify-center space-x-2 rtl:space-x-reverse text-ink-soft text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-ink-faint" />
            <span>{t('loading')}</span>
          </div>
        ) : reminders.length === 0 ? (
          <div className="bg-white border border-rule rounded-lg p-12 text-center text-ink-soft space-y-2">
            <Bell className="w-8 h-8 text-ink-300 mx-auto" />
            <p className="font-medium text-ink-800">{t('noRemindersFound')}</p>
            <p className="text-xs text-ink-faint">
              {isMember
                ? 'You are all caught up! No active reminders or task alerts for you at this time.'
                : 'No automation logs or scheduled reminders recorded yet.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-rule rounded-lg shadow-sm overflow-hidden divide-y divide-rule">
            {reminders.map(r => {
              const channelType = (r.channel || 'whatsapp').toLowerCase();
              const statusNormalized = (r.status || 'sent').toLowerCase();
              return (
                <div key={r.id} className="p-4 flex items-start justify-between gap-4 hover:bg-paper-100/50 transition-colors">
                  <div className="flex items-start space-x-3 rtl:space-x-reverse">
                    <div className={`mt-0.5 p-1.5 rounded-md ${
                      channelType === 'whatsapp' ? 'bg-green-50 text-green-700' : 'bg-indigo-50 text-indigo-700'
                    }`}>
                      {channelType === 'whatsapp' ? <MessageSquare className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-ink-900">{r.title || 'Operational Notice'}</div>
                      <div className="text-[12px] text-ink-soft max-w-md whitespace-pre-wrap">{r.message_content}</div>
                      <div className="flex items-center space-x-3 rtl:space-x-reverse text-[11px] text-ink-faint font-mono pt-0.5">
                        <span>{r.sent_at ? new Date(r.sent_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        {r.recipient_name && (
                          <>
                            <span>·</span>
                            <span className="font-sans text-ink-soft">{r.recipient_name}</span>
                          </>
                        )}
                        {r.trigger_source && (
                          <>
                            <span>·</span>
                            <span className="capitalize">{r.trigger_source}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <span className={`inline-flex items-center space-x-1 rtl:space-x-reverse px-2 py-0.5 rounded-full border text-[11px] font-semibold ${statusStyle[statusNormalized] || 'bg-paper-100 border-rule text-ink-soft'}`}>
                      {statusIcon(statusNormalized)}
                      <span className="capitalize">{statusNormalized}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
