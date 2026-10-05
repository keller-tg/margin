import { describe, expect, it } from 'vitest';
import de from './de.json';
import en from './en.json';
import fr from './fr.json';
import { detectLang, formatHour, translate } from './i18n';

describe('i18n catalog', () => {
  it('every language has every key', () => {
    const keys = Object.keys(en).sort();
    expect(Object.keys(de).sort()).toEqual(keys);
    expect(Object.keys(fr).sort()).toEqual(keys);
  });
  it('German UI text is Swiss (no ß)', () => {
    for (const key of Object.keys(de) as (keyof typeof de)[]) expect(translate('de', key)).not.toMatch(/ß/);
  });
  it('interpolates', () => {
    expect(translate('en', 'landing.opensAt', { time: '5 pm' })).toBe('opens at 5 pm');
  });
});

describe('detectLang', () => {
  it('maps regional tags and falls back to English', () => {
    expect(detectLang(['de-CH', 'en'])).toBe('de');
    expect(detectLang(['fr-CH'])).toBe('fr');
    expect(detectLang(['it-CH', 'rm'])).toBe('en');
  });
});

describe('formatHour', () => {
  it('writes hours per language', () => {
    expect(formatHour('en', 17)).toBe('5 pm');
    expect(formatHour('de', 5)).toBe('5 Uhr');
    expect(formatHour('fr', 17)).toBe('17 h');
  });
});
