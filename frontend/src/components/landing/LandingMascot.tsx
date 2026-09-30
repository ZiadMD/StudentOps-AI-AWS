import { AgentMascot } from '../AgentMascot';
import type { StateId } from '../../lib/bloub-engine';

/**
 * The landing page's own mood vocabulary, mapped onto the mascot states that
 * actually exist in `lib/bloub-engine`.
 *
 * The Figma page shipped a second, standalone blob component with its own
 * seven-state API. Porting it would have put two independent blob engines in
 * the bundle and left the landing mascot visually inconsistent with the one
 * in the signed-in workspace. Mapping onto `AgentMascot` keeps one engine.
 *
 * `state` on `AgentMascot` drives a body sequence, so these are chosen to
 * read at a glance: a "thinking" orbit for work in progress, "wink" for
 * something cheeky, "sleep" for the idle/end state.
 */
export type LandingMascotMood = 'idle' | 'curious' | 'thinking' | 'proud' | 'excited' | 'sleepy';

const MOOD_TO_STATE: Record<LandingMascotMood, StateId> = {
  idle: 'idle',
  curious: 'wink',
  thinking: 'thinking',
  proud: 'burst',
  excited: 'exclaim',
  sleepy: 'sleep',
};

export interface LandingMascotProps {
  mood: LandingMascotMood;
  /** Rendered size in pixels. */
  size?: number;
  /** Ink the body is cut from, as a CSS colour. */
  ink?: string;
  /** Paper the body is knocked out against, as a CSS colour. */
  paper?: string;
  /** Renders one settled frame instead of animating. */
  reducedMotion?: boolean;
  className?: string;
}

/**
 * A settled frame to show instead of animating.
 *
 * `AgentMascot` exposes `frozenAt` for exactly this. It has to be a constant
 * rather than a counter, because the effect that drives the loop depends on
 * the value: an incrementing clock would tear down and rebuild the rAF loop
 * on every render. 1.4s is past the first blink of every sequence, so the
 * frame is a settled pose rather than a half-finished transition.
 */
const FROZEN_FRAME = 1.4;

export function LandingMascot({
  mood,
  size = 120,
  ink = 'var(--lo-ink)',
  paper = 'var(--lo-canvas)',
  reducedMotion = false,
  className,
}: LandingMascotProps) {
  return (
    // `AgentMascot` always renders `role="img"` with a label, which is right
    // for the workspace but wrong here: every landing instance is decorative
    // and sits beside text that already carries the meaning. Hiding the
    // wrapper removes it from the accessibility tree without touching the
    // component every other surface depends on.
    <span aria-hidden="true" className={className}>
      <AgentMascot
        state={MOOD_TO_STATE[mood]}
        sizePx={size}
        color={ink}
        paper={paper}
        follow={!reducedMotion}
        frozenAt={reducedMotion ? FROZEN_FRAME : undefined}
      />
    </span>
  );
}
