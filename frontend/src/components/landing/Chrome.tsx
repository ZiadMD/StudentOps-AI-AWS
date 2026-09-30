import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Globe } from 'lucide-react';
import type { LandingContent } from './content';

/**
 * Fixed header that goes opaque once the page has scrolled.
 *
 * The `data-cursor="magnetic"` markers are read by `Cursor` to resize the
 * pointer ring; they are not styling hooks and carry no visual effect
 * themselves.
 */
export function LandingNav({
  content,
  onToggleLanguage,
  workspaceHref,
  signedIn,
}: {
  content: LandingContent;
  onToggleLanguage: () => void;
  workspaceHref: string;
  signedIn: boolean;
}) {
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="lo-edge fixed inset-x-0 top-0 z-50 transition-all duration-300"
      style={{
        paddingBlock: solid ? '0.7rem' : '1.2rem',
        background: solid ? 'rgb(248 250 252 / 0.72)' : 'transparent',
        backdropFilter: solid ? 'blur(12px)' : undefined,
        borderBottom: solid ? '1px solid var(--lo-line)' : '1px solid transparent',
      }}
    >
      <nav className="flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2" data-cursor="magnetic" aria-label="StudentOps">
          <span
            className="grid place-items-center rounded-full"
            style={{ width: 30, height: 30, background: 'var(--lo-ink)' }}
          >
            <span style={{ width: 12, height: 12, borderRadius: 999, background: 'var(--lo-lime)' }} />
          </span>
          <span className="lo-display text-lg">{content.footer.tag}</span>
        </a>

        <div className="hidden items-center gap-8 font-mono text-[0.8rem] md:flex">
          {/* `py-2` is load-bearing: these are 19px line boxes, and a link
              with no vertical padding is a 19px tap target. */}
          <a href="#features" className="py-2 transition-opacity hover:opacity-60">
            {content.nav.features}
          </a>
          <a href="#agent" className="py-2 transition-opacity hover:opacity-60">
            {content.nav.agent}
          </a>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onToggleLanguage}
            aria-label={content.lang.label}
            className="lo-mono flex min-h-[2.75rem] items-center gap-1.5 rounded-full border px-2.5 text-[0.75rem] transition-colors hover:bg-[var(--lo-ink)] hover:text-[var(--lo-canvas)] sm:min-h-0 sm:px-3 sm:py-1.5"
            style={{ borderColor: 'var(--lo-line-strong)' }}
            data-cursor="magnetic"
          >
            <Globe size={13} aria-hidden="true" />
            {/* The label is dropped below `sm`. At 320px the wordmark, this
                button and the CTA together overrun the header, and the
                glyph is kept so the control stays discoverable — it still
                carries its accessible name. */}
            <span className="hidden sm:inline">{content.lang.toggle}</span>
          </button>

          <a
            href={workspaceHref}
            className="lo-mono hidden min-h-[2.75rem] items-center rounded-full px-4 text-[0.75rem] font-medium transition-colors hover:bg-[var(--lo-ink)] hover:text-[var(--lo-canvas)] sm:inline-flex sm:min-h-0 sm:py-1.5"
            data-cursor="magnetic"
          >
            {signedIn ? content.nav.cta : content.nav.signIn}
          </a>

          <a
            href={workspaceHref}
            className="lo-mono inline-flex min-h-[2.75rem] items-center rounded-full px-3.5 text-[0.75rem] font-medium sm:min-h-0 sm:px-4 sm:py-1.5"
            style={{ background: 'var(--lo-ink)', color: 'var(--lo-canvas)' }}
            data-cursor="magnetic"
          >
            {content.nav.cta}
          </a>
        </div>
      </nav>
    </header>
  );
}

/**
 * A short scripted loader on first visit.
 *
 * Skipped entirely on a repeat visit, and given a real skip control. A
 * preloader that cannot be dismissed is a gate in front of the content; the
 * session flag means it never appears twice for the same visitor either.
 */
