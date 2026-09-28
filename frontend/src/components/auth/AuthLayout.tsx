import { useState, type MouseEvent, type ReactNode } from 'react';
import { Eye, EyeOff, Layers } from 'lucide-react';

/*
 * Auth form primitives.
 *
 * Shared so the sign-in and sign-up pages cannot drift apart. Every value here
 * meets touch-target and contrast requirements: 48px inputs, visible focus
 * rings, and error text that stays inside the viewport on a 320px screen.
 */

export const authInputClass =
  'min-h-12 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 ' +
  'text-base text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 ' +
  'hover:border-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

export const authButtonClass =
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 ' +
  'px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export const authLinkClass =
  'inline-flex min-h-11 items-center rounded-sm font-semibold text-blue-700 underline ' +
  'decoration-blue-700/30 underline-offset-4 hover:decoration-blue-700 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';

export const authErrorClass =
  'break-words rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800';

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
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
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
 *
 * The left column is a dark ink panel with a slow moving colour field behind
 * the text. The panel is hidden below `lg`, so a phone never pays for the
 * animation it cannot see.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="auth-panel flex min-h-0 flex-col overflow-y-auto px-6 py-6 sm:px-10 lg:h-dvh lg:min-h-0 lg:px-12 lg:py-10 xl:px-16">
        <div aria-hidden="true" className="auth-panel__bloom auth-panel__bloom--one" />
        <div aria-hidden="true" className="auth-panel__bloom auth-panel__bloom--two" />
        <div aria-hidden="true" className="auth-panel__bloom auth-panel__bloom--three" />
        <div aria-hidden="true" className="auth-panel__grid" />

        <a
          href="/"
          aria-label="StudentOps home"
          className="relative z-10 flex w-fit min-h-11 items-center gap-2.5 rounded-sm font-display text-lg font-semibold tracking-[-0.02em] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
        >
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10">
            <Layers aria-hidden="true" className="h-5 w-5 text-white" />
          </span>
          StudentOps
        </a>

        <aside aria-label="About StudentOps" className="relative z-10 my-auto hidden flex-col justify-center py-10 lg:flex">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
            Operations for student organizations
          </p>
          <h2 className="max-w-md font-display text-4xl font-medium leading-[1.12] tracking-[-0.025em] text-white xl:text-5xl">
            The people, the sessions,
            <br />
            and the work in one place.
          </h2>
          <p className="mt-6 max-w-sm text-base leading-7 text-slate-300">
            Keep your member registry, attendance records and deliverables
            accurate without chasing spreadsheets.
          </p>

          <dl className="mt-9 grid max-w-sm grid-cols-3 gap-2">
            {[
              ['Members', 'Registry and assignments'],
              ['Sessions', 'Attendance and follow-up'],
              ['Tasks', 'Reviews and feedback'],
            ].map(([term, detail]) => (
              <div key={term} className="rounded-lg border border-white/10 bg-white/[0.06] p-3">
                <dt className="text-xs font-semibold text-white">{term}</dt>
                <dd className="mt-1 text-[0.6875rem] leading-relaxed text-slate-400">{detail}</dd>
              </div>
            ))}
          </dl>
        </aside>

        <p className="relative z-10 hidden text-xs text-slate-400 lg:block">
          Access is granted by your organization administrator.
        </p>
      </div>

      <main className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-10 sm:py-14 lg:px-12">
        <div className="w-full max-w-sm sm:max-w-md">{children}</div>
      </main>
    </div>
  );
}
