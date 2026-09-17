import { useState, type MouseEvent, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export const authInputClass = 'min-h-12 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';
export const authButtonClass = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
export const authLinkClass = 'rounded-sm font-semibold text-teal-800 underline decoration-teal-800/30 underline-offset-4 hover:decoration-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-4';
export const authErrorClass = 'break-words rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-relaxed text-rose-800';

export function AuthLink({ href, onNavigate, children }: {
  href: '/signup' | '/login';
  onNavigate: () => void;
  children: ReactNode;
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate();
  };

  return <a href={href} onClick={handleClick} className={authLinkClass}>{children}</a>;
}

export function PasswordField({ id, value, onChange, autoComplete, disabled, invalid, describedBy, minLength }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  disabled: boolean;
  invalid: boolean;
  describedBy?: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id} name="password" type={visible ? 'text' : 'password'} required
        autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)}
        disabled={disabled} aria-invalid={invalid} aria-describedby={describedBy}
        minLength={minLength} className={`${authInputClass} pr-14`}
      />
      <button
        type="button" aria-label={visible ? 'Hide password' : 'Show password'}
        aria-controls={id} aria-pressed={visible} onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700"
      >
        {visible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white text-slate-900 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col border-b border-slate-200 bg-slate-50 px-6 py-6 sm:px-10 lg:min-h-dvh lg:border-b-0 lg:border-r lg:px-12 lg:py-10 xl:px-20">
        <a href="/" aria-label="StudentOps home" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-sm text-xl font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-4">
          StudentOps<span aria-hidden="true" className="text-teal-700">/</span>
        </a>
        <aside aria-label="About StudentOps" className="hidden flex-1 flex-col justify-center py-20 lg:flex">
          <p className="mb-7 text-xs font-semibold uppercase tracking-[0.18em] text-teal-800">Student organization workspace</p>
          <h2 className="max-w-md text-5xl font-medium leading-[1.12] tracking-tight xl:text-6xl">
            Less admin.<br /><span className="text-teal-800">More participation.</span>
          </h2>
          <p className="mt-7 max-w-sm text-base leading-7 text-slate-600">
            A shared place for the people, plans, and everyday work of your organization.
          </p>
          <dl className="mt-12 max-w-sm divide-y divide-slate-200 border-y border-slate-200 text-sm">
            <div className="flex items-baseline justify-between gap-6 py-4"><dt className="font-medium text-slate-900">Members</dt><dd className="text-right text-slate-600">Your community, connected</dd></div>
            <div className="flex items-baseline justify-between gap-6 py-4"><dt className="font-medium text-slate-900">Sessions</dt><dd className="text-right text-slate-600">Schedules and attendance</dd></div>
            <div className="flex items-baseline justify-between gap-6 py-4"><dt className="font-medium text-slate-900">Tasks</dt><dd className="text-right text-slate-600">Assignments and feedback</dd></div>
          </dl>
        </aside>
        <p className="hidden text-xs text-slate-500 lg:block">Built around the work you do together.</p>
      </div>
      <main className="flex min-w-0 items-center justify-center px-6 py-10 sm:px-10 sm:py-14 lg:px-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
