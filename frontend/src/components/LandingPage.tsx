import type { ReactNode } from 'react';
import { ArrowRight, Users, CalendarCheck, ClipboardCheck, ShieldCheck } from 'lucide-react';

interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
}

/*
 * Content is limited to capabilities that actually exist in the product.
 * Every entry maps to a real page: the member registry, the attendance
 * records, the evaluation scoring rules and the audit log.
 */
const FEATURES: Feature[] = [
  {
    icon: <Users aria-hidden="true" className="h-5 w-5 text-brand-700" />,
    title: 'Member registry',
    description:
      'Names in English and Arabic, committee assignments, contact details and student codes in one searchable list. Find a member without opening a spreadsheet.',
  },
  {
    icon: <CalendarCheck aria-hidden="true" className="h-5 w-5 text-brand-700" />,
    title: 'Sessions and attendance',
    description:
      'Record who attended each session and who was absent. Attendance is checked against your organization policy thresholds rather than left to interpretation.',
  },
  {
    icon: <ClipboardCheck aria-hidden="true" className="h-5 w-5 text-brand-700" />,
    title: 'Evaluations and reviews',
    description:
      'Score behaviour and task submissions against published criteria, so members can see exactly what a grade means and how it was reached.',
  },
  {
    icon: <ShieldCheck aria-hidden="true" className="h-5 w-5 text-brand-700" />,
    title: 'Access you can audit',
    description:
      'Permissions follow your organizational hierarchy, and sensitive actions require confirmation before they run. Every change is written to an audit log.',
  },
];

const WORKFLOW: { step: string; title: string; detail: string }[] = [
  { step: '01', title: 'Set up your committee', detail: 'Add members and record their committee assignments.' },
  { step: '02', title: 'Run the session', detail: 'Schedule it, then record who attended.' },
  { step: '03', title: 'Assign the work', detail: 'Create deliverables with clear deadlines and owners.' },
  { step: '04', title: 'Review and follow up', detail: 'Grade submissions and act on flagged absences.' },
];

const ROLES: { title: string; detail: string }[] = [
  { title: 'Members', detail: 'See your assignments, your attendance record, and your committee questions.' },
  { title: 'Committee leads', detail: 'Coordinate tasks, grade submissions and keep your committee organised.' },
  { title: 'HR and administrators', detail: 'Oversee participation, manage the registry and produce reports.' },
];

export function LandingPage({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <div className="bg-white text-slate-900">
      <a href="#main" className="skip-link">Skip to content</a>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <nav
          aria-label="Main"
          className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8"
        >
          <a
            href="/"
            aria-label="StudentOps home"
            className="inline-flex min-h-11 items-center gap-2 rounded-sm text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-[0.6875rem] font-bold text-white">SO</span>
            StudentOps
          </a>

          <div className="flex items-center gap-2 sm:gap-4">
            <a
              href="#capabilities"
              className="hidden min-h-11 items-center px-2 text-sm text-slate-600 hover:text-slate-900 sm:inline-flex"
            >
              Capabilities
            </a>
            <a
              href="#access"
              className="hidden min-h-11 items-center px-2 text-sm text-slate-600 hover:text-slate-900 sm:inline-flex"
            >
              Access
            </a>
            <a
              href={signedIn ? '/app/dashboard' : '/login'}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {signedIn ? 'Workspace' : 'Sign in'}
            </a>
            {!signedIn && (
              <a
                href="/signup"
                className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Create account
              </a>
            )}
          </div>
        </nav>
      </header>

      <main id="main">
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:pt-24">
          <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
            <div className="min-w-0">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">
                For student organizations
              </p>
              <h1 className="text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">
                Accurate records,<br />
                without the admin load.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                StudentOps keeps your member registry, session attendance and
                task reviews in one place, so the people running your committees
                spend their time on the work instead of on record-keeping.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href="/signup"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-900 px-6 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Create your account
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </a>
                <a
                  href="/login"
                  className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 px-6 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Sign in
                </a>
              </div>

              <p className="mt-5 text-sm text-slate-500">
                Access is granted by your organization administrator.
              </p>
            </div>

            <figure className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
              <figcaption className="border-b border-slate-200 pb-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                A committee cycle
              </figcaption>
              <ol className="mt-2 divide-y divide-slate-200">
                {WORKFLOW.map(item => (
                  <li key={item.step} className="flex gap-4 py-4">
                    <span className="mt-0.5 font-mono text-xs text-slate-400 tnum">{item.step}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </figure>
          </div>
        </section>

        <section id="capabilities" className="scroll-mt-20 border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <div className="mb-10 max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                What the workspace actually covers
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Four areas, each backed by records you can check later.
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-2">
              {FEATURES.map(feature => (
                <article key={feature.title} className="border-t border-slate-300 pt-5">
                  {feature.icon}
                  <h3 className="mt-3 text-base font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="access" className="scroll-mt-20 mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                The right view for each role
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                A member and a committee head should not see the same screen.
              </p>
            </div>

            <div>
              <dl className="divide-y divide-slate-200 border-y border-slate-200">
                {ROLES.map(role => (
                  <div key={role.title} className="py-4">
                    <dt className="text-sm font-semibold text-slate-900">{role.title}</dt>
                    <dd className="mt-1 text-sm leading-6 text-slate-600">{role.detail}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 text-sm leading-6 text-slate-500">
                Authorized staff can also use the operations assistant. Actions
                that send messages or change records require confirmation before
                they are carried out.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Start with your committee</h2>
              <p className="mt-2 text-sm text-slate-600">
                Create an account, then ask your administrator for the access you need.
              </p>
            </div>
            <a
              href="/signup"
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-slate-900 px-6 text-sm font-semibold text-white hover:bg-slate-800 md:self-auto"
            >
              Create account
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>StudentOps</p>
        <nav aria-label="Footer" className="flex gap-5">
          <a href="/login" className="inline-flex min-h-11 items-center hover:text-slate-900">Sign in</a>
          <a href="/signup" className="inline-flex min-h-11 items-center hover:text-slate-900">Create account</a>
        </nav>
      </footer>
    </div>
  );
}
