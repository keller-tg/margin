// Screening Rabbit Trail candidates (milestone e). The same rules as the daily pipeline, applied to
// whatever an article links to: no disambiguation, list or year pages, no living (or recently dead)
// people, the narrow category blocklist, the title/QID vetoes, and the review word scan on the text.
// Pure and isomorphic: the bake script and the visitor's browser run exactly this code.
import { cleanSentence, hasFiniteVerb, lacksSubject, proseForSplitting } from '../compose/clean';
import { REVIEW_WORDS } from '../review/words';
import { languageMismatch } from '../text/language';
import { countWords, splitSentences } from '../text/sentences';
import type { Lang } from '../typography/typography';

export type TrailRules = {
  titles: Set<string>;
  qids: Set<string>;
  /** The pipeline's narrow category blocklist (content/blocklist/categories.{lang}.txt). */
  categoryPatterns: RegExp[];
  /**
   * Trail only (content/blocklist/trail-topics.{lang}.txt): stands in for the pipeline's Vital-Articles
   * section exclusions (wars and military, crime, politics, weapons, drugs), which a trail stop never passes through.
   */
  topicPatterns: RegExp[];
};

/** Lines of a blocklist file: trimmed, no blanks, no `#` comments. */
export function ruleLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/** The rules from the raw blocklist files (content/blocklist/), parsed the way the pipeline parses them. */
export function trailRules(files: { titles: string; qids: string; categories: string; topics: string }): TrailRules {
  return {
    topicPatterns: ruleLines(files.topics).map((r) => new RegExp(r, 'iu')),
    titles: new Set(ruleLines(files.titles).map((t) => t.toLowerCase())),
    qids: new Set(ruleLines(files.qids).map((t) => t.split(/\s/)[0]!)),
    categoryPatterns: ruleLines(files.categories).map((r) => new RegExp(r, 'iu')),
  };
}

