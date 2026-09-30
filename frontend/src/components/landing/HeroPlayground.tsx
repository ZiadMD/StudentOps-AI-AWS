import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { LandingMascot, type LandingMascotMood } from './LandingMascot';
import type { LandingContent } from './content';
import { WordReveal } from './Chrome';

interface Chip {
  label: string;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
}

const CHIP_WIDTH = 168;
const CHIP_HEIGHT = 42;

/**
 * Ink-on-accent pairs for the chaos palette.
 *
 * The four accents are only ever used here, on a saturated fill, so the
 * foreground is picked for contrast against that fill rather than against
 * the page.
 */
const CHAOS_COLOURS: Record<string, { bg: string; fg: string }> = {
  coral: { bg: 'var(--lo-coral)', fg: '#ffffff' },
  amber: { bg: 'var(--lo-amber)', fg: '#0b1220' },
  cyan: { bg: 'var(--lo-cyan)', fg: '#0b1220' },
  violet: { bg: 'var(--lo-violet)', fg: '#ffffff' },
  paper: { bg: '#ffffff', fg: '#0b1220' },
};

const CHIP_KINDS = ['coral', 'amber', 'cyan', 'violet', 'paper'];

/**
 * The hero. Scattered message chips drift and repel the pointer until the
 * visitor holds the button, at which point they settle into a grid.
 *
 * The whole point of the section is the transition, so the motion runs on a
 * single `requestAnimationFrame` loop that writes `transform` on each chip
 * directly through a ref. Driving eighteen chips through React state would
 * mean eighteen re-renders per frame.
 *
 * Positions are seeded randomly on mount, which is why the chips are
 * `aria-hidden` and the stage carries a text summary instead: the content
 * here is decorative restatement of the headline, and a screen reader
 * announcing eighteen drifting strings in an arbitrary order would be noise.
 */
