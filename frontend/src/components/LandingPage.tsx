import { ArrowRight, ArrowUpRight, Check, Layers } from 'lucide-react';

const features = [
  { number: '01', title: 'Know your people.', description: 'Keep member profiles, committee assignments, and contact details together. Find the right person without searching another spreadsheet.', detail: 'Member registry / Committee assignments' },
  { number: '02', title: 'Make participation visible.', description: 'Organize sessions, review attendance, and follow up on absences. Give your committee a clear record of who took part.', detail: 'Session rosters / Attendance records' },
  { number: '03', title: 'Keep the work moving.', description: 'Assign deliverables, review submissions, and give useful feedback. Keep expectations and deadlines in the same place as the work.', detail: 'Tasks / Reviews / Shared calendar' },
];

export function LandingPage({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <div className="bg-white text-slate-900">
      <a href="#content" className="skip-link">Skip to content</a>
      <header className="border-b border-slate-200">
        <nav aria-label="Main navigation" className="mx-auto flex min-h-20 max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8 lg:px-12">
          <a href="/" aria-label="StudentOps home" className="text-xl font-semibold tracking-tight">StudentOps<span className="text-teal-700">/</span></a>
          <div className="flex items-center gap-3 sm:gap-7 text-sm font-medium">
            <a href="#how-it-works" className="hidden py-3 text-slate-600 hover:text-slate-900 sm:block">How it works</a>
            <a href={signedIn ? '/app/dashboard' : '/login'} className="py-3 hover:text-teal-800">{signedIn ? 'Workspace' : 'Sign in'}</a>
            <a href="/signup" className="rounded-lg bg-slate-900 px-4 py-3 text-white hover:bg-slate-800">Join your team</a>
          </div>
        </nav>
      </header>
      <main id="content">
        <section className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-16 lg:px-12 lg:py-28">
          <div>
            <p className="mb-6 text-xs font-semibold uppercase tracking-[0.18em] text-teal-800">For student organizations</p>
            <h1 className="max-w-2xl text-[clamp(2.75rem,5.5vw,5.5rem)] font-medium leading-[1.06] tracking-[-0.055em]">Good teams.<br />Less busywork.</h1>
            <p className="mt-7 max-w-lg text-lg leading-8 text-slate-600">Bring your members, sessions, and tasks into one shared workspace. Spend less time keeping track and more time doing things together.</p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a href="/signup" className="inline-flex min-h-12 items-center gap-3 rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">Create your account <ArrowRight aria-hidden="true" className="h-4 w-4" /></a>
              <a href="#how-it-works" className="inline-flex min-h-12 items-center gap-2 px-2 text-sm font-medium text-slate-600 hover:text-slate-900">Explore the workspace <ArrowUpRight aria-hidden="true" className="h-4 w-4" /></a>
            </div>
            <p className="mt-5 text-xs text-slate-500">Already part of an organization? <a className="underline underline-offset-4" href="/login">Sign in here.</a></p>
          </div>
          <figure className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-7">
            <div className="flex items-center justify-between border-b border-slate-200 pb-5">
              <span className="flex items-center gap-2 text-sm font-semibold"><Layers aria-hidden="true" className="h-4 w-4 text-teal-800" /> A shared workspace</span>
              <span className="text-xs text-slate-500">Workflow example</span>
            </div>
            <ol className="mt-4 divide-y divide-slate-200">
              {[
                ['Plan the session', 'Set a date and share the details.'],
                ['Bring everyone together', 'Record attendance and follow up.'],
                ['Turn plans into tasks', 'Assign work with a clear deadline.'],
                ['Make room for feedback', 'Review submissions and support members.'],
              ].map(([title, detail], index) => (
                <li key={title} className="flex gap-4 py-5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs tabular-nums text-slate-500">{index + 1}</span>
                  <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p></div>
                </li>
              ))}
            </ol>
            <figcaption className="border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">From the first session to the final handoff, keep the context with the work.</figcaption>
          </figure>
        </section>
        <section id="how-it-works" className="scroll-mt-8 border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
            <div className="mb-12 grid gap-5 lg:grid-cols-2">
              <h2 className="max-w-md text-3xl font-medium tracking-tight sm:text-4xl">The everyday work.<br />All in one place.</h2>
              <p className="max-w-lg self-end text-base leading-7 text-slate-600">Built around the way committees work, with shared records for leaders and a focused space for members.</p>
            </div>
            <div className="grid gap-8 md:grid-cols-3 md:gap-10">
              {features.map(feature => <article key={feature.number} className="border-t border-slate-300 pt-6">
                <p className="mb-6 font-mono text-xs text-teal-800">{feature.number}</p>
                <h3 className="text-xl font-semibold">{feature.title}</h3>
                <p className="mt-4 text-sm leading-7 text-slate-600">{feature.description}</p>
                <p className="mt-6 text-xs font-medium text-slate-500">{feature.detail}</p>
              </article>)}
            </div>
          </div>
        </section>
        <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:px-12">
          <div><p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-teal-800">Clear responsibilities</p><h2 className="max-w-md text-3xl font-medium tracking-tight sm:text-4xl">A shared space.<br />The right access.</h2></div>
          <div>
            <ul className="space-y-6">{[
              ['Members', 'See your assignments, check sessions, and ask your committee questions.'],
              ['Committee leaders', 'Coordinate tasks, review work, and keep your committee organized.'],
              ['HR teams', 'Review participation, handle feedback, and support the people behind the work.'],
            ].map(([title, text]) => <li key={title} className="flex gap-4"><Check aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-teal-800" /><div><h3 className="text-base font-semibold">{title}</h3><p className="mt-1 text-sm leading-7 text-slate-600">{text}</p></div></li>)}</ul>
            <p className="mt-8 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-500">An operations assistant is available to authorized staff. Sensitive actions require your confirmation before they run.</p>
          </div>
        </section>
        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-7 px-5 py-12 sm:px-8 md:flex-row md:items-center lg:px-12"><div><h2 className="text-3xl font-medium tracking-tight">Make space for the work that matters.</h2><p className="mt-3 text-sm text-slate-600">Join your organization and start with what’s next.</p></div><a href="/signup" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-3 self-start rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 md:self-center">Get started <ArrowRight aria-hidden="true" className="h-4 w-4" /></a></div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-xs text-slate-500 sm:px-8 lg:px-12"><span>StudentOps / Student organization workspace</span><a href="/login" className="py-3 hover:text-slate-900">Sign in to your account</a></footer>
    </div>
  );
}
