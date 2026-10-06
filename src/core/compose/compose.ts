// The extractive composer: builds the three paces of a thing from a packet, using only
// sentences from the source (cleaned and, if needed, cut at a clause boundary).
// It is the fallback when no curated text exists, and the Rabbit Trail's live composer.
// Pure and deterministic: the same packet always gives the same thing.
import { PACES, PACE_IDS, pageRange } from '../pace/pace';
import type { Page, PaceId, Thing } from '../schema/thing';
import { countWords, splitSentences } from '../text/sentences';
import { normalizeTypography, type Lang } from '../typography/typography';
import {
  capitalizeFirst, cleanSentence, cutDefinition, danglingPronoun, definitionComplement, dropAppositive, dropParentheticals, fitToWords, isDefinition, isEtymology,
  hasFiniteVerb, lacksSubject, proseForSplitting, tidy,
} from './clean';
import type { Packet } from './packet';
import { inMetres } from '../numbers/units';
import { languageMismatch } from '../text/language';

export const QUALITY_THRESHOLD = 0.6;

type Cand = {
  text: string; idx: number; section: string | null; score: number; facts: string[];
  dangling: boolean;
  /** About the name, not the thing: never an opener; only Deep may use it, late. */
  etymology: boolean;
  /** Names the topic with a copula: "X is a …". The opener comes from these. */
  definition: boolean;
};

export type ComposeResult = { thing: Thing; notes: string[] };

