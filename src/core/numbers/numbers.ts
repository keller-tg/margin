// Numbers, measures and years in en/de/fr prose. Pure, isomorphic.
// Used twice: to extract facts from sources, and by the verifier to check every number in a text.
import type { Lang } from '../typography/typography';

const SP = '[   ]';
// 1,234,567 · 1.234.567 · 1'234 · 1’234 · 1 234 · 12.5 · 12,5 · 1234
const NUM = String.raw`\d{1,3}(?:(?:,|\.|'|’|${SP})\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?`;

const SCALE: Record<string, number> = {
  thousand: 1e3, million: 1e6, millions: 1e6, billion: 1e9, billions: 1e9, trillion: 1e12,
  tausend: 1e3, mio: 1e6, million_de: 1e6, millionen: 1e6, milliarde: 1e9, milliarden: 1e9, mrd: 1e9, billionen: 1e12,
  mille: 1e3, milliers: 1e3, milliard: 1e9, milliards: 1e9,
};

const UNITS = [
  'km²', 'km2', 'm²', 'm2', 'km/h', 'km', 'cm', 'mm', 'µm', 'nm', 'm', 'kg', 'mg', 'g', 't', 'ha', 'l', 'ml', '°C', '°F', 'K', '%',
  'kilometres', 'kilometers', 'kilometre', 'kilometer', 'metres', 'meters', 'metre', 'meter', 'centimetres', 'centimeters',
  'millimetres', 'millimeters', 'feet', 'foot', 'ft', 'miles', 'mile', 'mi', 'inches', 'inch', 'kilograms', 'kilogram',
  'grams', 'tonnes', 'tons', 'tonnen', 'hectares', 'hektar', 'litres', 'liters', 'liter', 'litre', 'degrees', 'percent',
  'per cent', 'square kilometres', 'square kilometers', 'square miles', 'years', 'year', 'jahre', 'jahren', 'ans', 'années',
  'kilomètres', 'kilomètre', 'mètres', 'mètre', 'centimètres', 'kilogrammes', 'grammes', 'quadratkilometer', 'quadratkilometern',
  'prozent', 'pour cent', 'grad', 'species', 'arten', 'espèces', 'light-years', 'lichtjahre', 'années-lumière', 'au',
  'kelvin', 'hz', 'kHz', 'mhz', 'watts', 'kw', 'mw', 'gw', 'v', 'volts', 'km/s', 'm/s', 'm/s²',
];
const UNIT_RE = UNITS.slice()
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
  .join('|');

const NUMBER_RE = new RegExp(String.raw`(?<![\p{L}\p{N}])(${NUM})(?:${SP}?(${Object.keys(SCALE).filter((k) => !k.includes('_')).join('|')})\b)?(?:${SP}?(${UNIT_RE})(?![\p{L}]))?`, 'giu');

export type NumberHit = {
  surface: string;
  index: number;
  /** The value read with this language's separators. */
  value: number;
  /** Every value the digits could plausibly mean in any of the three locales (for the verifier). */
  readings: number[];
  unit?: string;
  isYear: boolean;
};

/** Parse a digit string under one convention: thousands separator `thou`, decimal mark `dec`. */
function parseWith(s: string, thou: RegExp, dec: string): number {
  const t = s.replace(thou, '').replace(dec, '.');
  return Number(t);
}

