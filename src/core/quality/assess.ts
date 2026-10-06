// Automatic quality assessment of a generated thing: named, countable problems a reader would notice.
// Used by content:bake (qualityScore) and content:quality (the weakest-10% report). Pure.
import { danglingPronoun, isDefinition, isEtymology, lacksSubject } from '../compose/clean';
import { PACES, PACE_IDS } from '../pace/pace';
import type { PaceId, Thing } from '../schema/thing';
import { countWords } from '../text/sentences';

export type Problem =
  | 'weak-number' // big number without a unit or a counted word, or a small bare number
  | 'missing-subject' // a page or timeline label without a proper subject
  | 'dangling-pronoun' // "It…", "By 1804 he…" with nothing it refers to
  | 'short-page' // a text page under 6 words
  | 'image-instead-of-text' // the page budget was filled with the image because no sentence fit
  | 'opener-not-definition' // page 1 after the title does not say what the thing is
  | 'etymology-early' // a sentence about the name in the first half
  | 'few-page-types' // a morning Medium/Deep made of sentences only
  | 'no-title-line'
  | 'foreign-script' // Greek, Cyrillic… inside the running text
  | 'dense-pages'; // average text page close to the word limit

const WEIGHT: Record<Problem, number> = {
  'weak-number': 0.15, 'missing-subject': 0.2, 'dangling-pronoun': 0.12, 'short-page': 0.04, 'image-instead-of-text': 0.08,
  'opener-not-definition': 0.12, 'etymology-early': 0.1, 'few-page-types': 0.08, 'no-title-line': 0.1, 'foreign-script': 0.05,
  'dense-pages': 0.04,
};

export type Finding = { problem: Problem; pace: PaceId; page?: number; detail: string };
export type Assessment = { score: number; findings: Finding[] };

const textOf = (pg: Thing['paces'][PaceId][number]): string =>
  pg.type === 'sentence' || pg.type === 'closing' ? pg.text : pg.type === 'bignumber' ? pg.caption : '';

export function assessThing(t: Thing): Assessment {
  const f: Finding[] = [];
  const lang = t.lang;
  const topic = t.topic.title;
  for (const pace of PACE_IDS) {
    const pages = t.paces[pace];
    const add = (problem: Problem, detail: string, page?: number) => f.push({ problem, pace, detail, ...(page ? { page } : {}) });
    const title = pages[0];
    if (title?.type === 'title' && !title.line) add('no-title-line', 'title page has no line');

    const body = pages.slice(1);
    const first = body[0];
    if (first && first.type === 'sentence' && body.length > 1 && !isDefinition(first.text, lang, topic)) add('opener-not-definition', first.text, 2);
    if (first && first.type === 'image' && t.slot === 'morning') add('image-instead-of-text', 'opener is the image', 2);

    const texts: number[] = [];
    pages.forEach((pg, i) => {
      const n = i + 1;
      const text = textOf(pg);
      if (text) {
        const w = countWords(text);
        texts.push(w);
        if (w < 6 && pg.type !== 'bignumber') add('short-page', text, n);
        if (lacksSubject(text, lang)) add('missing-subject', text, n);
        if ((pg.type === 'sentence' || pg.type === 'closing') && danglingPronoun(text, lang, topic)) add('dangling-pronoun', text, n);
        if (isEtymology(text, lang) && i < pages.length / 2) add('etymology-early', text, n);
        if (/[Ͱ-ϿЀ-ӿ֐-ۿ一-鿿]/u.test(text)) add('foreign-script', text, n);
      }
      if (pg.type === 'bignumber') {
        const fact = t.facts[pg.fact];
        if (fact && fact.kind !== 'measure' && Number(fact.value) < 100) add('weak-number', `${pg.display}: ${pg.caption}`, n);
        else if (fact && fact.kind === 'number' && !/\p{L}{3,}/u.test(pg.caption.slice(pg.caption.indexOf(pg.display) + pg.display.length).trim().split(/\s+/)[0] ?? '')) add('weak-number', `${pg.display}: ${pg.caption}`, n);
      }
      if (pg.type === 'timeline') for (const e of pg.events) if (lacksSubject(e.label, lang)) add('missing-subject', e.label, n);
      if (pg.type === 'image' && pace === 'easy' && t.slot === 'morning') add('image-instead-of-text', 'Easygoing uses the image to fill its pages', n);
    });
    if (t.slot === 'morning' && pace !== 'easy' && new Set(pages.map((x) => x.type)).size < 4) add('few-page-types', [...new Set(pages.map((x) => x.type))].join(', '));
    if (texts.length && texts.reduce((a, b) => a + b, 0) / texts.length > PACES[pace].maxWords * 0.85) add('dense-pages', `average ${Math.round(texts.reduce((a, b) => a + b, 0) / texts.length)} words`);
  }
  const score = Math.max(0, 1 - f.reduce((a, x) => a + WEIGHT[x.problem], 0));
  return { score: Math.round(score * 100) / 100, findings: f };
}
