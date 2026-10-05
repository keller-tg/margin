import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { baselineInLineBox, HAND_METRICS, inkShift, ruleOffset } from './baseline';
import metrics from './font-metrics.json';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const cssVar = (name: string, block = css) => {
  const m = block.match(new RegExp(`${name}:\\s*([\\d.]+)`));
  return m ? Number(m[1]) : NaN;
};

describe('baseline math', () => {
  it('matches the hand-checked value for Caveat 30px on a 36px rule', () => {
    expect(baselineInLineBox(36, 30, HAND_METRICS.caveat)).toBeCloseTo(27.9, 5);
  });

  it('puts a one-rule line exactly on the rule (zero shift)', () => {
    expect(inkShift(36, 1, 29, 29, HAND_METRICS.caveat)).toBeCloseTo(0, 9);
  });

  it('puts multi-rule titles on a rule too', () => {
    for (const n of [2, 3]) {
      for (const size of [40, 54, 70]) {
        const shift = inkShift(40, n, size, 32, HAND_METRICS.caveat);
        const baseline = baselineInLineBox(n * 40, size, HAND_METRICS.caveat) + shift;
        // baseline position within the block, modulo the rule, equals the rule offset
        expect(((baseline % 40) + 40) % 40).toBeCloseTo(ruleOffset(40, 32, HAND_METRICS.caveat) % 40, 6);
      }
    }
  });
});

describe('tokens.css stays in sync with the font files', () => {
  it('Caveat metrics', () => {
    expect(cssVar('--asc')).toBe(metrics.Caveat.ascent);
    expect(cssVar('--desc')).toBe(metrics.Caveat.descent);
  });
  it('Inter metrics', () => {
    expect(cssVar('--asc-ui')).toBeCloseTo(metrics.Inter.ascent, 3);
    expect(cssVar('--desc-ui')).toBeCloseTo(metrics.Inter.descent, 3);
  });
  it('Playpen metrics', () => {
    const block = css.slice(css.indexOf(":root[data-hand='playpen']"));
    expect(cssVar('--asc', block)).toBe(metrics['Playpen Sans'].ascent);
    expect(cssVar('--desc', block)).toBe(metrics['Playpen Sans'].descent);
  });
  it('@font-face overrides equal the real metrics', () => {
    expect(css).toContain(`ascent-override: ${Math.round(metrics.Caveat.ascent * 100)}%`);
    expect(css).toContain(`descent-override: ${Math.round(metrics.Caveat.descent * 100)}%`);
  });
});
