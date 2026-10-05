// A short hand-drawn stroke (underline / arrow), deterministic per seed. Pure.
// rough.js takes over for richer marks in the player; this keeps the landing page dependency-free.

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => Math.round(n * 10) / 10;

/** An underline from x=0 to x=width around y=0, with a slight wobble and a lifted pen at the end. */
export function underlinePath(width: number, seed = 1): string {
  const r = rng(seed);
  const y0 = (r() - 0.5) * 1.6;
  const y1 = (r() - 0.5) * 1.6 - 0.6;
  const cx = width * (0.35 + r() * 0.3);
  const cy = (r() - 0.3) * 3.2;
  return `M${f(-2 - r() * 2)} ${f(y0)} Q${f(cx)} ${f(cy)} ${f(width + 2 + r() * 3)} ${f(y1)}`;
}

/** An underline that turns into an arrowhead at its right end. */
export function arrowPath(width: number, seed = 1): string {
  const r = rng(seed + 7);
  const end = width + 4;
  const endY = -0.8 + (r() - 0.5);
  const head = 7 + r() * 2;
  return (
    underlinePath(width, seed) +
    ` M${f(end - head)} ${f(endY - head * 0.62)} L${f(end + 2)} ${f(endY)} L${f(end - head * 0.95)} ${f(endY + head * 0.5)}`
  );
}
