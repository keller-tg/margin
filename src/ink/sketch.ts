// Hand-drawn shapes as SVG path strings: a line that wobbles a little, a circle that doesn't quite close,
// a box with overshooting corners. Deterministic per seed (the same page always looks the same). Pure.
import { mulberry32 } from '../core/rng/rng';

const f = (n: number) => Math.round(n * 10) / 10;

/** A slightly bowed line from (x1,y1) to (x2,y2). */
export function sketchLine(x1: number, y1: number, x2: number, y2: number, seed: number, wobble = 1.6): string {
  const r = mulberry32(seed);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / (len || 1);
  const ny = (x2 - x1) / (len || 1);
  const bow = (r() - 0.5) * 2 * wobble * Math.min(1, len / 120);
  const t = 0.4 + r() * 0.2;
  const cx = x1 + (x2 - x1) * t + nx * bow * 2;
  const cy = y1 + (y2 - y1) * t + ny * bow * 2;
  const over = (r() - 0.3) * 2; // the pen overshoots or stops a touch short
  const ex = x2 + ((x2 - x1) / (len || 1)) * over;
  const ey = y2 + ((y2 - y1) / (len || 1)) * over;
  return `M${f(x1 + (r() - 0.5) * 1.2)} ${f(y1 + (r() - 0.5) * 1.2)} Q${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)}`;
}

/** A loop around a centre: an ellipse drawn in one stroke that overlaps where it started. */
export function sketchEllipse(cx: number, cy: number, rx: number, ry: number, seed: number): string {
  const r = mulberry32(seed);
  const start = r() * Math.PI * 2;
  const sweep = Math.PI * 2 * (1.08 + r() * 0.08); // a little more than once round
  const steps = 28;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = start + (sweep * i) / steps;
    const k = 1 + (r() - 0.5) * 0.05 + (i / steps) * 0.06; // the loop opens slightly as it goes
    pts.push(`${f(cx + Math.cos(a) * rx * k)} ${f(cy + Math.sin(a) * ry * k)}`);
  }
  return `M${pts[0]} ` + pts.slice(1).map((p) => `L${p}`).join(' ');
}

/** A box drawn as four strokes whose corners overshoot a little. */
export function sketchBox(x: number, y: number, w: number, h: number, seed: number): string {
  return [
    sketchLine(x, y, x + w, y, seed, 0.8),
    sketchLine(x + w, y, x + w, y + h, seed + 1, 0.8),
    sketchLine(x + w, y + h, x, y + h, seed + 2, 0.8),
    sketchLine(x, y + h, x, y, seed + 3, 0.8),
  ].join(' ');
}

/** A short flourish to end a piece of writing: a wave that tapers off. */
export function sketchFlourish(x: number, y: number, w: number, seed: number): string {
  const r = mulberry32(seed);
  const a = 3 + r() * 2;
  return `M${f(x)} ${f(y)} C${f(x + w * 0.2)} ${f(y - a)} ${f(x + w * 0.35)} ${f(y + a)} ${f(x + w * 0.5)} ${f(y)} S${f(x + w * 0.8)} ${f(y - a * 0.6)} ${f(x + w)} ${f(y + 0.5)}`;
}

/** A small tick for a timeline: a dot with a short tail. */
export function sketchDot(x: number, y: number, seed: number): string {
  const r = mulberry32(seed);
  return sketchEllipse(x, y, 3.2 + r() * 0.6, 3 + r() * 0.6, seed + 9);
}
