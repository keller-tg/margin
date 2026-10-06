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
  if (/^\d{3,4}(\s*[-–]\s*\d{2,4})?\s*:/.test(s)) return null; // "1506-1516 : curé de Glaris." — a chronology item
  if ((s.match(/\s[–—]\s/g) ?? []).length >= 2) return null; // "Mount Forbes – … Peyto-Gletscher – …": a list flattened into one line
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
    // the cut must keep the subject ("Placed on sale…, the X was…") and a main clause
    // ("Mary Wollstonecraft, née le …, un quartier du Grand Londres." has neither verb nor copula)
    const nameThenAppositive = /^[^,]{2,40}, (née?|born|geboren|geb\.|un|une|a|an|ein|eine)(?=\s)/iu.test(head) && copulaMatch(head, lang) === null;
    const fragment = lacksSubject(head + '.', lang) || nameThenAppositive || !hasFiniteVerb(head, lang);
    if (words <= max && words >= 5 && !openRelative && !fragment && !/\b(the|a|an|of|der|die|das|des|le|la|les|de|du)$/i.test(head)) {
      return { text: head.replace(/[,;:–—\s]+$/, '') + '.', truncated: true };
    }
  }
  return null;
}

const B = (alts: string) => new RegExp(`(?<![\\p{L}’'])(${alts})(?![\\p{L}])`, 'u');
// Rough finite-verb signals; used only to refuse sentences and clause cuts without a verb.
// STRONG forms count anywhere. WEAK forms (just a verb-like ending) count only when the word before
// is not an article or preposition: "en forme de disque" has no verb, "la Terre forme" has one.
const STRONG_VERB: Record<Lang, RegExp> = {
  en: B('is|are|was|were|has|have|had|can|could|will|would|may|might|does|did|became|becomes|remains|lies|lives|grows'),
  de: B('ist|sind|war|waren|hat|haben|hatte|hatten|wird|werden|wurde|wurden|kann|können|lebt|liegt|gilt'),
  fr: B('est|sont|était|étaient|a|ont|avait|avaient|fut|furent|sera|seront|peut|peuvent|vit|vivent'),
};
const WEAK_VERB: Record<Lang, RegExp> = {
  en: /^\p{Ll}{2,}(ed|s)$/u,
  de: /^\p{Ll}{2,}(t|en)$/u,
  fr: /^\p{Ll}{2,}(ent|ait|aient|ut)$/u, // not -es (plural adjectives), see SUBJECT_THEN_VERB for -e/-it
};
// French -e/-it forms are verbs only right after a subject: a capitalised noun or a pronoun ("la Lune forme", "qui vit")
const SUBJECT_THEN_VERB: Partial<Record<Lang, (prev: string, w: string) => boolean>> = {
  fr: (prev, w) => /^\p{Ll}{2,}(e|it)$/u.test(w) && (/^\p{Lu}/u.test(prev) || /^(il|elle|on|qui|ils|elles)$/i.test(prev)),
};
const NOT_AFTER: Record<Lang, RegExp> = {
  en: /^(the|a|an|of|in|on|at|for|with|by|to|from|its|their|his|her|this|these|those|some|many|two|three)$/i,
  de: /^(der|die|das|den|dem|des|ein|eine|einen|einem|eines|einer|im|am|zum|zur|vom|beim|mit|von|zu|in|an|auf|für|aus|bei|nach|über|unter|seine|ihre|zwei|drei|viele)$/i,
  fr: /^(le|la|les|l|un|une|des|du|de|d|en|au|aux|à|par|pour|sur|sous|dans|avec|sans|son|sa|ses|leur|leurs|ce|cette|ces|deux|trois|plusieurs)$/i,
};
export function hasFiniteVerb(s: string, lang: Lang): boolean {
  if (STRONG_VERB[lang].test(s)) return true;
  const words = s.split(/[\s,;:.!?()«»"“”„]+|(?<=[’'])/u).map((w) => w.replace(/[’']$/, '')).filter(Boolean);
  return words.some((w, i) => {
    const prev = words[i - 1] ?? '';
    if (/ment$/.test(w) && lang !== 'de') return false; // adverbs: "notamment", "seulement"
    if (SUBJECT_THEN_VERB[lang]?.(prev, w)) return true;
    return WEAK_VERB[lang].test(w) && !NOT_AFTER[lang].test(prev);
  });
}

/** "order of cephalopods" → "Order of cephalopods" (descriptions are lower-case by convention). */
export function capitalizeFirst(s: string): string {
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}

/**
 * Prose ready for sentence splitting: parentheticals removed paragraph by paragraph *before* splitting,
 * so abbreviations inside them ("lit. 'ancient wing'") cannot break a sentence apart.
 * Facts and composer both split this same text, so fact sentences match candidate sentences.
 */
export function proseForSplitting(text: string): string {
  return text
    .split('\n')
    .map((para) => tidy(dropParentheticals(para)).replace(/"\s*([^"\n]*?)\s*"/g, '"$1"'))
    .filter(Boolean)
    .join('\n');
}

const ETYMOLOGY: Record<Lang, RegExp> = {
  en: /\b(etymolog\w*|derives? from|derived from|the name\b.*\b(comes|derives|means)|(ancient )?greek|latin)\b.*\b(meaning|for|word)\b|\bnamed after\b|\bthe (genus|species|word|term) name\b/i,
  de: /\b(etymolog\w*|leitet sich|abgeleitet|griechisch|lateinisch|altgriechisch|arabischen|transkription)\b|\bder name\b.*\b(bedeutet|stammt)\b|\bbenannt nach\b/i,
  fr: /\b(étymolog\w*|vient du|dérivé du|provient du|grec ancien|du latin|du grec)\b|\ble nom\b.*\b(signifie|vient)\b|\bnommée? d'après\b/i,
};

/** A sentence about the name, not the thing ("The genus name derives from the Ancient Greek…"). */
export function isEtymology(s: string, lang: Lang): boolean {
  return ETYMOLOGY[lang].test(s);
}

// Unicode-aware word boundaries: a plain \b sees "é" as a non-letter, so "forme" matched inside "Réforme".
const COPULA: Record<Lang, RegExp> = {
  en: /(?<![\p{L}])(is|are|was|were)(?![\p{L}])/iu,
  de: /(?<![\p{L}])(ist|sind|war|waren|bezeichnet|bezeichnen|bildet|bilden|gehört|gehören|zählt|zählen)(?![\p{L}])/iu,
  fr: /(?<![\p{L}])(est|sont|était|étaient|fut|désigne|désignent|constitue|constituent|forme|forment)(?![\p{L}])/iu,
};

/**
 * The first copula that is really a verb: "forme", "bilden" etc. after an article or preposition are
 * nouns ("en forme de disque"). Returns the match with its index, or null.
 */
function copulaMatch(s: string, lang: Lang): { index: number; text: string } | null {
  const re = new RegExp(COPULA[lang].source, 'giu');
  for (const m of s.matchAll(re)) {
    const prev = s.slice(0, m.index).trim().split(/[\s’']+/).pop() ?? '';
    if (!NOT_AFTER_ART.test(prev)) return { index: m.index!, text: m[0] };
  }
  return null;
}
const NOT_AFTER_ART = /^(the|a|an|of|in|der|die|das|den|dem|des|ein|eine|einer|im|zur|zum|le|la|les|l|un|une|des|du|de|d|en|au|aux|à|sa|son|ses)$/i;

const fold = (x: string) => x.toLowerCase().replace(/ß/g, 'ss').normalize('NFC');

/** Says what the thing is: names the topic and uses a copula ("Archaeopteryx … is an extinct genus…"). */
export function isDefinition(s: string, lang: Lang, topic: string): boolean {
  // any word of the title may be the subject ("Wollstonecraft is…" for "Mary Wollstonecraft")
  const heads = fold(topic.replace(/\s*\([^)]*\)\s*/g, ' ')).split(/[\s-]+/).filter((w) => w.length >= 3).map((w) => w.slice(0, 5));
  const text = fold(s);
  return heads.some((h) => text.includes(h)) && copulaMatch(s, lang) !== null;
}

/** "X, sometimes referred to as Y, is Z." → "X is Z." (drops one appositive between subject and copula). */
export function dropAppositive(s: string, lang: Lang): string | null {
  const cop = lang === 'en' ? 'is|are|was|were' : lang === 'de' ? 'ist|sind|war|waren' : 'est|sont|était|étaient';
  const m = s.match(new RegExp(`^([^,]{2,60}), [^,]{3,90}, ((?:${cop})\\b.*)$`, 'iu'));
  return m ? `${m[1]} ${m[2]}` : null;
}

const PARTICIPLE_START: Record<Lang, RegExp> = {
  en: /^(\p{Lu}\p{Ll}{3,}(ed|ing)|Built|Found|Made|Known|Born|Held|Shown|Seen|Given|Taken|Written|Begun|Sold|Placed|Located|Situated)$/u,
  de: /^(Ge\p{Ll}{3,}(t|en)|Erbaut|Entdeckt|Beschrieben|Benannt|Errichtet|Erstmals)$/u,
  fr: /^(\p{Lu}\p{Ll}{2,}(é|ée|és|ées|ant)|Né|Née|Décrit|Décrite|Construit|Construite|Découvert|Découverte)$/u,
};
const SUBJECT_PRONOUN: Record<Lang, RegExp> = {
  en: /^(it|he|she|they|this|these|its|his|her|their)\b/i,
  de: /^(er|sie|es|dieser|diese|dieses)\b/i,
  fr: /^(il|elle|ils|elles|ce|cette|ces)\b/i,
};

/**
 * A fragment without a proper subject: opens with a participle and never names who/what does it
 * ("Placed on sale between 1877 and 1881."), or names only a pronoun ("Described in 1884 by Wilhelm Dames, it is…").
 */
export function lacksSubject(s: string, lang: Lang): boolean {
  const first = s.replace(/^[«„“"\s]+/, '').split(/[\s,]+/)[0] ?? '';
  if (!PARTICIPLE_START[lang].test(first)) return false;
  const comma = s.indexOf(', ');
  if (comma < 0) return true;
  const rest = s.slice(comma + 2).trim();
  return SUBJECT_PRONOUN[lang].test(rest) || !/^[\p{L}]/u.test(rest);
}

/**
 * A long definition cut right after its predicate: "X est un peintre allemand, considéré comme…" →
 * "X est un peintre allemand." The head must keep the copula and at least two words after it.
 */
export function cutDefinition(s: string, lang: Lang, max: number): string | null {
  const m = copulaMatch(s, lang);
  if (!m) return null;
  const after = m.index + m.text.length;
  const rest = s.slice(after);
  const stop = rest.search(/,\s|;\s|\s[–—]\s/);
  if (stop < 0) return null;
  const head = tidy(s.slice(0, after + stop)).replace(/[,;:–—\s]+$/, '');
  const words = countWords(head);
  if (words > max || words < 4 || countWords(rest.slice(0, stop)) < 2) return null;
  return head + '.';
}

/** The predicate of a definition, as a title line: "Le sel alimentaire est un condiment…" → "Un condiment…". */
export function definitionComplement(s: string, lang: Lang, maxWords = 12): string | null {
  const m = copulaMatch(s, lang);
  if (!m) return null;
  let rest = s.slice(m.index + m.text.length).trim();
  const stop = rest.search(/,\s|;\s|\s[–—]\s|\.$/);
  if (stop > 0) rest = rest.slice(0, stop);
  rest = rest.replace(/[.,;:\s]+$/, '');
  const words = countWords(rest);
  return words >= 2 && words <= maxWords ? capitalizeFirst(rest) : null;
}
