// The Rabbit Trail (milestone e): five hops from the morning's thing, through whatever its article links
// to, then END. Each hop is a text-only stop of 1–4 pages, depending on the pace. Pure and isomorphic.
import { definitionComplement, fitToWords, isDefinition } from '../compose/clean';
import { PACES } from '../pace/pace';
import type { PaceId } from '../schema/thing';
import type { Lang } from '../typography/typography';
import { EXTRACT_BATCH, extractParams, linksParams, META_BATCH, metaParams, parseExtracts, parseLinks, parseMeta, resolvedTitles, titleBatches, type Params } from './api';
import { prefilterLinks, screenMeta, screenText, type TrailRules } from './screen';

export const HOPS = 5;
export const CHOICES = 4;

/** One possible stop: everything a hop needs, so a baked pool works with no network at all. */
export type TrailSeed = {
  title: string;
  /** One line under the title on the choice page: the short description, or the lead's own definition. */
  description: string;
  /** The revision the sentences come from (attribution links this exact revision). */
  revid: number;
  /** Usable lead sentences in source order, cleaned, not yet fitted to a pace. */
  sentences: string[];
};

/** The pre-baked fallback for one morning thing: public/trail/{lang}/{date}.json. */
export type TrailPool = {
  version: 1;
  lang: Lang;
  date: string;
  from: { title: string; revid: number };
  seeds: TrailSeed[];
};

export const articleUrl = (lang: Lang, title: string, revid?: number) =>
  revid
    ? `https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(title.replace(/ /g, '_'))}&oldid=${revid}`
    : `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

// ---------------------------------------------------------------- pages of a hop

/** The texts of a hop's pages at a pace: the first sentences that fit the pace's word limit, in order. */
export function hopPages(seed: TrailSeed, lang: Lang, pace: PaceId): string[] {
  const { maxWords, trailHopPages } = PACES[pace];
  const out: string[] = [];
  for (const s of seed.sentences) {
    const fit = fitToWords(s, maxWords, lang);
    if (fit) out.push(fit.text);
    if (out.length >= trailHopPages[1]) break;
  }
  return out;
}

/** A seed can be a stop at this pace if it fills at least the pace's minimum number of pages. */
export function fitsPace(seed: TrailSeed, lang: Lang, pace: PaceId): boolean {
  return hopPages(seed, lang, pace).length >= PACES[pace].trailHopPages[0];
}

/** The one-line description for a choice: the short description, else the lead's own "X is a …". */
export function choiceLine(description: string, sentences: readonly string[], lang: Lang, title: string): string {
  const d = description.trim();
  if (d) return d;
  const first = sentences[0];
  return (first && isDefinition(first, lang, title) && definitionComplement(first, lang, 12)) || '';
}

/** One written line: up to the first ";", then at most about 60 characters, cut at a word, with "…". */
export function oneLine(text: string, max = 60): string {
  const t = text.split(/\s*;\s*/)[0]!.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1).replace(/\s+\S*$/, '').replace(/[,:–—-]+$/, '');
  return `${cut}…`;
}

// ---------------------------------------------------------------- choosing

export function shuffle<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Four choices from the baked pool: unvisited, fitting the pace, in a seeded order. */
export function poolChoices(pool: TrailPool, exclude: readonly string[], lang: Lang, pace: PaceId, rand: () => number, n = CHOICES): TrailSeed[] {
  const ex = new Set(exclude.map((t) => t.toLowerCase()));
  const ok = pool.seeds.filter((s) => !ex.has(s.title.toLowerCase()) && fitsPace(s, lang, pace));
  return shuffle(ok, rand).slice(0, n);
}

// ---------------------------------------------------------------- finding seeds through the API

/** One Action API request: params in, parsed JSON out (the caller adds format, origin, caching). */
export type Api = (params: Params) => Promise<any>;

export type SeedSearch = {
  lang: Lang;
  /** The article to hop from. */
  from: string;
  /** Titles not to offer: the trail so far. */
  exclude: readonly string[];
  rules: TrailRules;
  thisYear: number;
  /** Stop once this many seeds have passed. */
  want: number;
  /** Lead links only (runtime), or every link in the article (bake fallback when the lead is thin). */
  leadOnly: boolean;
  /** Order in which candidates are tried; omit to keep link order. */
  rand?: () => number;
  /** At most this many 50-title metadata batches (runtime: 1, so a hop costs about three requests). */
  maxMetaBatches: number;
  /** Seeds must fit every one of these paces (runtime: the reader's pace; the bake: all three). */
  paces: readonly PaceId[];
};

export type SeedResult = { from: { title: string }; seeds: TrailSeed[]; rejected: { title: string; reason: string }[]; requests: number };

async function withContinue(api: Api, params: Params, counter: { n: number }, max = 6): Promise<any[]> {
  const bodies: any[] = [];
  let cont: Params = {};
  for (let i = 0; i < max; i++) {
    const body = await api({ ...params, ...cont });
    counter.n++;
    if (body?.error) throw new Error(`api error: ${body.error.code}`);
    bodies.push(body);
    if (!body?.continue) break;
    cont = body.continue;
  }
  return bodies;
}

export async function findSeeds(api: Api, q: SeedSearch): Promise<SeedResult> {
  const counter = { n: 0 };
  const linkBody = await api(linksParams(q.from, q.leadOnly));
  counter.n++;
  const { title: from, links } = parseLinks(linkBody);
  const exclude = [...q.exclude, from, q.from];
  let cands = prefilterLinks(links, q.rules, exclude);
  if (q.rand) cands = shuffle(cands, q.rand);
  const seen = new Set(exclude.map((t) => t.toLowerCase()));
  const seeds: TrailSeed[] = [];
  const rejected: SeedResult['rejected'] = [];
  const batches = titleBatches(cands, META_BATCH).slice(0, q.maxMetaBatches);
  for (const batch of batches) {
    if (seeds.length >= q.want) break;
    const bodies = await withContinue(api, metaParams(batch), counter);
    const resolved = resolvedTitles(bodies);
    const metas = new Map(parseMeta(bodies).map((m) => [m.title, m]));
    const passing = [];
    for (const asked of batch) {
      const title = resolved.get(asked) ?? asked;
      const m = metas.get(title);
      if (!m || seen.has(title.toLowerCase())) continue; // a redirect to somewhere already on the trail
      seen.add(title.toLowerCase());
      const why = screenMeta(m, q.lang, q.rules, q.thisYear);
      if (why) rejected.push({ title, reason: why });
      else passing.push(m);
    }
    for (let i = 0; i < passing.length && seeds.length < q.want; i += EXTRACT_BATCH) {
      const chunk = passing.slice(i, i + EXTRACT_BATCH);
      const extracts = parseExtracts(await withContinue(api, extractParams(chunk.map((m) => m.title)), counter));
      for (const m of chunk) {
        const text = screenText(extracts.get(m.title) ?? '', q.lang);
        if (!text.ok) {
          rejected.push({ title: m.title, reason: text.reason });
          continue;
        }
        const seed: TrailSeed = { title: m.title, description: choiceLine(m.description, text.sentences, q.lang, m.title), revid: m.revid, sentences: text.sentences };
        if (!seed.description) {
          rejected.push({ title: m.title, reason: 'no one-line description' });
          continue;
        }
        const short = q.paces.find((pace) => !fitsPace(seed, q.lang, pace));
        if (short) {
          rejected.push({ title: m.title, reason: `too short for ${short}` });
          continue;
        }
        seeds.push(seed);
        if (seeds.length >= q.want) break;
      }
    }
  }
  return { from: { title: from }, seeds, rejected, requests: counter.n };
}
