import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, MessageCircle, Send, TestTube2, XCircle } from 'lucide-react';
import { api, TaskReminderStatus } from '../api/client';
import { Button } from './ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { Input } from './ui/Input';

type SendState = 'idle' | 'sending' | 'sent' | 'failed';

export const WhatsAppAgentPage: React.FC = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<SendState>('idle');
  const [error, setError] = useState('');
  const [reminderStatus, setReminderStatus] = useState<TaskReminderStatus | null>(null);
  const [reminderError, setReminderError] = useState('');
  const [testMessage, setTestMessage] = useState('[StudentOps AI Agent Test] This automated task reminder was detected and sent by the scheduler.');
  const [testError, setTestError] = useState('');

  const loadReminderStatus = () => api.getTaskReminderStatus().then(setReminderStatus).catch((statusError) => {
      setReminderError(statusError instanceof Error ? statusError.message : 'Unable to load automation status.');
    });

  React.useEffect(() => {
    loadReminderStatus();
    const interval = window.setInterval(loadReminderStatus, 5000);
    return () => window.clearInterval(interval);
  }, []);

  const startAutomatedTest = async () => {
    setTestError('');
    try {
      const test = await api.startTaskReminderTest(testMessage);
      setReminderStatus((current) => current ? { ...current, test } : current);
    } catch (startError) {
      setTestError(startError instanceof Error ? startError.message : 'Unable to start automated test.');
    }
  };

  const toggleReminders = async () => {
    if (!reminderStatus) return;
    try {
      setReminderStatus(await api.setTaskReminderStatus(!reminderStatus.enabled));
      setReminderError('');
    } catch (statusError) {
      setReminderError(statusError instanceof Error ? statusError.message : 'Unable to update automation status.');
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState('sending');
    setError('');
    try {
      const result = await api.sendWhatsAppMessage({ phone_number: phoneNumber, message });
      if (!result.success) {
        throw new Error(result.error || 'The message could not be sent.');
      }
      setState('sent');
    } catch (sendError) {
      setState('failed');
      setError(sendError instanceof Error ? sendError.message : 'The message could not be sent.');
    }
  };

  const statusContent = {
    idle: { label: 'Ready to send', icon: <MessageCircle className="h-4 w-4" />, className: 'text-slate-500 bg-slate-50 border-slate-200' },
    sending: { label: 'Sending...', icon: <span className="h-4 w-4 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />, className: 'text-blue-700 bg-blue-50 border-blue-200' },
    sent: { label: 'Message sent successfully', icon: <CheckCircle2 className="h-4 w-4" />, className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    failed: { label: `Failed to send message${error ? `: ${error}` : ''}`, icon: <XCircle className="h-4 w-4" />, className: 'text-rose-700 bg-rose-50 border-rose-200' },
  }[state];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">WhatsApp Agent</h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
              <TestTube2 className="h-3 w-3" /> Test mode
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Send a WhatsApp message through the StudentOps AI Agent.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Send a test message</CardTitle>
          <CardDescription>Your click is the confirmation for this manual test dispatch.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="whatsapp-recipient" className="text-xs font-semibold text-slate-700">Recipient Phone Number</label>
              <Input
                id="whatsapp-recipient"
                type="tel"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="+XXXXXXXXXXXX"
                autoComplete="tel"
                required
              />
              <p className="text-[11px] text-slate-400">Include the country code, for example +20.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="whatsapp-message" className="text-xs font-semibold text-slate-700">Message</label>
              <textarea
                id="whatsapp-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Write your message here..."
                rows={6}
                maxLength={4096}
                required
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-right text-[11px] text-slate-400">{message.length}/4096</p>
            </div>
            <Button type="submit" variant="primary" size="lg" loading={state === 'sending'} disabled={!phoneNumber.trim() || !message.trim()}>
              {!state || state !== 'sending' ? <Send className="h-4 w-4" /> : null}
              Send WhatsApp Message
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium ${statusContent.className}`} role="status" aria-live="polite">
        {statusContent.icon}
        <span>{statusContent.label}</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Automated Reminder Test</CardTitle>
          <CardDescription>TEST MODE: only the configured test recipient can receive this scheduler-triggered message.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Test Mode</p>
              <p className="mt-1 text-xs font-bold text-amber-900">{reminderStatus?.test_mode ? 'ON' : 'OFF'}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Test Recipient</p>
              <p className="mt-1 truncate text-xs font-bold text-slate-800">{reminderStatus?.test_recipient || 'Not configured'}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Test Delay</p>
              <p className="mt-1 text-xs font-bold text-slate-800">{reminderStatus?.test_delay_minutes ?? 1} minute(s)</p>
            </div>
          </div>
          <textarea
            value={testMessage}
            onChange={(event) => setTestMessage(event.target.value)}
            rows={3}
            maxLength={4096}
            aria-label="Automated test message"
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <Button type="button" variant="secondary" onClick={startAutomatedTest} disabled={!reminderStatus?.test_mode || !reminderStatus.enabled || !testMessage.trim()}>
            <TestTube2 className="h-4 w-4" /> Start Automated Test
          </Button>
          {reminderStatus?.test && (
            <div className={`rounded-lg border px-3 py-2.5 text-xs font-medium ${reminderStatus.test.status === 'SENT' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : reminderStatus.test.status === 'FAILED' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`} role="status" aria-live="polite">
              <span>{reminderStatus.test.status === 'WAITING' ? 'Waiting for scheduler...' : reminderStatus.test.status === 'SENDING' ? 'Sending...' : reminderStatus.test.status === 'SENT' ? 'Message sent successfully' : `Failed to send: ${reminderStatus.test.error || 'Unknown error'}`}</span>
            </div>
          )}
          {testError && <p className="text-xs text-rose-600">{testError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Automated Task Reminders</CardTitle>
            <CardDescription>Stage 1 follow-ups for active members with overdue tasks.</CardDescription>
          </div>
          {reminderStatus && (
            <button
              type="button"
              onClick={toggleReminders}
              aria-pressed={reminderStatus.enabled}
              className={`relative h-6 w-11 rounded-full transition-colors ${reminderStatus.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
              title={reminderStatus.enabled ? 'Disable automated reminders' : 'Enable automated reminders'}
            >
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${reminderStatus.enabled ? 'left-6' : 'left-1'}`} />
            </button>
          )}
        </CardHeader>
        <CardContent>
          {reminderStatus ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Status', reminderStatus.enabled ? 'Enabled' : 'Disabled'],
                ['Reminder delay', `${reminderStatus.delay_hours} hours`],
                ['Check interval', `${reminderStatus.check_interval_minutes} minutes`],
                ['Last check', reminderStatus.last_check ? new Date(reminderStatus.last_check).toLocaleString() : 'Not checked'],
                ['Last reminder', reminderStatus.last_reminder ? new Date(reminderStatus.last_reminder).toLocaleString() : 'None'],
                ['Eligible', reminderStatus.eligible],
                ['Sent', reminderStatus.sent],
                ['Failed / skipped', `${reminderStatus.failed} / ${reminderStatus.skipped}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="mt-1 text-xs font-bold text-slate-800">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Loading automation status...</p>
          )}
          {reminderError && <p className="mt-3 text-xs text-rose-600">{reminderError}</p>}
        </CardContent>
      </Card>
    </div>
  );
};