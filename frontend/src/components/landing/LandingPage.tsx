import { useCallback, useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Cursor } from './Cursor';
import { LandingNav, Preloader } from './Chrome';
import { HeroPlayground } from './HeroPlayground';
import { WeekScene } from './WeekScene';
import { FeatureStage } from './FeatureStage';
import { RolesSection } from './RolesSection';
import { AgentDemo } from './AgentDemo';
import { Finale, LandingFooter } from './Finale';
import { LANDING_CONTENT, type LandingContent } from './content';
import { useIsTouch, useReducedMotion } from './hooks';
import './landing.css';

gsap.registerPlugin(ScrollTrigger);

export interface LandingPageProps {
  /** The visitor's chosen UI language, from `LanguageContext`. */
  language: 'en' | 'ar';
  /** Called when the visitor asks to switch language. */
  onToggleLanguage: () => void;
  /** `true` when a session is already established. */
  signedIn?: boolean;
}

/**
 * The public landing page.
 *
 * Composed from the design supplied in the Figma project, but adapted to
 * this codebase rather than dropped in: it shares the workspace mascot
 * engine, runs on the Tailwind 3 toolchain, reads its copy from
 * `content.ts` (with the product claims corrected against the backend), and
 * takes the language from the app's own `LanguageContext` instead of holding
 * a second, competing language state.
 *
 * The styles are imported here rather than in `index.css` so that nothing
 * from this page is loaded for a visitor who is already signed in and
 * navigating the workspace.
 */
export function LandingPage({
  language,
  onToggleLanguage,
  signedIn = false,
}: LandingPageProps) {
  const content: LandingContent = LANDING_CONTENT[language];
  const reducedMotion = useReducedMotion();
  const touch = useIsTouch();
  const [ready, setReady] = useState(false);
  const wipe = useRef<HTMLDivElement>(null);

  const workspaceHref = signedIn ? '/app/dashboard' : '/login';

  // The document language and direction are owned by LanguageContext for the
  // rest of the app, and this page must not fight it. Only the title is set
  // here, and only on mount and language change.
  useEffect(() => {
    document.title = content.meta.title;
  }, [content.meta.title]);

  /**
   * A wipe covers the viewport while the language changes.
   *
   * Without it the copy swaps in place, which on a page this typographic
   * reads as a glitch. The wipe is skipped under reduced motion, where there
   * is nothing to hide anyway.
   */
  const handleToggleLanguage = useCallback(() => {
    const element = wipe.current;
    if (reducedMotion || !element) {
      onToggleLanguage();
      return;
    }

    const nextRtl = language === 'en';
    gsap
      .timeline()
      .set(element, { scaleX: 0, transformOrigin: nextRtl ? 'right center' : 'left center' })
      .to(element, { scaleX: 1, duration: 0.4, ease: 'power3.inOut' })
      .add(() => onToggleLanguage())
      .set(element, { transformOrigin: nextRtl ? 'left center' : 'right center' })
      .to(element, { scaleX: 0, duration: 0.45, ease: 'power3.inOut' }, '+=0.05');
  }, [language, onToggleLanguage, reducedMotion]);

  /**
   * Smooth scrolling, and keeping ScrollTrigger in step with it.
   *
   * Lenis drives its own rAF, so it is wired into GSAP's ticker rather than
   * run as a second loop, and `lagSmoothing(0)` is what stops a stalled
   * frame from letting the scroll position jump forward.
   *
   * Torn down entirely under reduced motion: the native scroll position stays,
   * and the pinned sections fall back to their unscripted layout.
   */
  useEffect(() => {
    if (reducedMotion) return;

    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, [reducedMotion]);

  /**
   * Recompute pinned sections after layout settles.
   *
   * Pins measure scroll distances, and the document height is wrong on the
   * first frame: the web fonts have not loaded, and the loader may still be
   * covering the page. Refreshing after two frames, again on a short delay,
   * and once more when the fonts resolve covers all three. Switching language
   * changes text length, so it needs a refresh of its own.
   */
  useEffect(() => {
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => ScrollTrigger.refresh()));
    const timer = window.setTimeout(() => ScrollTrigger.refresh(), 300);

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) {
      fonts.ready.then(() => ScrollTrigger.refresh()).catch(() => undefined);
    }

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [language, ready]);

  const cursorEnabled = !touch && !reducedMotion;

  return (
    <div
      className={`lo-root${cursorEnabled ? ' lo-has-cursor' : ''}`}
      dir={content.dir}
      lang={language}
    >
      <a href="#landing-content" className="skip-link">Skip to content</a>

      <Preloader content={content} reducedMotion={reducedMotion} onDone={() => setReady(true)} />

      <div className="lo-grain" aria-hidden="true" />
      <div ref={wipe} className="lo-lang-wipe" aria-hidden="true" />
      {cursorEnabled && <Cursor />}

      <LandingNav
        content={content}
        onToggleLanguage={handleToggleLanguage}
        workspaceHref={workspaceHref}
        signedIn={signedIn}
      />

      <main id="landing-content">
        <HeroPlayground content={content} reducedMotion={reducedMotion} touch={touch} />
        <WeekScene content={content} reducedMotion={reducedMotion} />
        <FeatureStage content={content} reducedMotion={reducedMotion} />
        <RolesSection content={content} />
        <AgentDemo content={content} reducedMotion={reducedMotion} />
        <Finale content={content} reducedMotion={reducedMotion} workspaceHref={workspaceHref} />
      </main>

      <LandingFooter content={content} />
    </div>
  );
}

export default LandingPage;
