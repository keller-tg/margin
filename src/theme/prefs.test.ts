import { describe, expect, it } from 'vitest';
import { defaultPrefs, parsePrefs } from './prefs';

describe('prefs', () => {
  const fallback = defaultPrefs(['fr-CH']);
  it('defaults from the browser language', () => {
    expect(fallback.lang).toBe('fr');
    expect(fallback.paper).toBe('lined');
  });
  it('survives garbage', () => {
    expect(parsePrefs('{nope', fallback)).toEqual(fallback);
    expect(parsePrefs(null, fallback)).toEqual(fallback);
  });
  it('keeps valid values and drops unknown ones', () => {
    const p = parsePrefs(JSON.stringify({ lang: 'de', ink: 'sepia', paper: 'papyrus', theme: 'dark' }), fallback);
    expect(p).toMatchObject({ lang: 'de', ink: 'sepia', paper: 'lined', theme: 'dark' });
  });
});
