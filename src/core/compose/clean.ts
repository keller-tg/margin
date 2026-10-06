// Making extracted Wikipedia sentences fit for a notebook page. Pure, isomorphic.
import { countWords } from '../text/sentences';
import type { Lang } from '../typography/typography';

/** Remove balanced parentheticals and square brackets: pronunciations, life dates, citations. */
export function dropParentheticals(s: string): string {
  let out = s;
  for (let i = 0; i < 4; i++) {
    const next = out.replace(/\s*\([^()]*\)/g, '').replace(/\s*\[[^[\]]*\]/g, '');
    if (next === out) break;
    out = next;
  }
  return out;
}

export function tidy(s: string): string {
  return s
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,;:\s]+/, '')
    .trim();
}

/** A sentence as it can stand on a page, or null if it cannot. */
export function cleanSentence(raw: string): string | null {
  const s = tidy(dropParentheticals(raw.replace(/\s*\n\s*/g, ' ')));
  if (/[()[\]{}]|==|\|/.test(s)) return null; // leftovers of markup or unbalanced brackets
  if (/\p{L}-\s(?!(und|oder|bzw|sowie|and|or|et|ou)\b)/u.test(s)) return null; // "Hopewell- folgte": a compound broken by a removed parenthetical
  if ((s.match(/(^|\s)\p{L}\.(?=\s)/gu) ?? []).length >= 3) return null; // "P. l. persica, P. l. kamptzi": lists of abbreviations
  if (!/[.!?…]$/.test(s)) return null;
  if (countWords(s) < 4) return null;
  return s;
}

const PRONOUN_START: Record<Lang, RegExp> = {
  en: /^(it|its|he|she|his|her|they|their|this|these|those|such|there)\b/i,
  de: /^(er|sie|es|sein|seine|ihr|ihre|dieser|diese|dieses|dort|deren|dessen|damit|dabei|daher)\b/i,
  fr: /^(il|elle|ils|elles|son|sa|ses|leur|leurs|ce|cette|ces|celui|celle|ceux|on|y)\b/i,
};

// Subject/possessive pronouns that need an antecedent when they appear early in a sentence.
const PRONOUN_EARLY: Record<Lang, RegExp> = {
  en: /^(he|she|it|they|his|her|its|their|them|him)$/i,
  de: /^(er|sie|es|ihr|ihre|sein|seine|ihm|ihn)$/i,
  fr: /^(il|elle|ils|elles|lui|leur|leurs|son|sa|ses)$/i,
};

/**
 * Needs an antecedent: starts with a pronoun ("It was…"), or has a subject pronoun within its first
 * six words ("Lorsqu’elle revient, elle…", "By 1804 he had…") before naming the topic itself.
 */
export function danglingPronoun(s: string, lang: Lang, topic?: string): boolean {
  const t = s.replace(/^[«„“"\s]+/, '');
  if (PRONOUN_START[lang].test(t)) return true;
  const words = t.split(/[\s,;:’']+/).slice(0, 6);
  const topicWord = topic?.split(/\s+/)[0]?.toLowerCase();
  for (const w of words) {
    if (topicWord && w.toLowerCase().startsWith(topicWord.slice(0, Math.max(4, topicWord.length - 2)))) return false;
    if (PRONOUN_EARLY[lang].test(w)) return true;
  }
  return false;
}

const CLAUSE_BREAK: Record<Lang, RegExp> = {
  en: /(,|;| –| —)\s+(?=(and|but|which|while|where|whereas|although|making|with|as|who)\b)|;\s+|\s+–\s+|\s+—\s+/gi,
  de: /(,|;| –)\s+(?=(und|aber|wobei|während|womit|die|der|das|welche|welcher|was|wo|sodass|so dass)\b)|;\s+|\s+–\s+/gi,
  fr: /(,|;| –)\s+(?=(et|mais|qui|dont|où|tandis|alors|ce qui|lequel|laquelle|avec)\b)|;\s+|\s+–\s+/gi,
};

/**
 * Shorten a sentence to at most `max` words by cutting at a clause boundary.
 * Returns null if no cut leaves a main clause of at least 5 words. Never cuts mid-clause.
 */
export function fitToWords(s: string, max: number, lang: Lang): { text: string; truncated: boolean } | null {
  if (countWords(s) <= max) return { text: s, truncated: false };
  const cuts: number[] = [];
  for (const m of s.matchAll(CLAUSE_BREAK[lang])) cuts.push(m.index!);
  for (const at of cuts.reverse()) {
    const head = tidy(s.slice(0, at));
    const words = countWords(head);
    const lastSeg = head.split(/,\s*/).pop() ?? '';
    const openRelative = /^(whose|which|who|whom|where|that|dont|qui|où|lequel|laquelle|welche[rsn]?|deren|dessen|wo)\b/i.test(lastSeg) && head.includes(',');
    if (words <= max && words >= 5 && !openRelative && !/\b(the|a|an|of|der|die|das|des|le|la|les|de|du)$/i.test(head)) {
      return { text: head.replace(/[,;:–—\s]+$/, '') + '.', truncated: true };
    }
  }
  return null;
}

/** "order of cephalopods" → "Order of cephalopods" (descriptions are lower-case by convention). */
export function capitalizeFirst(s: string): string {
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}
