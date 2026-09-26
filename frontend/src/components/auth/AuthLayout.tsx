import { useState, type MouseEvent, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/*
 * Auth form primitives.
 *
 * Shared so the sign-in and sign-up pages cannot drift apart. Every value here
 * meets touch-target and contrast requirements: 48px inputs, visible focus
 * rings, and error text that stays inside the viewport on a 320px screen.
 */

export const authInputClass =
  'min-h-12 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 ' +
  'text-base text-slate-900 shadow-xs transition-colors placeholder:text-slate-400 ' +
  'hover:border-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

export const authButtonClass =
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 ' +
  'px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export const authLinkClass =
  'inline-flex min-h-11 items-center rounded-sm font-semibold text-brand-700 underline ' +
  'decoration-brand-700/30 underline-offset-4 hover:decoration-brand-700 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2';

export const authErrorClass =
  'break-words rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800';

export const authLabelClass = 'block text-sm font-medium text-slate-700';

/** Link that keeps real `href` for middle-click/copy but routes client-side. */
export function AuthLink({ href, onNavigate, children }: {
  href: string;
  onNavigate: () => void;
  children: ReactNode;
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate();
  };

  return <a href={href} onClick={handleClick} className={authLinkClass}>{children}</a>;
}

/** Password input with a real, labelled visibility toggle. */
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
        autoComplete={autoComplete} value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled} aria-invalid={invalid} aria-describedby={describedBy}
        minLength={minLength}
        className={`${authInputClass} pr-14 ${invalid ? 'border-red-400' : ''}`}
      />
      <button
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-controls={id} aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
      >
        {visible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
      </button>
    </div>
  );
}

/**
 * Two-column auth shell: context on the left for wide screens, form on the
 * right. Below `lg` the context column collapses to a compact header so the
 * form owns the full width on tablets and phones.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white text-slate-900 lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col border-b border-slate-200 bg-slate-50 px-6 py-6 sm:px-10 lg:min-h-dvh lg:border-b-0 lg:border-r lg:px-12 lg:py-10 xl:px-16">
        <a
          href="/"
          aria-label="StudentOps home"
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-sm text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-4"
        >
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-[0.6875rem] font-bold text-white">SO</span>
          StudentOps
        </a>

        <aside aria-label="About StudentOps" className="hidden flex-1 flex-col justify-center py-16 lg:flex">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">
            Operations for student organizations
          </p>
          <h2 className="max-w-md text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl">
            The people, the sessions,<br />and the work in one place.
          </h2>
          <p className="mt-6 max-w-sm text-base leading-7 text-slate-600">
            Keep your member registry, attendance records, and deliverables
            accurate without chasing spreadsheets.
          </p>
          <dl className="mt-10 max-w-sm divide-y divide-slate-200 border-y border-slate-200 text-sm">
            {[
              ['Members', 'Registry and committee assignments'],
              ['Sessions', 'Attendance and absence follow-up'],
              ['Tasks', 'Assignments, reviews, and feedback'],
            ].map(([term, detail]) => (
              <div key={term} className="flex items-baseline justify-between gap-6 py-3.5">
                <dt className="font-medium text-slate-900">{term}</dt>
                <dd className="text-right text-slate-600">{detail}</dd>
              </div>
            ))}
          </dl>
        </aside>

        <p className="hidden text-xs text-slate-500 lg:block">
          Access is granted by your organization administrator.
        </p>
      </div>

      <main className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-10 sm:py-14 lg:px-12">
        <div className="w-full max-w-sm sm:max-w-md">{children}</div>
      </main>
    </div>
  );
}
