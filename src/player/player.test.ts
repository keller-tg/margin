import { describe, expect, it } from 'vitest';
import { mapIndex } from './Player';
import { clipFor, easeStroke } from './writing';

describe('mapIndex: switching pace keeps the relative position', () => {
  it('maps ends to ends and the middle to the middle', () => {
    expect(mapIndex(0, 7, 4)).toBe(0);
    expect(mapIndex(6, 7, 4)).toBe(3);
    expect(mapIndex(3, 7, 12)).toBe(6);
    expect(mapIndex(0, 1, 4)).toBe(0);
  });
});

describe('pen reveal geometry', () => {
  const lines = [
    { left: 0, right: 300, top: 10, bottom: 50 },
    { left: 0, right: 200, top: 82, bottom: 122 },
  ];
  it('keeps the previous line’s descenders visible while writing the next line', () => {
    const poly = clipFor(lines, 1, 100, 320, 8);
    // the full-width band reaches below line 0 (50 + 8 = 58), not just to line 1’s top minus pad (74)
    expect(poly).toContain('328px 74px');
    expect(clipFor([{ left: 0, right: 300, top: 10, bottom: 80 }, { left: 0, right: 200, top: 60, bottom: 100 }], 1, 100, 320, 8)).toContain('328px 88px');
  });
  it('the stroke eases from 0 to 1 without jumps', () => {
    let prev = 0;
    for (let k = 0; k <= 1.0001; k += 0.01) {
      const v = easeStroke(Math.min(1, k));
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(v - prev).toBeLessThan(0.03);
      prev = v;
    }
    expect(easeStroke(0)).toBe(0);
    expect(easeStroke(1)).toBeCloseTo(1);
  });
});