export function HeroPlayground({
  content,
  reducedMotion,
  touch,
}: {
  content: LandingContent;
  reducedMotion: boolean;
  touch: boolean;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const chipNodes = useRef<(HTMLDivElement | null)[]>([]);
  const chips = useRef<Chip[]>([]);
  const gridSlots = useRef<{ x: number; y: number }[]>([]);
  const pointer = useRef({ x: -999, y: -999 });
  const mode = useRef<'chaos' | 'organizing' | 'order'>('chaos');

  const [phase, setPhase] = useState<'chaos' | 'organizing' | 'order'>('chaos');
  const [charge, setCharge] = useState(0);
  const [mood, setMood] = useState<LandingMascotMood>('idle');
  const holding = useRef(false);
  const chargeRaf = useRef(0);

  const labels = useMemo(() => {
    const noise = content.week.noise;
    return Array.from({ length: reducedMotion ? 9 : 18 }, (_, index) => ({
      label: noise[index % noise.length],
      kind: CHIP_KINDS[index % CHIP_KINDS.length],
    }));
  }, [content.week.noise, reducedMotion]);

  const place = useCallback((index: number) => {
    const node = chipNodes.current[index];
    const chip = chips.current[index];
    if (!node || !chip) return;
    node.style.transform = `translate(${chip.x.toFixed(1)}px, ${chip.y.toFixed(1)}px) rotate(${chip.rot.toFixed(1)}deg)`;
  }, []);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const maxX = Math.max(0, rect.width - CHIP_WIDTH);
    const maxY = Math.max(0, rect.height - CHIP_HEIGHT);

    chips.current = labels.map(label => ({
      label: label.label,
      kind: label.kind,
      x: Math.random() * maxX,
      y: Math.random() * maxY,
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() - 0.5) * 40,
      rot: (Math.random() - 0.5) * 20,
      vr: (Math.random() - 0.5) * 12,
    }));

    // The column count has to come from the measured width. A fixed six was
    // fine at the Figma desktop width and overflows below it: each slot is
    // `width / 6` but a chip is a fixed 150px, so on a narrower stage the
    // chips overlap their neighbours and run past the right edge.
    const gap = 12;
    const columns = Math.max(2, Math.min(labels.length, Math.floor((rect.width + gap) / (CHIP_WIDTH + gap))));
    const columnWidth = rect.width / columns;
    const rowHeight = CHIP_HEIGHT + gap;

    // Centre the block vertically so a partial last row does not leave the
    // grid hanging at the top of a tall stage.
    const rows = Math.ceil(labels.length / columns);
    const gridHeight = rows * rowHeight + (rows - 1) * gap;
    const offsetY = Math.max(0, (rect.height - gridHeight) / 2);

    gridSlots.current = labels.map((_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        x: column * columnWidth,
        y: offsetY + row * (rowHeight + gap),
      };
    });

    chips.current.forEach((_, index) => place(index));

    if (reducedMotion) return;

    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      // Clamped so a backgrounded tab or a long frame cannot teleport every
      // chip across the stage on the first frame back.
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      const bounds = element.getBoundingClientRect();
      const currentMode = mode.current;

      chips.current.forEach((chip, index) => {
        if (currentMode === 'order') {
          const slot = gridSlots.current[index];
          const ease = Math.min(1, dt * 8);
          chip.x += (slot.x - chip.x) * ease;
          chip.y += (slot.y - chip.y) * ease;
          chip.rot += (0 - chip.rot) * ease;
        } else {
          chip.x += chip.vx * dt;
          chip.y += chip.vy * dt;
          chip.rot += chip.vr * dt;

          const centreX = chip.x + CHIP_WIDTH / 2;
          const centreY = chip.y + CHIP_HEIGHT / 2;

          if (currentMode === 'organizing') {
            chip.vx += (bounds.width / 2 - centreX) * dt * 3;
            chip.vy += (bounds.height / 2 - centreY) * dt * 3;
            chip.vx *= 0.9;
            chip.vy *= 0.9;
          } else {
            const dx = centreX - pointer.current.x;
            const dy = centreY - pointer.current.y;
            const distanceSquared = dx * dx + dy * dy;
            const radius = 150;
            if (distanceSquared < radius * radius && distanceSquared > 1) {
              const distance = Math.sqrt(distanceSquared);
              const force = (1 - distance / radius) * 1000;
              chip.vx += (dx / distance) * force * dt;
              chip.vy += (dy / distance) * force * dt;
            }

            if (chip.x < 0) { chip.x = 0; chip.vx = Math.abs(chip.vx) * 0.6; }
            if (chip.x > maxX) { chip.x = maxX; chip.vx = -Math.abs(chip.vx) * 0.6; }
            if (chip.y < 0) { chip.y = 0; chip.vy = Math.abs(chip.vy) * 0.6; }
            if (chip.y > maxY) { chip.y = maxY; chip.vy = -Math.abs(chip.vy) * 0.6; }

            chip.vx *= 0.99;
            chip.vy *= 0.99;

            // Without this the damping walks every chip to a dead stop and
            // the stage goes static before anyone presses anything.
            if (Math.hypot(chip.vx, chip.vy) < 10) {
              chip.vx += (Math.random() - 0.5) * 14;
              chip.vy += (Math.random() - 0.5) * 14;
            }
          }
        }

        place(index);
      });

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [labels, reducedMotion, place]);

  const triggerOrganize = useCallback(() => {
    if (mode.current !== 'chaos') return;
    mode.current = 'organizing';
    setPhase('organizing');
    setMood('thinking');
    window.setTimeout(() => {
      mode.current = 'order';
      setPhase('order');
      setMood('proud');
    }, 900);
  }, []);

  // Hold to charge. Bound to the button by a ref rather than by `onPointerDown`
  // so the same handler covers the keyboard path without a second element.
  useEffect(() => {
    const button = document.getElementById('studentops-organize');
    if (!button) return;

    const grow = () => {
      setCharge(previous => {
        const next = Math.min(1, previous + 0.012);
        if (next >= 1) {
          triggerOrganize();
          return 1;
        }
        if (holding.current) chargeRaf.current = requestAnimationFrame(grow);
        return next;
      });
    };

    const start = () => {
      if (mode.current !== 'chaos') return;
      holding.current = true;
      setMood('thinking');
      chargeRaf.current = requestAnimationFrame(grow);
    };

    const end = () => {
      holding.current = false;
      cancelAnimationFrame(chargeRaf.current);
      if (mode.current === 'chaos') {
        setCharge(0);
        setMood('idle');
      }
    };

    button.addEventListener('pointerdown', start);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    return () => {
      button.removeEventListener('pointerdown', start);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      cancelAnimationFrame(chargeRaf.current);
    };
  }, [triggerOrganize]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const element = stage.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      pointer.current.x = event.clientX - rect.left;
      pointer.current.y = event.clientY - rect.top;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, []);

  const reset = () => {
    mode.current = 'chaos';
    setPhase('chaos');
    setCharge(0);
    setMood('idle');
    chips.current.forEach(chip => {
      chip.vx = (Math.random() - 0.5) * 160;
      chip.vy = (Math.random() - 0.5) * 160;
      chip.vr = (Math.random() - 0.5) * 30;
    });
  };

  const isOrdered = phase === 'order';
  const charging = charge > 0 && phase === 'chaos' && !reducedMotion;

  return (
    <section
      id="top"
      className="lo-edge relative z-10 min-h-[100svh] overflow-hidden pb-16 pt-28"
      style={{ background: 'var(--lo-canvas)' }}
    >
      <div className="grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div className="relative z-20 max-w-xl">
          <div className="eyebrow mb-5 flex items-center gap-2">
            <Sparkles size={13} aria-hidden="true" /> {content.hero.eyebrow}
          </div>

          <h1 className="lo-display text-[clamp(2.6rem,7vw,5.2rem)]">
            <WordReveal text={content.hero.titleA} /> <br />
            <WordReveal text={content.hero.titleB} delay={0.1} />{' '}
            <span className="lo-serif-em text-[var(--lo-lime-deep)]">{content.hero.titleEm}</span>
          </h1>

          <p className="mt-6 max-w-md text-[1.05rem] leading-relaxed" style={{ color: 'var(--lo-ink-soft)' }}>
            {content.hero.sub}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-5">
            <div className="relative">
              {charging && (
                <>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-full border-2"
                    style={{ borderColor: 'var(--lo-lime)', animation: 'lo-hold-ping 1.2s var(--lo-ease-out) infinite' }}
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-full border-2"
                    style={{ borderColor: 'var(--lo-lime)', animation: 'lo-hold-ping 1.2s var(--lo-ease-out) 0.6s infinite' }}
                  />
                </>
              )}

              <button
                id="studentops-organize"
                type="button"
                onClick={() => {
                  // A click is the keyboard and screen-reader path. Touch users
                  // hold instead, which the pointer listeners above handle.
                  triggerOrganize();
                }}
                disabled={isOrdered}
                aria-label={content.hero.organize}
                className="lo-mono relative grid h-16 select-none place-items-center rounded-full px-8 text-sm font-medium disabled:opacity-100"
                style={{
                  background: 'var(--lo-ink)',
                  color: 'var(--lo-canvas)',
                  minWidth: 220,
                  animation: charging ? 'lo-hold-shake 0.26s linear infinite' : undefined,
                }}
                data-cursor="magnetic"
              >
                <svg
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full -rotate-90 overflow-visible"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{
                    opacity: charge > 0 && !isOrdered ? 1 : 0,
                    transition: 'opacity 0.45s var(--lo-ease-out)',
                  }}
                >
                  <rect
                    x="3" y="3" width="94" height="94" rx="50" ry="50"
                    fill="none" stroke="var(--lo-lime)" strokeWidth="1" opacity={0.3}
                    pathLength={1} strokeDasharray={1} strokeDashoffset={0}
                    vectorEffect="non-scaling-stroke"
                  />
                  <rect
                    x="3" y="3" width="94" height="94" rx="50" ry="50"
                    fill="none" stroke="var(--lo-lime)" strokeWidth="3.5"
                    pathLength={1} strokeDasharray={1} strokeDashoffset={1 - charge}
                    strokeLinecap="round" vectorEffect="non-scaling-stroke"
                    style={{ transition: 'stroke-dashoffset 0.08s linear' }}
                  />
                </svg>

                <span className="relative">
                  {phase === 'chaos'
                    ? content.hero.organize
                    : phase === 'organizing'
                      ? `${content.hero.organizing}…`
                      : content.hero.organized}
                </span>
              </button>
            </div>

            {isOrdered && (
              <button
                type="button"
                onClick={reset}
                className="lo-mono px-2 py-2 text-xs underline underline-offset-4 transition-colors"
                style={{ color: 'var(--lo-muted)' }}
              >
                {content.hero.replay}
              </button>
            )}
          </div>

          <p className="lo-mono mt-5 text-[0.7rem]" style={{ color: 'var(--lo-muted)' }}>
            {content.hero.stageHint}
          </p>
        </div>

        <div className="relative">
          <div
            ref={stage}
            className="relative h-[62vh] min-h-[420px] w-full overflow-hidden rounded-[28px] border"
            style={{
              borderColor: 'var(--lo-line-strong)',
              background: isOrdered ? '#ffffff' : 'linear-gradient(160deg, #fbfcfe, #eef2f7)',
              transition: 'background 0.6s',
            }}
            role="img"
            aria-label={content.hero.stageHint}
          >
            {isOrdered && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-50"
                style={{
                  backgroundImage:
                    'linear-gradient(var(--lo-line) 1px, transparent 1px), linear-gradient(90deg, var(--lo-line) 1px, transparent 1px)',
                  backgroundSize: '16.66% 70px',
                }}
              />
            )}

            <div
              className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
              style={{
                opacity: phase === 'chaos' ? 0.9 : phase === 'organizing' ? 1 : 0.14,
                transition: 'opacity 0.5s',
              }}
            >
              <LandingMascot
                mood={mood}
                size={phase === 'organizing' ? 160 : 120}
                ink="var(--lo-ink)"
                paper={isOrdered ? '#ffffff' : '#f2f5f9'}
                reducedMotion={reducedMotion}
              />
            </div>

            {labels.map((label, index) => {
              const palette = CHAOS_COLOURS[isOrdered ? 'paper' : label.kind];
              return (
                <div
                  key={`${label.label}-${index}`}
                  ref={node => {
                    chipNodes.current[index] = node;
                  }}
                  aria-hidden="true"
                  className="lo-mono absolute left-0 top-0 flex items-center gap-2 rounded-xl px-3 text-[0.72rem]"
                  style={{
                    width: CHIP_WIDTH,
                    height: CHIP_HEIGHT,
                    background: palette.bg,
                    color: palette.fg,
                    border: isOrdered ? '1px solid var(--lo-line)' : 'none',
                    willChange: 'transform',
                    transition: 'background 0.5s, color 0.5s, border 0.5s, box-shadow 0.5s',
                    boxShadow: isOrdered ? '0 1px 0 var(--lo-line)' : '0 8px 20px rgb(11 18 32 / 0.12)',
                  }}
                >
                  {isOrdered ? (
                    <CheckCircle2 size={15} style={{ color: 'var(--lo-lime-deep)', flexShrink: 0 }} />
                  ) : (
                    <span
                      style={{ width: 7, height: 7, borderRadius: 999, background: palette.fg, opacity: 0.5, flexShrink: 0 }}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {isOrdered ? label.label.replace(/\?+/g, '').trim() : label.label}
                  </span>
                </div>
              );
            })}

            <div
              aria-hidden="true"
              className="lo-mono pointer-events-none absolute bottom-3 z-20 text-[0.62rem] uppercase tracking-[0.2em]"
              style={{
                insetInlineStart: '1rem',
                color: isOrdered ? 'var(--lo-muted)' : 'transparent',
                transition: 'color 0.5s',
              }}
            >
              {content.hero.stageLabel}
            </div>
          </div>

          {phase === 'chaos' && !touch && (
            <div
              className="lo-mono absolute -top-3 rounded-full px-3 py-1 text-[0.7rem]"
              style={{ insetInlineEnd: 12, background: 'var(--lo-lime)', color: 'var(--lo-ink)' }}
            >
              {content.hero.bubble}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
