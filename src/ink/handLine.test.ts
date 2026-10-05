import { describe, expect, it } from 'vitest';
import { arrowPath, underlinePath } from './handLine';

describe('hand lines', () => {
  it('is deterministic per seed and varies across seeds', () => {
    expect(underlinePath(120, 3)).toBe(underlinePath(120, 3));
    expect(underlinePath(120, 3)).not.toBe(underlinePath(120, 4));
  });
  it('spans roughly the requested width', () => {
    const xs = [...underlinePath(200, 9).matchAll(/(-?[\d.]+) -?[\d.]+/g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(200);
  });
  it('arrow adds a head', () => {
    expect(arrowPath(100).split('M').length).toBe(3);
  });
});