export function Preloader({
  content,
  reducedMotion,
  onDone,
}: {
  content: LandingContent;
  reducedMotion: boolean;
  onDone: () => void;
}) {
  const [percent, setPercent] = useState(0);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem('studentops_landing_seen') === '1';
    } catch {
      // Private browsing can deny storage; showing the loader again is fine.
      return false;
    }
  });
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setHidden(true);
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (hidden) {
      onDone();
      return;
    }

    try {
      sessionStorage.setItem('studentops_landing_seen', '1');
    } catch {
      // Non-fatal.
    }

    if (reducedMotion) {
      finish();
      return;
    }

    let raf = 0;
    const start = performance.now();
    const duration = 1500;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setPercent(Math.round(progress * 100));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        finish();
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hidden, reducedMotion, finish, onDone]);

  if (hidden) return null;

  return (
    <div
      className="lo-root fixed inset-0 z-[100] grid place-items-center"
      data-invert
      style={{ background: 'var(--lo-ink)' }}
      role="status"
      aria-label={content.preloader.line}
    >
      <div className="relative grid place-items-center gap-8">
        <div className="relative h-40 w-40" aria-hidden="true">
          {[0, 1, 2, 3].map(index => (
            <span
              key={index}
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{
                width: 22,
                height: 22,
                background: 'var(--lo-lime)',
                animation: `lo-drop-${index} 1.3s ${index * 0.18}s ease-in infinite`,
              }}
            />
          ))}
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ width: 46, height: 46, background: 'var(--lo-lime)' }}
          />
        </div>

        <div className="text-center">
          <div className="lo-mono text-[0.7rem] uppercase tracking-[0.3em]" style={{ color: 'var(--lo-lime)' }}>
            {content.preloader.line}
          </div>
          <div className="lo-display mt-2 text-5xl" style={{ color: 'var(--lo-canvas)' }}>
            {percent}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={finish}
        className="lo-mono absolute bottom-8 text-[0.7rem] uppercase tracking-[0.2em] transition-colors"
        style={{ insetInlineEnd: '2rem', color: 'rgb(248 250 252 / 0.6)' }}
      >
        {content.preloader.skip}
      </button>

      <style>{`
        @keyframes lo-drop-0 { 0% { transform: translate(-50%, -120px) scale(.6); opacity: 0 } 40% { opacity: 1 } 70%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0 } }
        @keyframes lo-drop-1 { 0% { transform: translate(30px, -120px) scale(.6); opacity: 0 } 40% { opacity: 1 } 70%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0 } }
        @keyframes lo-drop-2 { 0% { transform: translate(-90px, -120px) scale(.6); opacity: 0 } 40% { opacity: 1 } 70%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0 } }
        @keyframes lo-drop-3 { 0% { transform: translate(-50%, -160px) scale(.5); opacity: 0 } 40% { opacity: 1 } 70%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0 } }
      `}</style>
    </div>
  );
}

/**
 * Reveals text a word at a time, from below a clipping edge.
 *
 * Each word is wrapped in an `overflow: hidden` span so the word can slide up
 * from behind its own line box without the neighbouring words moving.
 */
export function WordReveal({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const words = element.querySelectorAll('[data-word]');
    if (words.length === 0) return;

    // Web Animations rather than GSAP: this is a one-shot on an element that
    // is above the fold, and it must not depend on the ScrollTrigger instance
    // that the rest of the page tears down and rebuilds on refresh.
    const animations = [...words].map((word, index) =>
      word.animate(
        [
          { transform: 'translateY(110%)', opacity: 0 },
          { transform: 'translateY(0%)', opacity: 1 },
        ],
        {
          duration: 900,
          delay: delay * 1000 + index * 60,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'both',
        },
      ),
    );

    return () => animations.forEach(animation => animation.cancel());
  }, [text, delay]);

  const words = text.split(' ');

  return (
    <span ref={ref} className={className}>
      {words.map((word, index) => (
        // The separator has to be a text node *between* the word wrappers, not
        // inside one. Each wrapper is an inline-block so the word can slide out
        // from behind a clipping edge, and trailing whitespace inside an
        // inline-block is collapsed away — putting the space in there renders
        // "Runyourorg".
        <Fragment key={`${word}-${index}`}>
          <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top' }}>
            <span data-word style={{ display: 'inline-block' }}>
              {word}
            </span>
          </span>
          {index < words.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </span>
  );
}
