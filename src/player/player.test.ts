import { describe, expect, it } from 'vitest';
import { mapIndex } from './Player';
import { cssTimeMs, easeStroke, lineBands } from './writing';

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
  it('keeps the previous line’s descenders: the next line’s band starts below them, and bands never overlap', () => {
    const bands = lineBands(lines, 8);
    // line 1’s band starts at line 0’s bottom + pad (50 + 8 = 58), not at its own top minus pad (74)
    expect(bands[1]!.top).toBe(58);
    expect(bands[0]!.bottom).toBe(58);
    expect(bands[0]!.top).toBeLessThan(0); // room for tall ascenders on the first line
    // deep descenders (line 0 reaching to 80) push line 1’s band down to 88
    expect(lineBands([{ left: 0, right: 300, top: 10, bottom: 80 }, { left: 0, right: 200, top: 60, bottom: 100 }], 8)[1]!.top).toBe(88);
  });
  it('reads CSS times in ms or s (the minifier turns 560ms into .56s)', () => {
    expect(cssTimeMs('560ms', 0)).toBe(560);
    expect(cssTimeMs('.56s', 0)).toBeCloseTo(560);
    expect(cssTimeMs(' 0.2s ', 0)).toBeCloseTo(200);
    expect(cssTimeMs('', 560)).toBe(560);
    expect(cssTimeMs('fast', 560)).toBe(560);
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
