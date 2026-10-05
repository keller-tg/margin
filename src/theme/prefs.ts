// Local preferences. Stored in localStorage only; every read/write is guarded so private windows still work.
import type { Lang } from '../core/typography/typography';
import { detectLang, isLang } from '../i18n/i18n';

export type ThemePref = 'system' | 'light' | 'dark';
export type Ink = 'graphite' | 'blueblack' | 'sepia';
export type PaperType = 'lined' | 'dotted' | 'grid' | 'blank';
export type Hand = 'caveat' | 'playpen';
export type MotionPref = 'system' | 'on' | 'off';

export type Prefs = {
  lang: Lang;
  theme: ThemePref;
  ink: Ink;
  paper: PaperType;
  hand: Hand;
  motion: MotionPref;
};

export const PREFS_KEY = 'margin.prefs.v1';

const ONE_OF = {
  theme: ['system', 'light', 'dark'],
  ink: ['graphite', 'blueblack', 'sepia'],
  paper: ['lined', 'dotted', 'grid', 'blank'],
  hand: ['caveat', 'playpen'],
  motion: ['system', 'on', 'off'],
} as const;

export function defaultPrefs(browserLangs: readonly string[] = []): Prefs {
  return { lang: detectLang(browserLangs), theme: 'system', ink: 'graphite', paper: 'lined', hand: 'caveat', motion: 'system' };
}

/** Parse stored prefs, dropping anything unknown (old versions, hand edits) back to defaults. */
export function parsePrefs(raw: string | null, fallback: Prefs): Prefs {
  if (!raw) return fallback;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fallback;
  }
  const pick = <K extends keyof typeof ONE_OF>(k: K): Prefs[K] =>
    ((ONE_OF[k] as readonly string[]).includes(data[k] as string) ? data[k] : fallback[k]) as Prefs[K];
  return {
    lang: isLang(data.lang) ? data.lang : fallback.lang,
    theme: pick('theme'),
    ink: pick('ink'),
    paper: pick('paper'),
    hand: pick('hand'),
    motion: pick('motion'),
  };
}

export function loadPrefs(): Prefs {
  const fallback = defaultPrefs(typeof navigator === 'undefined' ? [] : navigator.languages);
  try {
    return parsePrefs(localStorage.getItem(PREFS_KEY), fallback);
  } catch {
    return fallback;
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: preferences just won't persist */
  }
}

/** Reflect prefs on <html> so CSS tokens switch without React re-rendering the paper. */
export function applyPrefs(p: Prefs, root: HTMLElement = document.documentElement): void {
  root.lang = p.lang === 'de' ? 'de-CH' : p.lang;
  if (p.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = p.theme;
  root.dataset.ink = p.ink;
  root.dataset.hand = p.hand;
  if (p.motion === 'system') delete root.dataset.motion;
  else root.dataset.motion = p.motion;
}
