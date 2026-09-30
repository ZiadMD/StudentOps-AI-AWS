import { useLayoutEffect, useRef } from 'react';
import { ArrowUpRight, CheckCircle2 } from 'lucide-react';
import type { LandingContent } from './content';

/**
 * The role ladder and the escalation path.
 *
 * The five roles here are the five tiers the backend actually enforces, with
 * the legacy aliases (`team_lead` is equivalent to `committee_head`,
 * `committee_member` to `member`) folded in, because a person reading this
 * should recognise the name their own account uses.
 *
 * The escalation strip runs as a horizontal SVG so the "pulse travels up the
 * chain" is one continuous connector rather than five separate boxes with
 * gaps between them.
 */
export function RolesSection({ content }: { content: LandingContent }) {
  return (
    <section
      id="roles"
      className="lo-edge relative z-10 py-28"
      style={{ background: 'var(--lo-canvas)' }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="max-w-2xl">
          <div className="eyebrow mb-5">{content.roles.eyebrow}</div>
          <h2 className="lo-display text-[clamp(2rem,5vw,3.6rem)]">{content.roles.title}</h2>
          <p className="mt-4 text-[1.05rem] leading-relaxed" style={{ color: 'var(--lo-ink-soft)' }}>
            {content.roles.body}
          </p>
        </div>

        <div className="mt-12 grid gap-px overflow-hidden rounded-[24px] border sm:grid-cols-2 lg:grid-cols-5"
          style={{ borderColor: 'var(--lo-line-strong)', background: 'var(--lo-line)' }}
        >
          {content.roles.list.map(role => (
            <article key={role.key} className="p-6" style={{ background: 'var(--lo-canvas)' }}>
              <div className="lo-mono mb-3 h-1 w-8 rounded-full" style={{ background: 'var(--lo-lime-deep)' }} />
              <h3 className="lo-display text-lg">{role.name}</h3>
              <p className="mt-2 text-sm leading-6" style={{ color: 'var(--lo-muted)' }}>
                {role.sees}
              </p>
            </article>
          ))}
        </div>

        <Escalation content={content} />
      </div>
    </section>
  );
}

/**
 * The three-day escalation path, drawn as one strip.
 *
 * Animated left to right in both languages: the strip is a diagram of a
 * process rather than a layout that follows reading direction, and reversing
 * it would make the animation run backwards against the direction the reader
 * is already moving.
 */
function Escalation({ content }: { content: LandingContent }) {
  const svg = useRef<SVGSVGElement>(null);
  const labels = content.roles.escLabels;

  useLayoutEffect(() => {
    const element = svg.current;
    if (!element) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    // `querySelector` widens to `Element`, which has neither the path geometry
    // API nor a mutable inline style. Both are what the draw-on animation
    // needs, so the cast is to the element that actually has them.
    const path = element.querySelector('path[data-flow]') as SVGPathElement | null;
    if (!path) return;
    const length = path.getTotalLength();
    path.style.strokeDasharray = String(length);
    path.style.strokeDashoffset = String(length);

    let frame = 0;
    let start: number | null = null;

    // Driven off IntersectionObserver rather than ScrollTrigger: the observer
    // starts as soon as the strip is on screen, which is what "the pulse
    // travels up" is meant to convey, and it does not need a pinned trigger.
    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();

        const step = (now: number) => {
          start ??= now;
          const progress = Math.min(1, (now - start) / 1600);
          path.style.strokeDashoffset = String(length * (1 - progress));
          if (progress < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const width = 1000;
  const height = 120;
  const step = (width - 80) / (labels.length - 1);

  return (
    <div className="mt-16">
      <div className="max-w-xl">
        <h3 className="lo-display text-2xl">{content.roles.escTitle}</h3>
        <p className="mt-3 text-base leading-7" style={{ color: 'var(--lo-ink-soft)' }}>
          {content.roles.escBody}
        </p>
      </div>

      <div className="mt-10 overflow-x-auto">
        <div className="min-w-[640px]">
          <svg
            ref={svg}
            viewBox={`0 0 ${width} ${height}`}
            className="w-full"
            style={{ height: 120 }}
            role="img"
            aria-label={content.roles.escBody}
          >
            <line
              x1="40" y1="40" x2={width - 40} y2="40"
              stroke="var(--lo-line-strong)" strokeWidth="2"
            />
            <path
              data-flow
              d={`M 40 40 L ${width - 40} 40`}
              fill="none"
              stroke="var(--lo-lime-deep)"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {labels.map((label, index) => {
              const x = 40 + index * step;
              const isLast = index === labels.length - 1;
              return (
                <g key={label}>
                  <circle
                    cx={x}
                    cy="40"
                    r="9"
                    fill={isLast ? 'var(--lo-lime)' : 'var(--lo-canvas)'}
                    stroke={isLast ? 'var(--lo-ink)' : 'var(--lo-ink)'}
                    strokeWidth="2"
                  />
                  <text
                    x={x}
                    y="78"
                    textAnchor="middle"
                    style={{
                      fontFamily: 'var(--lo-font-mono)',
                      fontSize: '13px',
                      fill: 'var(--lo-ink)',
                    }}
                  >
                    {label}
                  </text>
                  {isLast && (
                    <CheckCircle2
                      x={x - 11}
                      y={-11}
                      width="22"
                      height="22"
                      color="var(--lo-lime-deep)"
                    />
                  )}
                </g>
              );
            })}
          </svg>

          <div className="lo-mono mt-2 flex flex-wrap items-center gap-3 text-[0.68rem]" style={{ color: 'var(--lo-muted)' }}>
            <span style={{ color: 'var(--lo-coral)' }}>{content.roles.escFlag}</span>
            <ArrowUpRight size={12} aria-hidden="true" />
            <span>{content.roles.escDays(3)}</span>
            <ArrowUpRight size={12} aria-hidden="true" />
            <span style={{ color: 'var(--lo-lime-deep)' }}>{content.roles.escFire}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
