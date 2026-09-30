import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { LandingMascot, type LandingMascotMood } from './LandingMascot';
import type { LandingContent } from './content';

/**
 * The closing call to action.
 *
 * The button leans toward the pointer when it is close, which is the one
 * magnetic effect kept from the original design, and the mascot reacts to it.
 * The burst on click is purely decorative.
 */
export function Finale({
  content,
  reducedMotion,
  workspaceHref,
}: {
  content: LandingContent;
  reducedMotion: boolean;
  workspaceHref: string;
}) {
  const button = useRef<HTMLAnchorElement>(null);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [mood, setMood] = useState<LandingMascotMood>('idle');

  useEffect(() => {
    const element = button.current;
    if (!element || reducedMotion) return;

    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);

      if (Math.hypot(dx, dy) < 170) {
        element.style.transform = `translate(${dx * 0.3}px, ${dy * 0.3}px)`;
        setMood('excited');
      } else {
        element.style.transform = 'translate(0, 0)';
        setMood(current => (current === 'excited' ? 'idle' : current));
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [reducedMotion]);

  const onClick = (event: React.MouseEvent) => {
    setMood('proud');
    if (reducedMotion) return;

    const next = Array.from({ length: 12 }, (_, index) => ({
      id: Date.now() + index,
      x: event.clientX + (Math.random() - 0.5) * 220,
      y: event.clientY + (Math.random() - 0.5) * 180,
    }));
    setBursts(current => [...current, ...next]);

    const ids = new Set(next.map(burst => burst.id));
    window.setTimeout(() => setBursts(current => current.filter(burst => !ids.has(burst.id))), 1200);
  };

  return (
    <section
      id="finale"
      data-invert
      className="lo-edge relative grid min-h-[100svh] place-items-center overflow-hidden"
      style={{ background: 'var(--lo-lime)', color: 'var(--lo-ink)' }}
    >
      <div className="relative z-10 flex flex-col items-center text-center">
        <LandingMascot
          mood={mood}
          size={220}
          ink="var(--lo-ink)"
          paper="var(--lo-lime)"
          reducedMotion={reducedMotion}
        />

        <div className="eyebrow mt-8" style={{ color: 'var(--lo-ink-soft)' }}>
          {content.finale.eyebrow}
        </div>
        <h2 className="lo-display mt-4 text-[clamp(2.6rem,9vw,7rem)]">{content.finale.title}</h2>
        <p className="mt-5 max-w-md" style={{ color: 'var(--lo-ink-soft)' }}>
          {content.finale.body}
        </p>

        <a
          ref={button}
          href={workspaceHref}
          onClick={onClick}
          className="lo-mono mt-10 inline-flex items-center gap-3 rounded-full px-9 py-5 text-sm font-medium"
          style={{ background: 'var(--lo-ink)', color: 'var(--lo-lime)', willChange: 'transform' }}
          data-cursor="drag"
        >
          {content.finale.cta}
          <ArrowRight size={17} className="rtl:rotate-180" aria-hidden="true" />
        </a>

        <p className="lo-mono mt-6 text-[0.68rem]" style={{ color: 'var(--lo-ink-soft)' }}>
          {content.finale.note}
        </p>
      </div>

      {bursts.map(burst => (
        <div
          key={burst.id}
          aria-hidden="true"
          className="pointer-events-none fixed z-50"
          style={{ left: burst.x, top: burst.y, animation: 'lo-pop-check 1.1s ease-out forwards' }}
        >
          <CheckCircle2 size={22} color="var(--lo-ink)" fill="var(--lo-lime)" />
        </div>
      ))}
    </section>
  );
}

/**
 * Site footer.
 *
 * Every link points at a real anchor on this page or at a real auth route.
 * The Figma original used `href="#"` placeholders, which produced a footer
 * that looked navigable and went nowhere.
 */
export function LandingFooter({ content }: { content: LandingContent }) {
  return (
    <footer
      data-invert
      className="lo-edge py-16"
      style={{ background: 'var(--lo-ink)', color: 'var(--lo-canvas)' }}
    >
      <div className="grid gap-12 md:grid-cols-[1.4fr_2fr]">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="grid place-items-center rounded-full"
              style={{ width: 30, height: 30, background: 'var(--lo-lime)' }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 999, background: 'var(--lo-ink)' }} />
            </span>
            <span className="lo-display text-lg">{content.footer.tag}</span>
          </div>
          <p className="lo-serif-em mt-4 max-w-[16ch] text-2xl" style={{ color: 'rgb(248 250 252 / 0.8)' }}>
            {content.footer.line}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {content.footer.cols.map(column => (
            <nav key={column.h} aria-label={column.h}>
              <div className="lo-mono text-[0.62rem] uppercase tracking-[0.2em]" style={{ color: 'var(--lo-lime)' }}>
                {column.h}
              </div>
              <ul className="mt-3 space-y-2">
                {column.links.map(link => (
                  <li key={`${column.h}-${link.label}`}>
                    <a
                      href={link.href}
                      className="group inline-flex items-center gap-1 py-1.5 text-sm"
                      style={{ color: 'rgb(248 250 252 / 0.7)' }}
                    >
                      {link.label}
                      <ArrowUpRight size={12} className="opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      <div
        className="lo-mono mt-14 border-t pt-6 text-[0.68rem]"
        style={{ borderColor: 'rgb(255 255 255 / 0.1)', color: 'rgb(248 250 252 / 0.4)' }}
      >
        {content.footer.rights}
      </div>
    </footer>
  );
}
