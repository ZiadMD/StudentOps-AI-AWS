import type { ReactNode } from 'react';
import { ArrowRight, Users, CalendarCheck, ClipboardCheck, ShieldCheck } from 'lucide-react';

interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
}

/*
 * Content is limited to capabilities that exist. Every entry maps to a real
 * page: the member registry, attendance, evaluations and the audit log. No
 * invented metrics, no trend claims, no customer counts.
 */
const FEATURES: Feature[] = [
  {
    icon: <Users aria-hidden="true" className="h-5 w-5 text-indigo-700" />,
    title: 'Member registry',
    description:
      'Names in English and Arabic, committee assignments, contact details and student codes in one searchable list.',
  },
  {
    icon: <CalendarCheck aria-hidden="true" className="h-5 w-5 text-indigo-700" />,
    title: 'Sessions and attendance',
    description:
      'Record who attended each session. Attendance is checked against your organization policy thresholds rather than left open to interpretation.',
  },
  {
    icon: <ClipboardCheck aria-hidden="true" className="h-5 w-5 text-indigo-700" />,
    title: 'Evaluations and reviews',
    description:
      'Score behaviour and task submissions against published criteria, so a member can see how a grade was reached.',
  },
  {
    icon: <ShieldCheck aria-hidden="true" className="h-5 w-5 text-indigo-700" />,
    title: 'Access you can audit',
    description:
      'Permissions follow your organizational hierarchy, sensitive actions need confirmation, and every change is written to a log.',
  },
];

const WORKFLOW: { step: string; title: string; detail: string }[] = [
  { step: '01', title: 'Set up the committee', detail: 'Add members and record their assignments.' },
  { step: '02', title: 'Run the session', detail: 'Schedule it, then record who attended.' },
  { step: '03', title: 'Assign the work', detail: 'Create deliverables with clear deadlines.' },
  { step: '04', title: 'Review and follow up', detail: 'Grade submissions and act on flagged absences.' },
];

const ROLES: { title: string; detail: string }[] = [
  { title: 'Members', detail: 'Your assignments, your attendance record, and your committee questions.' },
  { title: 'Committee leads', detail: 'Coordinate tasks, grade submissions and keep the committee organised.' },
  { title: 'HR and administrators', detail: 'Oversee participation, manage the registry and produce reports.' },
];

export function LandingPage({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <div className="min-h-dvh bg-paper text-ink-900">
      <a href="#main" className="skip-link">Skip to content</a>

      <header className="border-b border-rule">
        <nav aria-label="Main" className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <a
            href="/"
            aria-label="StudentOps home"
            className="font-display text-xl font-semibold tracking-[-0.02em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
          >
            StudentOps
          </a>
          <div className="flex items-center gap-1 sm:gap-2">
            <a href="#capabilities" className="hidden min-h-11 items-center px-3 text-sm text-ink-soft hover:text-ink-900 sm:inline-flex">
              What it covers
            </a>
            <a href="#access" className="hidden min-h-11 items-center px-3 text-sm text-ink-soft hover:text-ink-900 sm:inline-flex">
              Access
            </a>
            <a
              href={signedIn ? '/app/dashboard' : '/login'}
              className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-ink-800 hover:underline"
            >
              {signedIn ? 'Workspace' : 'Sign in'}
            </a>
            {!signedIn && (
              <a
                href="/signup"
                className="inline-flex min-h-11 items-center rounded-md bg-ink-900 px-4 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-800"
              >
                Create account
              </a>
            )}
          </div>
        </nav>
      </header>

      <main id="main">
        {/* Standfirst: a large serif headline over a narrow standfirst, with
            the workflow set as a contents list beside it. */}
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20">
          <div className="grid gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
            <div className="min-w-0">
              <p className="eyebrow mb-5">For student organizations</p>
              <h1 className="font-display text-[2.75rem] font-medium leading-[1.03] tracking-[-0.03em] sm:text-6xl">
                Accurate records,
                <br />
                less admin.
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-8 text-ink-soft">
                StudentOps keeps your member registry, session attendance and
                task reviews in one place, so the people running your committees
                spend their time on the work rather than on record-keeping.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href="/signup"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-ink-900 px-6 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-800"
                >
                  Create your account
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </a>
                <a
                  href="/login"
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-paper-400 px-6 text-sm font-medium text-ink-800 transition-colors hover:bg-paper-200"
                >
                  Sign in
                </a>
              </div>
              <p className="mt-5 text-sm text-ink-faint">
                Access is granted by your organization administrator.
              </p>
            </div>

            <figure className="min-w-0">
              <figcaption className="border-b border-ink-900/15 pb-3 text-sm font-medium text-ink-900">
                A committee cycle
              </figcaption>
              <ol className="pt-1">
                {WORKFLOW.map(item => (
                  <li key={item.step} className="flex gap-5 border-b border-rule py-4 last:border-0">
                    <span className="mt-1 font-mono text-2xs text-ink-faint tnum">{item.step}</span>
                    <div className="min-w-0">
                      <p className="font-display text-lg font-medium leading-snug text-ink-900">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-ink-soft">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </figure>
          </div>
        </section>

        <section id="capabilities" className="scroll-mt-20 border-y border-rule bg-paper-100">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <div className="mb-12 max-w-2xl">
              <p className="eyebrow mb-3">Coverage</p>
              <h2 className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">
                What the workspace covers
              </h2>
              <p className="mt-4 text-base leading-7 text-ink-soft">
                Four areas, each backed by records you can check later.
              </p>
            </div>
            <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
              {FEATURES.map(feature => (
                <article key={feature.title} className="border-t border-ink-900/15 pt-5">
                  {feature.icon}
                  <h3 className="mt-3 font-display text-xl font-medium text-ink-900">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-soft">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="access" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <p className="eyebrow mb-3">Permissions</p>
              <h2 className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">
                The right view for each role
              </h2>
              <p className="mt-4 text-base leading-7 text-ink-soft">
                A member and a committee head should not see the same screen.
              </p>
            </div>
            <div>
              <dl className="border-t border-ink-900/15">
                {ROLES.map(role => (
                  <div key={role.title} className="border-b border-rule py-5">
                    <dt className="font-display text-lg font-medium text-ink-900">{role.title}</dt>
                    <dd className="mt-1 text-sm leading-6 text-ink-soft">{role.detail}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 text-sm leading-6 text-ink-faint">
                Authorized staff can also use the operations assistant. Actions
                that send messages or change records require confirmation first.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-rule bg-ink-900">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-paper-50 sm:text-3xl">
                Start with your committee
              </h2>
              <p className="mt-2 text-sm text-paper-300">
                Create an account, then ask your administrator for the access you need.
              </p>
            </div>
            <a
              href="/signup"
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 self-start rounded-md bg-paper-50 px-6 text-sm font-medium text-ink-900 transition-colors hover:bg-white md:self-auto"
            >
              Create account
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>StudentOps</p>
        <nav aria-label="Footer" className="flex gap-5">
          <a href="/login" className="inline-flex min-h-11 items-center hover:text-ink-900">Sign in</a>
          <a href="/signup" className="inline-flex min-h-11 items-center hover:text-ink-900">Create account</a>
        </nav>
      </footer>
    </div>
  );
}