// Lists, timelines, years, decades and centuries are indexes, not things.
const LIST_OR_YEAR =
  /^(lists? of|liste (de|der|des|d’|d')|timeline of|chronologie|zeittafel|outline of|index of|glossary of|glossaire|glossar)\b|^\d{1,4}s?$|^\d{1,4} (bc|bce|ad|v\. chr\.|n\. chr\.|av\. j\.-c\.)$|^\d{1,4}er( jahre)?$|^années \d+|^\d{1,2}(st|nd|rd|th) century|^\d{1,2}\. jahrhundert|^[ivxlc]+e siècle/i;

export function isListOrYear(title: string): boolean {
  return LIST_OR_YEAR.test(title.trim());
}

/** Cheap checks on a bare link title, before any request: lists/years, vetoed titles, already visited. */
export function prefilterLinks(titles: readonly string[], rules: TrailRules, exclude: readonly string[]): string[] {
  const seen = new Set(exclude.map((t) => t.toLowerCase()));
  const out: string[] = [];
  for (const t of titles) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    if (isListOrYear(t) || rules.titles.has(k)) continue;
    out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------- people

// Each edition marks people with visible birth/death categories. A page with a birth (or "living")
// category is a person; a person passes only with a death year at least three calendar years back
// (≥ 2 full years, like the pipeline's Wikidata rule), or a death in an earlier century.
const BIRTH: Record<Lang, RegExp> = {
  en: /^(\d{1,4}s?( BC)? births|\d{1,2}(st|nd|rd|th)-century( BC)? births|year of birth (unknown|missing|uncertain)|living people)$/i,
  de: /^(geboren\b|lebende person$)/i,
  fr: /^(naissance (en|à|au|aux|dans)(?=\s)|date de naissance (inconnue|incertaine))/i,
};
const DEATH_YEAR: Record<Lang, RegExp> = {
  en: /^(\d{1,4})( BC)? deaths$/i,
  de: /^gestorben (\d{1,4})( v\. Chr\.)?$/i,
  fr: /^décès en (?:\p{L}+ )?(\d{1,4})( av\. J\.-C\.)?$/iu,
};
const DEATH_OLD: Record<Lang, RegExp> = {
  en: /^(\d{1,2}(st|nd|rd|th)-century( BC)? deaths|year of death unknown)$/i,
  de: /^gestorben im \d{1,2}\. jahrhundert/i,
  fr: /^(décès au [ivxlc]+e siècle|date de décès inconnue)/i,
};

export type PersonStatus = 'not-a-person' | 'dead-long-enough' | 'living-or-recent';

export function personStatus(categories: readonly string[], lang: Lang, thisYear: number): PersonStatus {
  const person = categories.some((c) => BIRTH[lang].test(c) || DEATH_YEAR[lang].test(c) || DEATH_OLD[lang].test(c));
  if (!person) return 'not-a-person';
  if (categories.some((c) => /^(living people|lebende person)$/i.test(c))) return 'living-or-recent';
  if (categories.some((c) => DEATH_OLD[lang].test(c))) return 'dead-long-enough';
  for (const c of categories) {
    const m = DEATH_YEAR[lang].exec(c);
    if (!m) continue;
    const bc = Boolean(m[2]);
    const year = bc ? -Number(m[1]) : Number(m[1]);
    if (year <= thisYear - 3) return 'dead-long-enough';
  }
  return 'living-or-recent';
}

// ---------------------------------------------------------------- page metadata

export type PageMeta = {
  title: string;
  missing: boolean;
  disambig: boolean;
  qid: string | null;
  categories: string[];
  description: string;
  revid: number;
  /** Page size in bytes (wikitext). */
  length: number;
};

/** Below this an article is a stub: too thin to be a stop worth walking to. */
export const MIN_PAGE_BYTES = 8000;

/** Why a page cannot be a trail stop, or null if it can (metadata only; the text is screened next). */
export function screenMeta(m: PageMeta, lang: Lang, rules: TrailRules, thisYear: number): string | null {
  if (m.missing) return 'missing';
  if (m.disambig) return 'disambiguation';
  if (isListOrYear(m.title)) return 'list-or-year';
  if (rules.titles.has(m.title.toLowerCase())) return 'blocklisted title';
  if (m.qid && rules.qids.has(m.qid)) return 'blocklisted qid';
  for (const c of m.categories) for (const re of rules.categoryPatterns) if (re.test(c)) return `blocklisted category "${c}"`;
  for (const c of m.categories) for (const re of rules.topicPatterns) if (re.test(c)) return `trail topic rule "${c}"`;
  if (m.length < MIN_PAGE_BYTES) return 'stub';
  if (personStatus(m.categories, lang, thisYear) === 'living-or-recent') return 'person-living-or-recent';
  return null;
}

// ---------------------------------------------------------------- text

export const MAX_SEED_SENTENCES = 6;
export const MIN_SEED_SENTENCES = 2;
export const MIN_SEED_WORDS = 30;

/** The usable sentences of a lead, in order: cleaned like the composer cleans them. */
export function leadSentences(extract: string, lang: Lang): string[] {
  const out: string[] = [];
  for (const raw of splitSentences(proseForSplitting(extract), lang)) {
    const c = cleanSentence(raw);
    if (!c || lacksSubject(c, lang) || !hasFiniteVerb(c, lang) || languageMismatch(c, lang)) continue;
    out.push(c);
    if (out.length >= MAX_SEED_SENTENCES) break;
  }
  return out;
}

/** Screen a lead: the review word scan over the whole lead, then "decent length". */
export function screenText(extract: string, lang: Lang): { ok: true; sentences: string[] } | { ok: false; reason: string } {
  const re = REVIEW_WORDS[lang];
  re.lastIndex = 0;
  const hit = re.exec(extract);
  re.lastIndex = 0;
  if (hit) return { ok: false, reason: `review word "${hit[1]!.toLowerCase()}"` };
  const sentences = leadSentences(extract, lang);
  if (sentences.length < MIN_SEED_SENTENCES) return { ok: false, reason: 'too few usable sentences' };
  if (countWords(sentences.join(' ')) < MIN_SEED_WORDS) return { ok: false, reason: 'too short' };
  return { ok: true, sentences };
}
