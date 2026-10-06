// Sentence splitting and word counting for en/de/fr. Pure, isomorphic.
import type { Lang } from '../typography/typography';

/**
 * A word is a whitespace-separated token containing at least one letter or digit,
 * so "l’œuvre" is one word and "1,024" is one word (plan §4).
 */
export function countWords(text: string): number {
  return text.split(/[\s  ]+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

// Lower-cased tokens (without their final dot) that never end a sentence.
const ABBREV: Record<Lang, string[]> = {
  en: ['mr', 'mrs', 'ms', 'dr', 'st', 'mt', 'jr', 'sr', 'vs', 'e.g', 'i.e', 'c', 'ca', 'approx', 'no', 'nos', 'vol',
    'fig', 'u.s', 'u.k', 'inc', 'ltd', 'co', 'corp', 'gen', 'col', 'lt', 'sgt', 'capt', 'rev', 'prof', 'jan', 'feb',
    'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'a.m', 'p.m', 'ft', 'est', 'op', 'cf', 'al', 'lit', 'var', 'subsp', 'sp', 'spp'],
  de: ['z.b', 'z', 'b', 'u.a', 'u', 'a', 'd.h', 'd', 'h', 'bzw', 'ca', 'nr', 'st', 'dr', 'prof', 'v', 'n', 'chr',
    'jh', 'jhd', 'usw', 'sog', 'evtl', 'ggf', 'vgl', 'mio', 'mrd', 'tsd', 'geb', 'gest', 'hl', 'bzw', 'inkl', 'max',
    'min', 'etc', 'o.ä', 'u.ä', 'insb', 'zw', 'gegr', 'lat', 'griech', 'engl', 'franz', 'altgr', 'mhd', 'ahd', 'wörtl', 'lit', 'bzw', 'sp', 'spp'],
  fr: ['m', 'mm', 'mme', 'mlle', 'dr', 'st', 'ste', 'env', 'cf', 'p', 'ex', 'p.ex', 'n°', 'no', 'vol', 'av', 'apr',
    'ap', 'etc', 'éd', 'chap', 'cie', 'gr', 'lat', 'angl', 'all', 'mgr', 'litt', 'lit', 'sp', 'spp'],
};

const CLOSERS = `"'”’»)\\]›`;
const BOUNDARY = new RegExp(`([.!?…])([${CLOSERS}]*)(\\s+)(?=[\\p{Lu}\\p{N}"„“«‹(\\[‘'])`, 'gu');

/** Split prose into sentences, respecting per-language abbreviations, initials and German ordinals. */
export function splitSentences(text: string, lang: Lang): string[] {
  const abbrev = new Set(ABBREV[lang]);
  const out: string[] = [];
  let start = 0;
  for (const m of text.matchAll(BOUNDARY)) {
    const end = m.index! + m[1]!.length + m[2]!.length;
    const before = text.slice(start, m.index! + 1);
    const lastTok = (before.match(/(\S+)$/)?.[1] ?? '').replace(/^[(\["'„“«]+/, '');
    const bare = lastTok.replace(/\.$/, '').toLowerCase();
    if (m[1] === '.') {
      if (abbrev.has(bare)) continue;
      if (/^\p{Lu}$/u.test(lastTok.replace(/\.$/, ''))) continue; // initial: "J. S. Bach"
      if (/^(\p{L}\.){2,}$/u.test(lastTok)) continue; // "U.S." "z.B."
      if (lang === 'de' && /^\d{1,2}\.$/.test(lastTok)) continue; // ordinal: "am 5. Mai", "19. Jahrhundert"
      if (lang === 'fr' && /^\d+e\.?$/.test(lastTok)) continue;
    }
    const s = text.slice(start, end).trim();
    if (s) out.push(s);
    start = end + m[3]!.length;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}