/** Candidate sentences with a base score; earlier lead sentences and fact-bearing sentences rank higher. */
function candidates(p: Packet): Cand[] {
  const lang = p.lang;
  const out: Cand[] = [];
  const add = (text: string, section: string | null, base: number) => {
    splitSentences(proseForSplitting(text), lang).forEach((raw, i) => {
      const c = cleanSentence(raw);
      if (!c) return;
      if (lacksSubject(c, lang)) return; // "Placed on sale between 1877 and 1881." is not a sentence a reader can use
      if (!hasFiniteVerb(c, lang)) return; // "2 Bände, Hunter, London 1831.": a bibliography entry, not a sentence
      if (languageMismatch(c, lang)) return; // an English book title in a German list of works
      const facts = Object.entries(p.facts).filter(([, f]) => f.sentence && raw.includes(f.surface) && f.sentence === raw).map(([id]) => id);
      const words = countWords(c);
      let score = base - i * 0.04 + Math.min(facts.length, 2) * 0.15;
      if (words > 45) score -= 0.3;
      if (/["“”«»„]/.test(c)) score -= 0.15;
      if (/:\s/.test(c)) score -= 0.1;
      const etymology = isEtymology(c, lang);
      if (etymology) score -= 0.6;
      out.push({
        text: c, idx: out.length, section, score, facts, etymology,
        dangling: danglingPronoun(c, lang, p.topic.title),
        definition: section === null && !etymology && isDefinition(c, lang, p.topic.title),
      });
    });
  };
  add(p.source.lead, null, 1);
  for (const s of p.source.sections) add(s.text, s.heading, 0.6);
  return out;
}

type Ctx = { p: Packet; lang: Lang; pace: PaceId; max: number; used: Set<number>; notes: string[]; penalty: number; truncations: number };

/** Take the next usable sentence (in source order among the best), fitted to the word limit. */
function take(ctx: Ctx, cands: Cand[], opts: { allowDangling?: boolean; afterIdx?: number; preferSection?: boolean } = {}): Cand | null {
  const pool = cands
    .filter((c) => !ctx.used.has(c.idx) && (opts.allowDangling || !c.dangling || (opts.afterIdx !== undefined && c.idx === opts.afterIdx + 1)))
    .filter((c) => (opts.preferSection ? c.section !== null : true))
    .filter((c) => !c.etymology || ctx.pace === 'deep');
  // best 6 by score, then the earliest of them — keeps the narrative order of the source
  const best = pool.sort((a, b) => b.score - a.score).slice(0, 6).sort((a, b) => a.idx - b.idx);
  for (const c of best) {
    const fit = fitToWords(c.text, ctx.max, ctx.lang);
    if (!fit) continue;
    ctx.used.add(c.idx);
    if (fit.truncated) ctx.truncations++;
    return { ...c, text: fit.text };
  }
  return null;
}

function titleLine(ctx: Ctx, cands: Cand[]): string {
  const d = tidy(dropParentheticals(ctx.p.source.description)).trim();
  if (d && countWords(d) <= Math.min(ctx.max, 12) && !/[()[\]]/.test(d)) return capitalizeFirst(d);
  // the predicate of the definition ("Le sel alimentaire est un condiment…" → "Un condiment…")
  for (const c of cands.filter((x) => x.definition)) {
    const line = definitionComplement(c.text, ctx.lang, Math.min(ctx.max, 12));
    if (line) return line;
  }
  // fall back to the first lead sentence, fitted
  const first = cands.find((c) => c.section === null);
  const fit = first && fitToWords(first.text, Math.min(ctx.max, 12), ctx.lang);
  if (fit && first) {
    ctx.used.add(first.idx);
    return fit.text;
  }
  return '';
}

/**
 * Page 1 after the title says what the thing is: the first definitional lead sentence that fits
 * (an appositive may be dropped to make it fit). Etymology never opens. Falls back to the best
 * non-etymology sentence.
 */
function opener(ctx: Ctx, cands: Cand[]): Page | null {
  for (const c of cands.filter((x) => x.definition && !x.dangling && !ctx.used.has(x.idx))) {
    const short = dropAppositive(c.text, ctx.lang);
    const cut = cutDefinition(c.text, ctx.lang, ctx.max) ?? (short ? cutDefinition(short, ctx.lang, ctx.max) : null);
    const fit = fitToWords(c.text, ctx.max, ctx.lang) ?? (short ? fitToWords(short, ctx.max, ctx.lang) : null) ?? (cut ? { text: cut, truncated: true } : null);
    if (!fit) continue;
    ctx.used.add(c.idx);
    if (fit.truncated) ctx.truncations++;
    return { type: 'sentence', text: fit.text };
  }
  return sentencePage(ctx, cands);
}

/** A plain number is a quantity only if a counted word follows it ("372,624 inhabitants", "40-50 espèces"). */
function hasQuantityContext(sentence: string, surface: string): boolean {
  const at = sentence.indexOf(surface);
  if (at < 0) return false;
  const next = sentence.slice(at + surface.length).trim().split(/[\s,.;:]+/)[0] ?? '';
  const MONTHS = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|januar|februar|märz|mai|juni|juli|august|oktober|dezember|janvier|février|mars|avril|juin|juillet|août|septembre|octobre|novembre|décembre)/i;
  return /^\p{L}{3,}$/u.test(next) && !MONTHS.test(next);
}

function bigNumber(ctx: Ctx, cands: Cand[]): Page | null {
  // measures first, then large plain numbers; never a bare year
  const facts = Object.entries(ctx.p.facts)
    // a measure (has a unit) or a plain quantity with a counted word after it; never a year, never a code
    .filter(([, f]) => f.sentence && (f.kind === 'measure' || (f.kind === 'number' && Number(f.value) >= 100 && hasQuantityContext(f.sentence, f.surface))))
    .sort(([, a], [, b]) => Number(b.kind === 'measure') - Number(a.kind === 'measure'));
  for (const [id, f] of facts) {
    const c = cands.find((x) => !ctx.used.has(x.idx) && x.facts.includes(id) && !x.dangling);
    if (!c) continue;
    const fit = fitToWords(c.text, ctx.max, ctx.lang);
    if (!fit || !fit.text.includes(f.surface)) continue;
    ctx.used.add(c.idx);
    if (fit.truncated) ctx.truncations++;
    return { type: 'bignumber', fact: id, display: f.surface, caption: fit.text };
  }
  return null;
}

function timeline(ctx: Ctx, cands: Cand[]): Page | null {
  const events: { fact: string; label: string; year: number }[] = [];
  const seenYears = new Set<number>();
  for (const [id, f] of Object.entries(ctx.p.facts)) {
    if (f.kind !== 'date' || !f.sentence) continue;
    const year = Number(f.value);
    if (seenYears.has(year)) continue;
    const c = cands.find((x) => x.facts.includes(id) && !ctx.used.has(x.idx) && !x.dangling);
    if (!c) continue;
    const fit = fitToWords(c.text, Math.min(ctx.max, 14), ctx.lang);
    if (!fit || !fit.text.includes(f.surface)) continue;
    events.push({ fact: id, label: fit.text, year });
    seenYears.add(year);
    ctx.used.add(c.idx);
    if (events.length === 4) break;
  }
  if (events.length < 2) return null;
  events.sort((a, b) => a.year - b.year);
  return { type: 'timeline', events: events.map(({ fact, label }) => ({ fact, label })) };
}

/** A map of where the thing is, when the source has coordinates. The geometry is baked in (scripts/content/lib/map.ts). */
function mapPage(ctx: Ctx): Page | null {
  return ctx.p.facts.c1 ? { type: 'map', map: 'm1', label: ctx.p.topic.title } : null;
}

const HEIGHT_WORDS: Record<Lang, RegExp> = {
  en: /\b(tall|high|height|elevation)\b/i,
  de: /\b(hoch|hohe[rsn]?|Höhe|Gesamthöhe)\b/i,
  fr: /\b(haut|haute|hauteur|altitude)\b/i,
};
const PART_WORDS: Record<Lang, RegExp> = {
  en: /\b(highest point|summit|peak|highest mountain|average|mean)\b/i,
  de: /(höchste[rn]? (Punkt|Berg|Erhebung)|Gipfel|durchschnittlich|mittlere)/i,
  fr: /(point culminant|culmin|sommet|plus haut point|moyenne?)/i,
};
// things that have a height of their own (a tower, a statue, a mountain, a waterfall) — not countries,
// cities or islands, whose "height" is an average or a highest point somewhere inside them
const COMPARE_DOMAINS = new Set(['architecture', 'landscapes', 'art']);
export const refFactId = (refId: string) => `ref_${refId}`;

/**
 * A compare page: the thing's height next to one or two reference objects of similar size (content/refs),
 * drawn to scale. Strict on purpose: the sentence must name the topic and talk about height, so the bar
 * labelled with the topic really is the topic's height (not, say, a mountain in a country).
 */
function comparePage(ctx: Ctx, cands: Cand[]): Page | null {
  const { p, lang } = ctx;
  const refs = p.refs ?? [];
  if (!refs.length || !COMPARE_DOMAINS.has(p.topic.domain) || countWords(p.topic.title) > 4) return null;
  const head = p.topic.title.split(/\s+/)[0]!.toLowerCase().slice(0, 5);
  for (const [id, f] of Object.entries(p.facts)) {
    if (f.kind !== 'measure' || !f.sentence) continue;
    const m = inMetres(Number(f.value), f.unit);
    if (m === null || m < 20) continue;
    if (!HEIGHT_WORDS[lang].test(f.sentence) || !f.sentence.toLowerCase().includes(head)) continue;
    // the highest point OF the topic is a part of it, not its height ("Mount Forbes, the highest point in the park")
    if (PART_WORDS[lang].test(f.sentence)) continue;
    const c = cands.find((x) => x.facts.includes(id) && !ctx.used.has(x.idx) && !x.dangling);
    if (!c) continue;
    const fit = fitToWords(c.text, ctx.max, lang);
    if (!fit || !fit.text.includes(f.surface)) continue;
    const near = refs
      .map((r) => ({ r, d: Math.abs(Math.log(r.metres / m)) }))
      .filter((x) => x.d <= Math.log(8))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .map((x) => x.r);
    if (!near.length) continue;
    ctx.used.add(c.idx);
    const items = [
      { label: p.topic.title, fact: id, metres: m },
      ...near.map((r) => ({ label: r.label, fact: refFactId(r.id), metres: r.metres })),
    ].sort((a, b) => a.metres - b.metres);
    return { type: 'compare', items: items.map(({ label, fact }) => ({ label, fact })), caption: fit.text, shape: 'heights' };
  }
  return null;
}

function closing(ctx: Ctx, cands: Cand[], onlyPage: boolean): Page | null {
  const free = cands.filter((c) => !ctx.used.has(c.idx) && !c.dangling && !c.etymology);
  // the only page after the title (Easygoing evening): the defining first sentence of the lead
  // otherwise: a calm, self-contained sentence from later in the lead
  const order = onlyPage
    ? [...free.filter((c) => c.definition), ...free.filter((c) => !c.definition).sort((a, b) => a.idx - b.idx)]
    : [...free.filter((c) => c.section === null).sort((a, b) => b.idx - a.idx), ...free.sort((a, b) => b.idx - a.idx)];
  for (const c of order) {
    const fit = fitToWords(c.text, ctx.max, ctx.lang);
    if (!fit) continue;
    ctx.used.add(c.idx);
    if (fit.truncated) ctx.truncations++;
    return { type: 'closing', text: fit.text };
  }
  return null;
}

function sentencePage(ctx: Ctx, cands: Cand[], opts?: Parameters<typeof take>[2]): Page | null {
  const c = take(ctx, cands, opts);
  return c ? { type: 'sentence', text: c.text } : null;
}

/** Compose one pace. Returns null if the page budget cannot be met with clean pages. */
function composePace(p: Packet, pace: PaceId, cands: Cand[], notes: string[], minimal: boolean): { pages: Page[]; score: number } | null {
  const spec = PACES[pace];
  const [minPages, maxPages] = pageRange(pace, p.slot);
  const ctx: Ctx = { p, lang: p.lang, pace, max: spec.maxWords, used: new Set(), notes, penalty: 0, truncations: 0 };
  const img = Object.keys(p.images)[0];
  const allows = (t: Page['type']) => spec.types.includes(t);

  const title: Page = { type: 'title', title: p.topic.title, line: titleLine(ctx, cands), ...(img ? { image: img } : {}) };
  const body: Page[] = [];
  const bodyTarget = maxPages - 2;
  const push = (pg: Page | null) => pg && body.length < bodyTarget && body.push(pg);
  const bodyMin = minPages - 2;

  // the first body page says what the thing is
  push(opener(ctx, cands));

  if (!minimal) {
    if (img && allows('image') && pace !== 'easy' && body.length < bodyTarget)
      push({ type: 'image', image: img, caption: p.topic.title });
    // compare first: it is the richer page for the same measure; the big number then takes another one
    if (allows('compare') && body.length < bodyTarget - 1) push(comparePage(ctx, cands));
    if (allows('bignumber') && body.length < bodyTarget) push(bigNumber(ctx, cands));
    if (allows('timeline') && body.length < bodyTarget - 1) push(timeline(ctx, cands));
    if (allows('map') && body.length < bodyTarget - 1) push(mapPage(ctx));
  } else if (img && allows('image') && pace !== 'easy' && body.length < bodyTarget) {
    push({ type: 'image', image: img, caption: p.topic.title });
  }
  // keep one clean sentence back for the closing, or the whole pace would fall back to the minimal template
  const closable = () => cands.filter((c) => !ctx.used.has(c.idx) && !c.dangling && !c.etymology && fitToWords(c.text, ctx.max, ctx.lang)).length;
  while (body.length < bodyTarget && closable() > 1) {
    const before = body.length;
    push(sentencePage(ctx, cands, { preferSection: pace === 'deep' && body.length > 3 }));
    if (body.length === before) push(sentencePage(ctx, cands));
    if (body.length === before) break;
  }

  // plan §2: if nothing fits, use a non-text page (the image) instead of a weak sentence
  if (body.length < bodyMin && img && allows('image') && !body.some((pg) => pg.type === 'image')) {
    body.push({ type: 'image', image: img, caption: p.topic.title });
  }
  const close = closing(ctx, cands, body.length === 0);
  if (!close) return null;
  const pages = [title, ...body, close];
  if (body.length < bodyMin) return null;

  // quality
  let score = 1;
  if (!title.line) score -= 0.15;
  score -= ctx.truncations * 0.05;
  const kinds = new Set(pages.map((x) => x.type));
  if (p.slot === 'morning' && pace !== 'easy' && kinds.size < 4) score -= 0.1;
  for (const pg of pages) {
    const t = pg.type === 'sentence' || pg.type === 'closing' ? pg.text : '';
    if (t && danglingPronoun(t, p.lang, p.topic.title)) score -= 0.15;
  }
  return { pages: pages.slice(0, maxPages), score };
}

/** Typography for every visible string on a page. */
function typeset(pg: Page, lang: Lang): Page {
  const n = (s: string) => normalizeTypography(s, lang);
  switch (pg.type) {
    case 'title': return { ...pg, title: n(pg.title), line: n(pg.line) };
    case 'sentence': return { ...pg, text: n(pg.text) };
    case 'closing': return { ...pg, text: n(pg.text) };
    case 'bignumber': return { ...pg, display: n(pg.display), caption: n(pg.caption) };
    case 'image': return { ...pg, caption: n(pg.caption) };
    case 'timeline': return { ...pg, events: pg.events.map((e) => ({ ...e, label: n(e.label) })) };
    case 'map': return { ...pg, label: n(pg.label) };
    case 'compare': return { ...pg, caption: n(pg.caption), items: pg.items.map((it) => ({ ...it, label: n(it.label) })) };
    default: return pg;
  }
}

export function composeExtractive(p: Packet): ComposeResult {
  const notes: string[] = [];
  const cands = candidates(p);
  const paces = {} as Thing['paces'];
  const scores: number[] = [];
  for (const pace of PACE_IDS) {
    let r = composePace(p, pace, cands, notes, false);
    if (!r || r.score < QUALITY_THRESHOLD) {
      notes.push(`${pace}: ${r ? `score ${r.score.toFixed(2)} below threshold` : 'could not fill the page budget'}; using the minimal template`);
      r = composePace(p, pace, cands, notes, true);
    }
    if (!r) throw new Error(`compose failed: ${p.lang}/${p.date}.${p.slot} ${p.topic.title} (${pace}): not enough clean sentences`);
    paces[pace] = r.pages.map((pg) => typeset(pg, p.lang));
    scores.push(r.score);
  }
  const usedFacts = new Set(
    PACE_IDS.flatMap((k) => paces[k]).flatMap((pg) =>
      pg.type === 'bignumber' ? [pg.fact] : pg.type === 'timeline' ? pg.events.map((e) => e.fact) : pg.type === 'compare' ? pg.items.map((i) => i.fact) : [],
    ),
  );
  const refFacts = Object.fromEntries(
    (p.refs ?? []).map((r) => [refFactId(r.id), { kind: 'measure' as const, value: r.value, unit: r.unit, surface: r.surface, ref: r.id }]),
  );
  const desc = tidy(dropParentheticals(p.source.description)).trim();
  const teaserFit = desc ? capitalizeFirst(desc) : p.topic.title;
  const thing: Thing = {
    schema: 1,
    id: `${p.lang}-${p.date}-${p.slot}`,
    date: p.date,
    lang: p.lang,
    slot: p.slot,
    topic: { title: p.topic.title, qid: p.topic.qid, pageid: p.topic.pageid, revid: p.topic.revid, domain: p.topic.domain, teaser: normalizeTypography(countWords(teaserFit) <= PACES.easy.maxWords ? teaserFit : p.topic.title, p.lang) },
    sources: [{ title: p.topic.title, url: p.topic.url, revid: p.topic.revid, license: 'CC BY-SA 4.0' }],
    images: p.images,
    facts: Object.fromEntries(
      Object.entries({ ...p.facts, ...refFacts })
        .filter(([id]) => usedFacts.has(id))
        .map(([id, f]) => [id, { kind: f.kind, value: f.value, ...(f.unit ? { unit: f.unit } : {}), surface: f.surface, ...('ref' in f && f.ref ? { ref: f.ref } : {}) }]),
    ),
    paces,
    authoredBy: 'extractive',
    qualityScore: Math.round(Math.min(...scores) * 100) / 100,
  };
  return { thing, notes };
}
