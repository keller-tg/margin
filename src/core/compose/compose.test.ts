import { describe, expect, it } from 'vitest';
import { PACES, pageRange } from '../pace/pace';
import type { PaceId } from '../schema/thing';
import { countWords } from '../text/sentences';
import { pageTexts, verifyThing } from '../verify/verify';
import { composeExtractive } from './compose';
import { emptyCtx, fixturePacket } from './testing';

describe('composeExtractive', () => {
  for (const slot of ['morning', 'evening'] as const) {
    it(`${slot}: meets page counts and word limits, and verifies`, () => {
      const { thing } = composeExtractive(fixturePacket(slot));
      for (const pace of ['easy', 'medium', 'deep'] as PaceId[]) {
        const [min, max] = pageRange(pace, slot);
        const pages = thing.paces[pace];
        expect(pages.length).toBeGreaterThanOrEqual(min);
        expect(pages.length).toBeLessThanOrEqual(max);
        expect(pages[0]?.type).toBe('title');
        expect(pages.at(-1)?.type).toBe('closing');
        for (const pg of pages) for (const t of pageTexts(pg)) expect(countWords(t.text)).toBeLessThanOrEqual(PACES[pace].maxWords);
      }
      expect(verifyThing(thing, fixturePacket(slot), emptyCtx)).toEqual([]);
    });
  }
  it('is deterministic', () => {
    expect(composeExtractive(fixturePacket())).toEqual(composeExtractive(fixturePacket()));
  });
  it('uses a big number from a measure fact', () => {
    const { thing } = composeExtractive(fixturePacket());
    const big = thing.paces.medium.find((p) => p.type === 'bignumber');
    expect(big && big.type === 'bignumber' && big.display).toMatch(/metres|years|kilometres/);
  });
  it('never puts a dangling pronoun first', () => {
    const { thing } = composeExtractive(fixturePacket());
    const first = thing.paces.easy[1];
    expect(first?.type === 'sentence' && first.text).not.toMatch(/^(They|It|Their)\b/);
  });
});
