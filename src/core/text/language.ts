// Does a text read as the language it claims? A stopword count, cheap and isomorphic.
// Used by the composer, the verifier and the Rabbit Trail (kept apart from the verifier so the trail
// chunk doesn't pull in zod).
import type { Lang } from '../typography/typography';

const STOPWORDS: Record<Lang, string[]> = {
  en: ['the', 'and', 'of', 'to', 'is', 'was', 'are', 'were', 'it', 'that', 'with', 'for', 'as', 'by', 'from', 'this', 'which', 'its', 'has', 'have', 'be', 'or', 'at', 'an', 'can', 'into', 'their', 'than', 'they', 'about', 'he', 'she', 'his', 'had', 'been', 'would', 'not', 'there', 'when', 'after'],
  de: ['der', 'die', 'das', 'und', 'ist', 'war', 'sind', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'mit', 'von', 'zu', 'auf', 'für', 'sich', 'nicht', 'auch', 'als', 'wird', 'wurde', 'bei', 'nach', 'aus', 'oder', 'im', 'zum', 'zur', 'vom', 'einem', 'eines', 'werden', 'hat', 'hatte', 'wurden', 'seine', 'sie'],
  fr: ['le', 'la', 'les', 'et', 'est', 'des', 'du', 'une', 'un', 'dans', 'pour', 'par', 'sur', 'qui', 'que', 'au', 'aux', 'il', 'elle', 'sont', 'était', 'avec', 'ce', 'cette', 'se', 'son', 'sa', 'ses', 'plus', 'pas', 'de', 'en', 'ont', 'été', 'à', 'où', 'leur', 'nous'],
};

export function stopwordCounts(text: string): Record<Lang, number> {
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const r = { en: 0, de: 0, fr: 0 } as Record<Lang, number>;
  for (const l of ['en', 'de', 'fr'] as Lang[]) {
    const set = new Set(STOPWORDS[l]);
    r[l] = words.filter((w) => set.has(w)).length;
  }
  return r;
}

/** Another language's stopwords outnumber this one's by 2 or more: the text does not read as `lang`. */
export function languageMismatch(text: string, lang: Lang): boolean {
  const c = stopwordCounts(text);
  return Math.max(...(['en', 'de', 'fr'] as Lang[]).filter((l) => l !== lang).map((l) => c[l])) >= c[lang] + 2;
}
