// Typographic normalisation shared by the content pipeline and the browser.
// Pure functions, no DOM, no Node APIs.

export type Lang = 'en' | 'de' | 'fr';

const NBSP = ' ';

/**
 * Swiss Standard German: no ß. Margin writes German the Swiss way everywhere (content and UI).
 * ẞ (capital sharp s) becomes "SS".
 */
export function toSwissGerman(text: string): string {
  return text.replace(/ẞ/g, 'SS').replace(/ß/g, 'ss');
}

/**
 * Fold text for source comparison: the verifier must treat "ß" and "ss" as equal,
 * because sources (de.wikipedia.org) use ß while Margin writes Swiss "ss".
 */
export function foldForCompare(text: string): string {
  return text.normalize('NFC').replace(/ẞ/g, 'SS').replace(/ß/g, 'ss');
}

const QUOTES: Record<Lang, { open: string; close: string; openInner: string; closeInner: string }> = {
  en: { open: '“', close: '”', openInner: '‘', closeInner: '’' },
  // Swiss German uses guillemets, without spaces.
  de: { open: '«', close: '»', openInner: '‹', closeInner: '›' },
  // French uses guillemets with a non-breaking space inside.
  fr: { open: `«${NBSP}`, close: `${NBSP}»`, openInner: '“', closeInner: '”' },
};

/** Replace straight double quotes with the language's quotes, alternating open/close. */
function smartDoubleQuotes(text: string, lang: Lang): string {
  const q = QUOTES[lang];
  let open = true;
  return text.replace(/"/g, () => {
    const out = open ? q.open : q.close;
    open = !open;
    return out;
  });
}

/** Straight apostrophes between letters (or after a letter, e.g. "dogs'") become ’. */
function smartApostrophes(text: string): string {
  return text.replace(/(\p{L})'(?=\p{L}|\s|$)/gu, '$1’');
}

/** Normalise the various foreign quote styles a source may contain into the target language's style. */
function unifyQuotes(text: string, lang: Lang): string {
  const q = QUOTES[lang];
  // Treat any recognised opening/closing double-quote mark as a pair delimiter.
  return text
    .replace(/[„“«]\s?/g, (m, offset: number, s: string) => {
      // “ is a closing quote in German sources („…“) – decide by context: preceded by a letter/punct = closing.
      const prev = s[offset - 1];
      if (m.startsWith('“') && prev !== undefined && /[\p{L}\p{N}.,!?…]/u.test(prev)) return q.close;
      return q.open;
    })
    .replace(/\s?[”»]/g, q.close);
}

/**
 * Normalise punctuation for a language:
 *  - smart quotes and apostrophes in the language's convention
 *  - "..." → "…", " - " → " – "
 *  - French: non-breaking space before ; : ! ? and inside « » (so a guillemet never strands at a line end)
 *  - German: Swiss spelling (ss), Swiss guillemets
 */
export function normalizeTypography(input: string, lang: Lang): string {
  let t = input.normalize('NFC');
  t = t.replace(/\.\.\./g, '…');
  t = t.replace(/ - /g, ' – ');
  t = smartApostrophes(t);
  t = smartDoubleQuotes(t, lang);
  t = unifyQuotes(t, lang);

  if (lang === 'fr') {
    // any (or no) space before high punctuation → one non-breaking space
    t = t.replace(/[   ]*([;:!?])(?=\s|$|[»"”])/g, `${NBSP}$1`);
    // tidy spaces around guillemets
    t = t.replace(/«[   ]*/g, `«${NBSP}`).replace(/[   ]*»/g, `${NBSP}»`);
  }
  if (lang === 'de') t = toSwissGerman(t);

  return t.replace(/ {2,}/g, ' ').trim();
}
