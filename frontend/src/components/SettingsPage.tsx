import { Globe, MessageSquare, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import type { Language } from '../lib/translations';
import { isChannelAdmin, type Role } from './Sidebar';

/**
 * Account settings.
 *
 * The language switch lives here rather than only in the account menu, because
 * a person who has landed on the wrong language has no way to read the menu
 * that would let them switch back.
 *
 * Channel settings is rendered only for the roles that may change the channel.
 * For everyone else it is absent rather than disabled: a greyed-out control
 * the viewer can never use is noise, and it invites the question why. The
 * backend enforces the same rule, so this is a convenience, not the guard.
 */

const LANGUAGES: { code: Language; name: string; native: string; sample: string }[] = [
  { code: 'en', name: 'English', native: 'English', sample: 'Session attendance' },
  { code: 'ar', name: 'Arabic', native: 'العربية', sample: 'حضور الجلسة' },
];

export function SettingsPage({ role, onOpenChannelSettings }: {
  role: Role;
  onOpenChannelSettings: () => void;
}) {
  const { language, setLanguage } = useLanguage();
  const canAdminister = isChannelAdmin(role);

  return (
    <div className="workspace-page mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Account
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-slate-900">
          Settings
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Preferences for this account. Changes apply immediately and are stored
          on this device.
        </p>
      </header>

      <section aria-labelledby="settings-language" className="border-b border-slate-200 py-7">
        <div className="flex items-start gap-3">
          <Globe aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <h2 id="settings-language" className="text-sm font-semibold text-slate-900">
              Language
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Arabic switches the whole interface to right-to-left and sets the
              Cairo typeface throughout.
            </p>

            <div role="radiogroup" aria-labelledby="settings-language" className="mt-4 grid gap-3 sm:grid-cols-2">
              {LANGUAGES.map(option => {
                const selected = language === option.code;
                return (
                  <button
                    key={option.code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setLanguage(option.code)}
                    className={`flex min-h-16 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                      selected
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">{option.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500" dir={option.code === 'ar' ? 'rtl' : 'ltr'}>
                        {option.sample}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        selected ? 'border-slate-900 bg-slate-900' : 'border-slate-300'
                      }`}
                    >
                      {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {canAdminister && (
        <section aria-labelledby="settings-channel" className="py-7">
          <div className="flex items-start gap-3">
            <MessageSquare aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <h2 id="settings-channel" className="text-sm font-semibold text-slate-900">
                Messaging channel
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Connection status and the official channel identity used for
                messages your organization sends to members.
              </p>
              <button
                type="button"
                onClick={onOpenChannelSettings}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              >
                <ShieldCheck aria-hidden="true" className="h-4 w-4 text-slate-400" />
                Open channel settings
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
