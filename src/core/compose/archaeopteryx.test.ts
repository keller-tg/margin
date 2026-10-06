// Regression tests for the three composer problems found in the milestone-b review (2026-10-06),
// using the exact Archaeopteryx cases. RECORDED FIXTURE, see fixtures/README.md.
import { describe, expect, it } from 'vitest';
import recorded from '../../../fixtures/wikimedia/archaeopteryx-en.recorded.json';
import { PACE_IDS } from '../pace/pace';
import { verifyThing } from '../verify/verify';
import { isEtymology, lacksSubject } from './clean';
import { composeExtractive } from './compose';
import { extractFacts, isCodeNumber } from './facts';
import type { Packet } from './packet';
import { emptyCtx } from './testing';

function packet(slot: 'morning' | 'evening' = 'morning'): Packet {
  const { _FIXTURE, ...p } = structuredClone(recorded) as unknown as Packet & { _FIXTURE: string };
  void _FIXTURE;
  p.slot = slot;
  p.facts = extractFacts('en', [{ text: p.source.lead }, ...p.source.sections.map((s) => ({ text: s.text, section: s.heading }))], null);
  return p;
}
const thing = composeExtractive(packet()).thing;

describe('Archaeopteryx: big numbers', () => {
  const sentence = 'A thirteenth specimen, SMNK-PAL 10,000, was published in January 2025, this one from the Mörnsheim Formation.';
  it('a number inside a catalogue ID is a code, not a quantity', () => {
    expect(isCodeNumber(sentence, sentence.indexOf('10,000'))).toBe(true);
    expect(isCodeNumber('It grew to about 50 cm in length.', 'It grew to about '.length)).toBe(false);
  });
  it('no fact and no big-number page is made from SMNK-PAL 10,000', () => {
    expect(Object.values(packet().facts).some((f) => f.surface === '10,000')).toBe(false);
    for (const pace of PACE_IDS) for (const pg of thing.paces[pace]) if (pg.type === 'bignumber') expect(pg.display).not.toBe('10,000');
  });
});

describe('Archaeopteryx: timeline events need a subject', () => {
  it('flags the subjectless labels', () => {
    expect(lacksSubject('Placed on sale between 1877 and 1881.', 'en')).toBe(true);
    expect(lacksSubject('Described in 1884 by Wilhelm Dames, it is the most complete specimen.', 'en')).toBe(true);
    expect(lacksSubject('Consisting of a torso, the Maxberg Specimen was discovered in 1956 near Langenaltheim.', 'en')).toBe(false);
    expect(lacksSubject('The Haarlem Specimen was discovered in 1855 near Riedenburg, Germany.', 'en')).toBe(false);
  });
  it('no timeline in any pace carries them', () => {
    for (const pace of PACE_IDS)
      for (const pg of thing.paces[pace])
        if (pg.type === 'timeline') for (const e of pg.events) expect(lacksSubject(e.label, 'en'), e.label).toBe(false);
  });
});

describe('Archaeopteryx: the opener says what the thing is', () => {
  it('recognises the etymology sentence', () => {
    expect(isEtymology('The genus name derives from the Ancient Greek ἀρχαῖος, meaning ‘ancient’, and πτέρυξ, meaning ‘feather, wing’.', 'en')).toBe(true);
    expect(isEtymology('Archaeopteryx is an extinct genus of bird-like dinosaurs.', 'en')).toBe(false);
  });
  it('page 1 after the title is never etymology, and from Medium up it is the definition', () => {
    for (const pace of PACE_IDS) {
      const first = thing.paces[pace][1]!;
      const text = first.type === 'sentence' ? first.text : '';
      expect(isEtymology(text, 'en'), `${pace}: ${text}`).toBe(false);
    }
    const medium = thing.paces.medium[1]!;
    expect(medium.type === 'sentence' && medium.text).toMatch(/^Archaeopteryx\b.*\bis an extinct genus of bird-like dinosaurs\.$/);
  });
  it('etymology is never used outside Deep', () => {
    for (const pace of ['easy', 'medium'] as const)
      for (const pg of thing.paces[pace]) if (pg.type === 'sentence' || pg.type === 'closing') expect(isEtymology(pg.text, 'en')).toBe(false);
  });
  it('still verifies', () => {
    expect(verifyThing(thing, packet(), emptyCtx)).toEqual([]);
  });
});
