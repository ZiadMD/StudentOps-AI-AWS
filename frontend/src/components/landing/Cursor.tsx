import { useEffect, useRef } from 'react';

/**
 * A dot that tracks the pointer exactly, and a ring that lags behind it.
 *
 * The elements are position: fixed at the origin and moved with `transform`
 * only, so no layout or paint is triggered per frame. The ring lerps toward
 * the pointer, which is what gives the pair its weight.
 *
 * The ring resizes based on the `data-cursor` attribute of whatever is under
 * the pointer, read on move rather than on hover. `pointerover` would give
 * the same result with fewer reads, but it does not fire for the element
 * already under the pointer when the variant changes as the pointer travels
 * across siblings, and the `closest` walk here is cheap.
 */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const pos = { x: target.x, y: target.y };
    let variant = '';
    let raf = 0;

    const onMove = (event: PointerEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;

      const element = (event.target as HTMLElement | null)?.closest?.('[data-cursor]') as HTMLElement | null;
      const next = element?.dataset.cursor ?? '';
      if (next !== variant) {
        variant = next;
        if (ring.current) ring.current.dataset.variant = next;
        if (label.current) label.current.textContent = element?.dataset.cursorLabel ?? '';
      }
    };

    const loop = () => {
      pos.x += (target.x - pos.x) * 0.18;
      pos.y += (target.y - pos.y) * 0.18;

      if (dot.current) {
        dot.current.style.transform = `translate(${target.x}px, ${target.y}px) translate(-50%, -50%)`;
      }
      if (ring.current) {
        ring.current.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`;
      }
      if (label.current) {
        label.current.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`;
      }

      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div ref={dot} className="lo-cursor-dot" aria-hidden="true" />
      <div ref={ring} className="lo-cursor-ring" aria-hidden="true" />
      <div ref={label} className="lo-cursor-label" aria-hidden="true" />
    </>
  );
}
