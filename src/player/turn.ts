// The 2D page turn (plan §11). Forward: the current leaf peels away from its right edge along a slightly
// slanted fold (the top corner leads), uncovering the next leaf, with a soft shadow travelling on the fold.
// Backward: the previous leaf is laid back down, the same motion in reverse. Reduced motion: a 200 ms
// crossfade. Only clip-path, transform and opacity are animated (compositor-friendly).

export type TurnDirection = 'forward' | 'back';

const FOLD_SLANT = 0.1; // the fold's top runs ahead of its bottom by 10% of the width

function foldPolygon(p: number): string {
  // p: 1 = page fully there, 0 = page gone. The fold runs from (top) to (bottom).
  const top = p * (1 + FOLD_SLANT) - FOLD_SLANT;
  const bottom = p * (1 + FOLD_SLANT);
  const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
  return `polygon(0% 0%, ${pct(top)} 0%, ${pct(bottom)} 100%, 0% 100%)`;
}

const STEPS = 12;
const frames = (from: number, to: number) =>
  Array.from({ length: STEPS + 1 }, (_, i) => {
    const p = from + ((to - from) * i) / STEPS;
    return { clipPath: foldPolygon(p), offset: i / STEPS };
  });

/**
 * Animate a turn. `moving` is the leaf on top that peels away (forward) or lays down (back);
 * `shadow` is an absolutely positioned strip above both leaves that follows the fold.
 */
export function turnPage(opts: { moving: HTMLElement; under: HTMLElement | null; shadow: HTMLElement | null; direction: TurnDirection; reduced: boolean; durationMs: number }): Promise<void> {
  const { moving, under, shadow, direction, reduced, durationMs } = opts;
  if (reduced) return dip(direction === 'forward' ? moving : under, direction === 'forward' ? under : moving);
  const easing = 'cubic-bezier(0.32, 0.02, 0.24, 1)';
  const [from, to] = direction === 'forward' ? [1, 0] : [0, 1];
  const a = moving.animate(
    frames(from, to).map((f, i, all) => ({ ...f, transform: `translateX(${(direction === 'forward' ? -1 : 1) * 6 * Math.sin((i / (all.length - 1)) * Math.PI)}px)` })),
    { duration: durationMs, easing, fill: 'forwards' },
  );
  if (shadow) {
    const w = moving.offsetWidth;
    const h = moving.offsetHeight;
    const skew = (Math.atan((FOLD_SLANT * w) / Math.max(h, 1)) * 180) / Math.PI;
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
