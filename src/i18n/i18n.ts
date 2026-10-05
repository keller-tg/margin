// Tiny i18n: flat JSON per language, {placeholders}, typography normalised per language on load.
// Add a language: drop in xx.json, add it to LANGS, add its typography rules in core/typography.
import { normalizeTypography, type Lang } from '../core/typography/typography';
import de from './de.json';
import en from './en.json';
import fr from './fr.json';

export const LANGS = ['en', 'de', 'fr'] as const satisfies readonly Lang[];
export type MessageKey = keyof typeof en;
type Messages = Record<MessageKey, string>;

const prepare = (lang: Lang, m: Messages): Messages =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, normalizeTypography(v, lang)])) as Messages;

const CATALOG: Record<Lang, Messages> = {
  en: prepare('en', en),
  de: prepare('de', de satisfies Messages),
  fr: prepare('fr', fr satisfies Messages),
};

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string>): string {
  const s = CATALOG[lang][key] ?? CATALOG.en[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`) : s;
}

export function isLang(x: unknown): x is Lang {
  return typeof x === 'string' && (LANGS as readonly string[]).includes(x);
}

/** First supported language from the browser's preferences (de-CH → de, fr-CH → fr), else English. */
export function detectLang(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

/** Time of day in the language's handwriting style: "5 am" / "5 Uhr" / "5 h". */
export function formatHour(lang: Lang, hour: number): string {
  if (lang === 'de') return `${hour} Uhr`;
  if (lang === 'fr') return `${hour} h`;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'am' : 'pm'}`;
}

/** A date written the way you'd write it in a notebook margin: "6 Oct" / "6. Okt." / "6 oct." */
export function formatMarginDate(lang: Lang, date: Date): string {
  const s = new Intl.DateTimeFormat(lang === 'de' ? 'de-CH' : lang, { day: 'numeric', month: 'short' }).format(date);
  return normalizeTypography(s, lang);
}
