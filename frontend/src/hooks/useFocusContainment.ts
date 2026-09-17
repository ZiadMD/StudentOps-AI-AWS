import { useEffect, type RefObject } from 'react';

/** Contain keyboard focus and restore the opener when an overlay closes. */
export function useFocusContainment(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const elements = () => Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
    (elements()[0] || root).focus();
    const contain = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = elements();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) { event.preventDefault(); root.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root)) {
        event.preventDefault(); first.focus();
      }
    };
    root.addEventListener('keydown', contain);
    return () => {
      root.removeEventListener('keydown', contain);
      if (previous?.isConnected && previous !== document.body) previous.focus();
    };
  }, [ref, active]);
}
