import { useEffect, useState } from 'react';

/**
 * `true` when the user has asked the OS to reduce motion.
 *
 * Returns `false` on first render so the server/first paint and the client
 * agree. Every consumer gates an animation behind this, so flipping it
 * immediately is safe, but starting `false` avoids a frame of motion on a
 * device that has already told us it does not want any.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * `true` on devices without a real hovering pointer.
 *
 * Used to decide whether to install the custom cursor and the hold gesture.
 * A touch device has no hover, so a cursor overlay would have nothing to
 * track and would only cover content.
 */
export function useIsTouch(): boolean {
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    setTouch(!window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }, []);

  return touch;
}

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
