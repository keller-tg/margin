import { useLayoutEffect, type RefObject } from 'react';

/**
 * Keeps a block a whole number of rules tall, so the writing after it lands on the lines again
 * (photos, maps, the compare sketch). Re-snaps when the block's content resizes.
 */
export function useRuleSnap(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const snap = () => {
      const rule = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rule')) || 36;
      el.style.minHeight = '';
      const h = el.getBoundingClientRect().height;
      el.style.minHeight = `${Math.ceil(h / rule - 0.02) * rule}px`;
    };
    snap();
    const inner = el.firstElementChild;
    if (!inner) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(snap));
    ro.observe(inner);
    return () => ro.disconnect();
  }, [ref]);
}
