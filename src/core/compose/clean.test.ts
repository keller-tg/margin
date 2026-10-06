import { describe, expect, it } from 'vitest';
import { cleanSentence, danglingPronoun, fitToWords } from './clean';

describe('cleanSentence', () => {
  it('drops parentheticals', () => {
    expect(cleanSentence('Ada Lovelace (10 December 1815 – 27 November 1852) was a mathematician.')).toBe('Ada Lovelace was a mathematician.');
  });
  it('rejects lists of abbreviations', () => {
    expect(cleanSentence('Synonyms include P. l. persica, P. l. senegalensis, P. l. kamptzi, and P. l. azandica.')).toBeNull();
  });
  it('rejects compounds broken by a removed parenthetical, keeps suspended hyphens', () => {
    expect(cleanSentence('Der Hopewell- (100 v. Chr.) folgte die Whittlesey-Kultur.')).toBeNull();
    expect(cleanSentence('Die Hopewell- und Adena-Kultur waren älter als diese.')).not.toBeNull();
  });
});

describe('danglingPronoun', () => {
  it('catches pronouns at the start and early in the sentence', () => {
    expect(danglingPronoun('It was built in 1889.', 'en')).toBe(true);
    expect(danglingPronoun('By 1804 he had produced 18 etchings.', 'en', 'Caspar David Friedrich')).toBe(true);
    expect(danglingPronoun('Lorsqu’elle revient, elle doit les défaire.', 'fr', 'Ornithorynque')).toBe(true);
  });
  it('accepts sentences that name the topic first', () => {
    expect(danglingPronoun('Friedrich settled in Dresden, where he lived.', 'en', 'Friedrich')).toBe(false);
    expect(danglingPronoun('Males are larger than females.', 'en', 'Electric eel')).toBe(false);
  });
});

describe('fitToWords', () => {
  it('never leaves an open relative clause', () => {
    const s = 'Caspar David Friedrich was a German Romantic landscape painter, generally considered the most important German artist of his generation, whose often symbolic, and anti-classical work, conveys a subjective, emotional response to the natural world.';
    const r = fitToWords(s, 25, 'en');
    expect(r?.text ?? '').not.toMatch(/whose often symbolic\.$/);
  });
  it('cuts at a clause boundary when it can', () => {
    expect(fitToWords('The tower was finished in 1889, and it was the tallest structure in the world for many years after that.', 8, 'en')).toEqual({ text: 'The tower was finished in 1889.', truncated: true });
  });
});