function readingsOf(raw: string): number[] {
  const out = new Set<number>();
  const plain = raw.replace(/[   '’]/g, '');
  out.add(parseWith(plain, /,/g, '.')); // en: 1,234.5
  out.add(parseWith(plain, /\./g, ',')); // de/fr: 1.234,5
  if (/^\d+[.,]\d+$/.test(plain)) out.add(Number(plain.replace(',', '.'))); // bare decimal either way
  return [...out].filter(Number.isFinite);
}

function localValue(raw: string, lang: Lang): number {
  const plain = raw.replace(/[   '’]/g, '');
  if (lang === 'en') return parseWith(plain, /,/g, '.');
  // de/fr: "." groups thousands only when followed by exactly 3 digits
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(plain)) return parseWith(plain, /\./g, ',');
  return Number(plain.replace(',', '.'));
}

export function findNumbers(text: string, lang: Lang): NumberHit[] {
  const hits: NumberHit[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const raw = m[1]!;
    const scale = m[2] ? SCALE[m[2].toLowerCase()] ?? 1 : 1;
    const unit = m[3];
    const value = localValue(raw, lang) * scale;
    const readings = readingsOf(raw).map((r) => r * scale);
    const isYear = !unit && scale === 1 && /^\d{3,4}$/.test(raw) && value >= 500 && value <= 2100;
    hits.push({ surface: m[0].trim(), index: m.index!, value, readings, unit: unit?.toLowerCase(), isYear });
  }
  return hits;
}

// Number words from two upward ("one/ein/un" are skipped: in de/fr they are also the article).
export const NUMBER_WORDS: Record<Lang, Record<string, number>> = {
  en: { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
    dozen: 12, twice: 2, double: 2, half: 0.5, third: 3, fourth: 4, fifth: 5, second: 2 },
  de: { zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
    zwanzig: 20, dreissig: 30, dreißig: 30, vierzig: 40, fünfzig: 50, hundert: 100, tausend: 1000, doppelt: 2, halb: 0.5,
    zweite: 2, dritte: 3, vierte: 4, fünfte: 5 },
  fr: { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
    vingt: 20, trente: 30, quarante: 40, cinquante: 50, cent: 100, mille: 1000, double: 2, moitié: 0.5,
    deuxième: 2, troisième: 3, quatrième: 4, cinquième: 5, second: 2, seconde: 2 },
};

export function findNumberWords(text: string, lang: Lang): { word: string; value: number }[] {
  const dict = NUMBER_WORDS[lang];
  const out: { word: string; value: number }[] = [];
  for (const m of text.toLowerCase().matchAll(/[\p{L}]+/gu)) {
    const v = dict[m[0]];
    if (v !== undefined) out.push({ word: m[0], value: v });
  }
  return out;
}

// Centuries and decades: "19th century", "19. Jahrhundert", "XIXe siècle", "1870s", "1870er", "années 1870".
const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
export function romanToInt(r: string): number {
  let n = 0;
  for (let i = 0; i < r.length; i++) {
    const a = ROMAN[r[i]!] ?? 0;
    const b = ROMAN[r[i + 1]!] ?? 0;
    n += a < b ? -a : a;
  }
  return n;
}

export type Period = { kind: 'century' | 'decade'; value: number; surface: string };

export function findPeriods(text: string): Period[] {
  const out: Period[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th|\.|e|er|ème)?[  -]*(century|centuries|jahrhundert|jahrhunderts|siècle|siècles)\b/giu))
    out.push({ kind: 'century', value: Number(m[1]), surface: m[0] });
  for (const m of text.matchAll(/\b([IVXLC]+)(?:e|ème)?[  ]+(siècle|siècles|jahrhundert)\b/gu))
    out.push({ kind: 'century', value: romanToInt(m[1]!), surface: m[0] });
  for (const m of text.matchAll(/\b(\d{3}0)(?:s|’s|'s|er|er-jahre|er jahre)\b/giu)) out.push({ kind: 'decade', value: Number(m[1]), surface: m[0] });
  for (const m of text.matchAll(/\bannées[  ](\d{3}0)\b/giu)) out.push({ kind: 'decade', value: Number(m[1]), surface: m[0] });
  return out;
}

export const HEDGES: Record<Lang, string[]> = {
  en: ['about', 'around', 'nearly', 'almost', 'roughly', 'approximately', 'some', 'over', 'more than', 'less than', 'under', 'up to'],
  de: ['etwa', 'rund', 'fast', 'knapp', 'ungefähr', 'circa', 'ca.', 'über', 'mehr als', 'weniger als', 'bis zu', 'gut'],
  fr: ['environ', 'près de', 'presque', 'quelque', 'quelques', 'plus de', 'moins de', 'jusqu’à', "jusqu'à", 'autour de'],
};
