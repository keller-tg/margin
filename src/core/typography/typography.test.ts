import { describe, expect, it } from 'vitest';
import { foldForCompare, normalizeTypography, toSwissGerman } from './typography';

const NBSP = ' ';

describe('toSwissGerman', () => {
  it('replaces ß and ẞ', () => {
    expect(toSwissGerman('Grösse? Größe, Straße, GROẞ')).toBe('Grösse? Grösse, Strasse, GROSS');
  });
});

describe('foldForCompare', () => {
  it('treats ß and ss as equal', () => {
    expect(foldForCompare('Straße')).toBe(foldForCompare('Strasse'));
    expect(foldForCompare('Fuß')).toBe('Fuss');
  });
  it('normalises composed and decomposed accents', () => {
    expect(foldForCompare('é')).toBe('é');
  });
});

describe('normalizeTypography', () => {
  it('English: curly quotes, apostrophes, ellipsis, dash', () => {
    expect(normalizeTypography(`It's "about 3 m" - roughly...`, 'en')).toBe('It’s “about 3 m” – roughly…');
  });

  it('German: Swiss guillemets and ss', () => {
    expect(normalizeTypography('Er sagte "groß".', 'de')).toBe('Er sagte «gross».');
    expect(normalizeTypography('Er sagte „groß“.', 'de')).toBe('Er sagte «gross».');
  });

  it('French: non-breaking spaces before high punctuation and inside guillemets', () => {
    const out = normalizeTypography('« Où est l\'œuvre ? » Ça m\'étonne !', 'fr');
    expect(out).toBe(`«${NBSP}Où est l’œuvre${NBSP}?${NBSP}» Ça m’étonne${NBSP}!`);
    // no ordinary (breakable) space may sit next to a guillemet
    expect(out).not.toMatch(/« | »/);
  });

  it('French: adds the missing space before a colon', () => {
    expect(normalizeTypography('Résultat: trois cœurs', 'fr')).toBe(`Résultat${NBSP}: trois cœurs`);
  });

  it('does not touch times or URLs in English', () => {
    expect(normalizeTypography('At 5:00, wake.', 'en')).toBe('At 5:00, wake.');
  });
});
