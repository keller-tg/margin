// The 2D page turn (plan §11). Forward: the current leaf peels away from its right edge along a slightly
// slanted fold (the top corner leads), uncovering the next leaf, with a soft shadow travelling on the fold.
// Backward: the previous leaf is laid back down, the same motion in reverse. Reduced motion: the dip below.
//
// Only transforms are animated, so the compositor runs the turn. The leaf's fold box (.leaf-fold, 10%
// wider than the page on the left so its slant never cuts the page) is skewed and slides left, clipping
// the sheet; the sheet inside gets the exact inverse transform, so the page stands still while the fold's
// edge sweeps across it. (The first version animated clip-path, which Safari repaints on every frame.)

export type TurnDirection = 'forward' | 'back';

const FOLD_SLANT = 0.1; // the fold's top runs ahead of its bottom by 10% of the width (= .leaf-fold's extra width)
const STEPS = 12;

/**
 * Animate a turn. `moving` is the leaf on top that peels away (forward) or lays down (back);
 * `shadow` is an absolutely positioned strip above both leaves that follows the fold.
 */
export function turnPage(opts: { moving: HTMLElement; under: HTMLElement | null; shadow: HTMLElement | null; direction: TurnDirection; reduced: boolean; durationMs: number }): Promise<void> {
  const { moving, under, shadow, direction, reduced, durationMs } = opts;
  if (reduced) return dip(direction === 'forward' ? moving : under, direction === 'forward' ? under : moving);
  const easing = 'cubic-bezier(0.32, 0.02, 0.24, 1)';
  const [from, to] = direction === 'forward' ? [1, 0] : [0, 1];
  const fold = moving.querySelector<HTMLElement>(':scope > .leaf-fold');
  const sheet = fold?.firstElementChild as HTMLElement | null;
  const w = moving.offsetWidth;
  const h = moving.offsetHeight;
  if (!fold || !sheet || !w || !h) return Promise.resolve();
  const skew = (Math.atan((FOLD_SLANT * w) / h) * 180) / Math.PI;
  // p: 1 = page fully there, 0 = page gone. The fold's top edge sits at p·(1+s)·w − s·w.
  const shift = (p: number) => (p - 1) * (1 + FOLD_SLANT) * w;
  const ps = Array.from({ length: STEPS + 1 }, (_, i) => ({ p: from + ((to - from) * i) / STEPS, i }));
  // a little lift: the page drifts a few pixels with the fold, as before
  const lift = (i: number) => (direction === 'forward' ? -1 : 1) * 6 * Math.sin((i / STEPS) * Math.PI);
  const timing: KeyframeAnimationOptions = { duration: durationMs, easing, fill: 'forwards' };
  const a = fold.animate(
    ps.map(({ p, i }) => ({ transform: `translateX(${shift(p)}px) skewX(${skew}deg)`, offset: i / STEPS })),
    timing,
  );
  sheet.animate(
    ps.map(({ p, i }) => ({ transform: `skewX(${-skew}deg) translateX(${-shift(p) + lift(i)}px)`, offset: i / STEPS })),
    timing,
  );
  if (shadow) {
    const x = (p: number) => (p * (1 + FOLD_SLANT) - FOLD_SLANT) * w; // the fold's top; skew (origin top) carries the bottom
    shadow.animate(
      [
        { transform: `translateX(${x(from)}px) skewX(${skew}deg)`, opacity: from === 1 ? 0 : 0.9 },
        { opacity: 0.9, offset: 0.25 },
        { opacity: 0.9, offset: 0.75 },
        { transform: `translateX(${x(to)}px) skewX(${skew}deg)`, opacity: 0 },
      ],
      { duration: durationMs, easing, fill: 'forwards' },
    );
  }
  return a.finished.then(() => undefined, () => undefined);
}

/**
 * Reduced motion: the writing fades out, the (identical) sheets swap invisibly, the new writing fades in.
 * 200 ms in all; the paper and its rules never move and two pages of text are never on screen at once.
 */
async function dip(outgoing: HTMLElement | null, incoming: HTMLElement | null): Promise<void> {
  const ink = (leaf: HTMLElement | null) => (leaf ? [...leaf.querySelectorAll<HTMLElement>('.column, .margin-notes')] : []);
  const half = { duration: 100, easing: 'linear', fill: 'forwards' as const };
  if (incoming) {
    incoming.style.opacity = '0';
    for (const el of ink(incoming)) el.style.opacity = '0';
  }
  await Promise.all(ink(outgoing).map((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], half).finished.catch(() => undefined)));
  if (outgoing) outgoing.style.opacity = '0';
  if (incoming) incoming.style.opacity = '';
  await Promise.all(
    ink(incoming).map((el) => {
      el.style.opacity = '';
      return el.animate([{ opacity: 0 }, { opacity: 1 }], half).finished.catch(() => undefined);
    }),
  );
}
