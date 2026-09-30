import { useLayoutEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, CheckCircle2, ClipboardCheck, Gauge, Video } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { LandingContent } from './content';

gsap.registerPlugin(ScrollTrigger);

/**
 * A pinned band that advances one feature at a time as the reader scrolls.
 *
 * The active index is the only state, so the copy swaps are cheap. Everything
 * else is a diagram per feature, each one illustrating the claim made beside
 * it rather than decorating it.
 */
export function FeatureStage({
  content,
  reducedMotion,
}: {
  content: LandingContent;
  reducedMotion: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const items = content.features.items;

  useLayoutEffect(() => {
    const element = wrap.current;
    if (!element || reducedMotion) return;

    const context = gsap.context(() => {
      ScrollTrigger.create({
        trigger: element,
        start: 'top top',
        end: `+=${items.length * 28}%`,
        pin: true,
        scrub: true,
        refreshPriority: 1,
        invalidateOnRefresh: true,
        onUpdate: self => {
          const next = Math.min(items.length - 1, Math.floor(self.progress * items.length));
          setActive(previous => (previous === next ? previous : next));
        },
      });
    }, element);

    return () => context.revert();
  }, [items.length, reducedMotion]);

  const current = items[active];

  return (
    <section
      id="features"
      ref={wrap}
      className="lo-edge relative z-10 min-h-[100svh] py-24"
      style={{ background: 'var(--lo-canvas)' }}
    >
      <div className="grid min-h-[80svh] gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <div className="eyebrow mb-6">{content.features.eyebrow}</div>

          <div key={current.key} className="lo-role-in" style={{ animation: reducedMotion ? undefined : 'lo-role-in 0.5s var(--lo-ease-out)' }}>
            <div className="flex items-center gap-3">
              <span className="lo-mono text-xs" style={{ color: 'var(--lo-muted)' }}>
                {String(active + 1).padStart(2, '0')}
              </span>
              <span className="h-px w-8" style={{ background: 'var(--lo-line-strong)' }} />
              <span className="lo-mono text-[0.7rem] uppercase tracking-[0.2em]" style={{ color: 'var(--lo-lime-deep)' }}>
                {current.kicker}
              </span>
            </div>

            <h3 className="lo-display mt-4 text-[clamp(1.8rem,4vw,3rem)]" style={{ maxWidth: '16ch' }}>
              {current.title}
            </h3>
            <p className="mt-5 max-w-md text-[1.05rem] leading-relaxed" style={{ color: 'var(--lo-ink-soft)' }}>
              {current.body}
            </p>
          </div>

          <div className="mt-10 flex items-center gap-2">
            {items.map((item, index) => (
              <span
                key={item.key}
                aria-hidden="true"
                className="rounded-full transition-all duration-500"
                style={{
                  height: 4,
                  width: index === active ? 32 : 12,
                  background: index === active ? 'var(--lo-ink)' : 'var(--lo-line-strong)',
                }}
              />
            ))}
          </div>
        </div>

        <div
          className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-[28px] border"
          style={{
            borderColor: 'var(--lo-line-strong)',
            background: 'radial-gradient(circle at 50% 40%, #ffffff, #eef2f7)',
          }}
        >
          <FeatureDiagram featureKey={current.key} reducedMotion={reducedMotion} />

          <div
            className="lo-mono absolute bottom-5 text-[0.62rem] uppercase tracking-[0.2em]"
            style={{ insetInlineStart: '1.25rem', color: 'var(--lo-muted)' }}
          >
            {current.kicker}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * One diagram per feature.
 *
 * These are diagrams, not screenshots. The attendance grid is a 3x3 of
 * session tiles, which is what the session roster page actually presents;
 * the scoring dial shows 82 against a ring because the workspace reports a
 * behaviour score out of 23 and a separate task-quality average, and this
 * shows the composite as a proportion rather than inventing a scale.
 */
function FeatureDiagram({ featureKey, reducedMotion }: { featureKey: string; reducedMotion: boolean }) {
  const enter = reducedMotion ? undefined : 'lo-role-in 0.5s var(--lo-ease-out)';

  if (featureKey === 'reminders') {
    return (
      <div className="grid place-items-center" style={{ animation: enter }}>
        <div className="relative grid h-44 w-44 place-items-center rounded-full border-2" style={{ borderColor: 'var(--lo-ink)' }}>
          {!reducedMotion &&
            [0, 1].map(index => (
              <span
                key={index}
                aria-hidden="true"
                className="absolute inset-0 rounded-full border-2"
                style={{
                  borderColor: 'var(--lo-lime-deep)',
                  animation: `lo-ripple-out 2.2s ${index * 0.9}s ease-out infinite`,
                }}
              />
            ))}
          <Bell size={54} aria-hidden="true" />
          {/* A queued count, not a sent one: nothing reaches a member until a
              person approves it, and the diagram should not imply otherwise. */}
          <span
            className="lo-mono absolute -right-1 -top-1 grid h-8 w-8 place-items-center rounded-full text-xs font-bold"
            style={{ background: 'var(--lo-coral)', color: '#ffffff' }}
          >
            3
          </span>
        </div>

        <div className="lo-mono mt-6 text-2xl">
          pending
          <span className="text-base" style={{ color: 'var(--lo-muted)' }}> · approval</span>
        </div>
        <div className="lo-mono mt-3 flex items-center gap-2 rounded-2xl px-3 py-2 text-xs" style={{ background: 'var(--lo-lime)', color: 'var(--lo-ink)' }}>
          WhatsApp · queued, not sent
        </div>
      </div>
    );
  }

  if (featureKey === 'attendance') {
    return (
      <div className="grid grid-cols-3 gap-3" style={{ animation: enter }}>
        {Array.from({ length: 9 }, (_, index) => (
          <div
            key={index}
            className="relative grid h-16 w-20 place-items-center rounded-lg"
            style={{ background: 'var(--lo-ink)' }}
          >
            <Video size={18} color="#ffffff" opacity={0.5} aria-hidden="true" />
            <span
              aria-hidden="true"
              className="absolute bottom-1 grid h-5 w-5 place-items-center rounded-full"
              style={{
                insetInlineEnd: 4,
                background: 'var(--lo-lime)',
                animation: reducedMotion ? undefined : `lo-breathe 0.6s ${index * 0.12}s ease-out both`,
              }}
            >
              <CheckCircle2 size={13} color="#0b1220" />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (featureKey === 'tasks') {
    return (
      <div className="w-full max-w-xs space-y-3" style={{ animation: enter }}>
        {['Slides deck', 'Recruitment form', 'Session recap'].map((task, index) => (
          <div
            key={task}
            className="flex items-center justify-between rounded-xl border bg-white px-4 py-3"
            style={{ borderColor: 'var(--lo-line)' }}
          >
            <span className="lo-mono flex items-center gap-2 text-xs">
              <ClipboardCheck size={13} style={{ color: 'var(--lo-muted)' }} aria-hidden="true" />
              {task}
            </span>
            <span
              className="lo-mono rounded-full px-2 py-0.5 text-[0.6rem] uppercase tracking-wider"
              style={{
                background: index === 2 ? 'var(--lo-line)' : 'var(--lo-ink)',
                color: index === 2 ? 'var(--lo-muted)' : 'var(--lo-lime)',
                transform: 'rotate(-6deg)',
              }}
            >
              {index === 2 ? 'pending' : 'reviewed'}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (featureKey === 'scoring') {
    return (
      <div className="flex flex-col items-center gap-6" style={{ animation: enter }}>
        <div className="relative grid h-36 w-36 place-items-center">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--lo-line)" strokeWidth="8" />
            {/* 18/23 of the behaviour scale. */}
            <circle
              cx="50" cy="50" r="42" fill="none" stroke="var(--lo-lime-deep)" strokeWidth="8" strokeLinecap="round"
              pathLength={1} strokeDasharray={1} strokeDashoffset={0.22}
            />
          </svg>
          <span className="lo-display absolute text-3xl">18</span>
        </div>
        <div className="lo-mono text-[0.68rem]" style={{ color: 'var(--lo-muted)' }}>
          behaviour · out of 23
        </div>
        <div className="flex items-end gap-2" aria-hidden="true">
          {[40, 62, 55, 78, 90].map((height, index) => (
            <div
              key={index}
              className="w-5 rounded-t"
              style={{ height, background: index === 4 ? 'var(--lo-lime-deep)' : 'var(--lo-ink)' }}
            />
          ))}
        </div>
        <div className="lo-mono flex items-center gap-1.5 text-[0.68rem]" style={{ color: 'var(--lo-muted)' }}>
          <Gauge size={13} aria-hidden="true" /> task quality, tracked separately
        </div>
      </div>
    );
  }

  const today = new Date();
  const days = Array.from({ length: 4 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + (index - 1));
    return date;
  });

  return (
    <div className="flex flex-wrap items-end justify-center gap-2" style={{ animation: enter }}>
      {days.map((date, index) => {
        const isToday = index === 1;
        return (
          <div
            key={index}
            className="lo-mono grid h-24 w-16 place-items-center gap-1 rounded-lg py-2"
            style={{
              background: isToday ? 'var(--lo-lime)' : 'var(--lo-ink)',
              color: isToday ? 'var(--lo-ink)' : 'var(--lo-canvas)',
              boxShadow: isToday
                ? '0 8px 20px rgb(166 212 23 / 0.4)'
                : 'inset 0 -1px 0 rgb(255 255 255 / 0.15)',
              animation: reducedMotion ? undefined : `lo-breathe 0.5s ${index * 0.1}s ease-out`,
            }}
          >
            <span className="text-[0.62rem] uppercase tracking-[0.15em]" style={{ opacity: 0.7 }}>
              {date.toLocaleDateString(undefined, { weekday: 'short' })}
            </span>
            <span className="text-4xl leading-none">{date.getDate()}</span>
            {isToday && <CalendarDays size={12} aria-label="today" />}
          </div>
        );
      })}
    </div>
  );
}
