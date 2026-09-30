import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { LandingMascot } from './LandingMascot';
import type { LandingContent } from './content';

gsap.registerPlugin(ScrollTrigger);

/**
 * A pinned band that scrolls horizontally as the reader scrolls vertically.
 *
 * The figures climb from zero as the band goes by. They are counts of the
 * fictional week being depicted, not telemetry from this system: the whole
 * section is a dramatisation of the problem, and the last one is deliberately
 * `0`. They count up from 0 on scroll for the same reason — a counter that
 * only animates when observed would read as a live metric.
 *
 * The track itself stays `dir="ltr"` in both languages. Horizontal scroll math
 * is `scrollWidth - innerWidth` against a negative translate, and mirroring
 * the track under `dir="rtl"` flips which side the overflow lands on and
 * makes the mapping between scroll direction and visual direction wrong. Each
 * panel sets its own `dir` for its content instead.
 */
export function WeekScene({
  content,
  reducedMotion,
}: {
  content: LandingContent;
  reducedMotion: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const figures = useRef<(HTMLSpanElement | null)[]>([]);

  useLayoutEffect(() => {
    const element = wrap.current;
    const trackElement = track.current;
    if (!element || !trackElement) return;

    const context = gsap.context(() => {
      // Reduced motion: no pin, no scrub. The four panels stack vertically and
      // read as an ordinary section, which is the same fallback ScrollTrigger
      // would produce if it never ran.
      if (reducedMotion) return;

      const distance = () => Math.max(0, trackElement.scrollWidth - window.innerWidth);

      gsap.to(trackElement, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: element,
          start: 'top top',
          end: () => `+=${distance()}`,
          scrub: 0.6,
          pin: true,
          anticipatePin: 1,
          refreshPriority: 2,
          invalidateOnRefresh: true,
          onUpdate: self => {
            const progress = self.progress;
            content.week.stats.forEach((stat, index) => {
              const node = figures.current[index];
              if (!node) return;
              // Ramps over the first 62% of the band, so all four have settled
              // before the noise wall arrives.
              const local = Math.max(0, Math.min(1, (progress - 0.1) * 1.6));
              node.textContent = String(Math.round(stat.n * local));
            });
          },
        },
      });
    }, element);

    return () => context.revert();
  }, [content, reducedMotion]);

  return (
    <section
      ref={wrap}
      dir="ltr"
      data-invert
      className="relative overflow-hidden"
      style={{ background: 'var(--lo-ink)', color: 'var(--lo-canvas)' }}
      aria-label={content.week.eyebrow}
    >
      {/*
        Without pinning, the four panels have to stack. Left as a `w-max`
        flex track inside an `overflow: hidden` section, the track is four
        viewport widths wide and only the first panel is ever on screen, so a
        reduced-motion visitor got an empty band the height of the viewport
        and no way to reach the other three. `w-full` plus `flex-col` makes it
        an ordinary stacked section.
      */}
      <div
        ref={track}
        dir="ltr"
        className={
          reducedMotion
            ? 'flex w-full flex-col'
            : 'flex h-[100svh] w-max items-center'
        }
        style={reducedMotion ? undefined : { willChange: 'transform' }}
      >
        <div
          dir={content.dir}
          className={`lo-edge flex flex-col justify-center ${reducedMotion ? 'py-16' : 'h-full w-screen shrink-0'}`}
        >
          <div className="eyebrow" style={{ color: 'var(--lo-lime)' }}>
            {content.week.eyebrow}
          </div>
          <h2 className="lo-display mt-4 max-w-[14ch] text-[clamp(2.2rem,6vw,4.5rem)]" style={{ color: 'var(--lo-canvas)' }}>
            {content.week.title}
          </h2>
          {reducedMotion ? (
            // The counters are driven by scroll position, which does not exist
            // here, so the final values are rendered directly rather than
            // leaving a static "0" beside each label.
            <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6">
              {content.week.stats.map(stat => (
                <div key={stat.label} className="flex items-baseline gap-3">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd
                    className="lo-display text-[clamp(2.5rem,8vw,5rem)]"
                    style={{ color: stat.n === 0 ? 'var(--lo-lime)' : 'var(--lo-canvas)' }}
                  >
                    {stat.n}
                    <span className="lo-mono ms-2 align-middle text-sm" style={{ color: 'rgb(248 250 252 / 0.5)' }}>
                      {stat.label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="lo-mono mt-8 text-xs" style={{ color: 'rgb(248 250 252 / 0.5)' }}>
              {content.week.keepScrolling}
            </div>
          )}
        </div>

        <div
          dir={content.dir}
          className={`lo-edge flex items-center ${reducedMotion ? 'py-16' : 'h-full w-screen shrink-0'}`}
        >
          {/* In the reduced-motion stack the figures are already rendered
              above, so this panel is dropped rather than duplicated. */}
          {!reducedMotion && (
            <div className="grid w-full grid-cols-2 gap-x-10 gap-y-12 md:gap-y-16">
              {content.week.stats.map((stat, index) => (
                <div
                  key={stat.label}
                  className="flex items-baseline gap-4"
                  style={{ animation: `lo-shake ${0.5 + index * 0.15}s steps(2) infinite` }}
                >
                  <span
                    ref={node => {
                      figures.current[index] = node;
                    }}
                    className="lo-display text-[clamp(3rem,11vw,9rem)]"
                    style={{ color: index === 3 ? 'var(--lo-lime)' : 'var(--lo-canvas)' }}
                  >
                    0
                  </span>
                  <span className="lo-mono max-w-[10ch] text-sm" style={{ color: 'rgb(248 250 252 / 0.5)' }}>
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className={
            reducedMotion
              ? 'relative flex items-center justify-center overflow-hidden py-16'
              : 'relative flex h-full w-screen shrink-0 items-center justify-center overflow-hidden'
          }
        >
          <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-center gap-1 opacity-90">
            {[0, 1, 2, 3, 4, 5, 6].map(row => (
              <div
                key={row}
                className="lo-mono flex gap-6 whitespace-nowrap text-lg md:text-2xl"
                style={{ transform: `translateX(${row % 2 ? -60 : 20}px)` }}
              >
                {[...content.week.noise, ...content.week.noise].map((message, index) => (
                  <span
                    key={index}
                    style={{
                      color: ['var(--lo-coral)', 'var(--lo-amber)', 'var(--lo-cyan)', 'var(--lo-violet)', 'var(--lo-canvas)'][
                        (row + index) % 5
                      ],
                      opacity: 0.65,
                    }}
                  >
                    {message}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: 'radial-gradient(circle at center, transparent 20%, var(--lo-ink) 78%)' }}
          />
        </div>

        <div
          dir={content.dir}
          className={`flex flex-col items-center justify-center gap-6 ${
            reducedMotion ? 'py-20' : 'h-full w-screen shrink-0'
          }`}
        >
          <LandingMascot
            mood="curious"
            size={180}
            ink="var(--lo-lime)"
            paper="var(--lo-ink)"
            reducedMotion={reducedMotion}
          />
          <p className="lo-serif-em text-2xl" style={{ color: 'rgb(248 250 252 / 0.8)' }}>
            {content.week.silence}
          </p>
          <p className="lo-display text-[clamp(1.6rem,4vw,3rem)]" style={{ color: 'var(--lo-canvas)' }}>
            {content.week.enter}
          </p>
        </div>
      </div>
    </section>
  );
}
