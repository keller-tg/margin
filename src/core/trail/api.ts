// The three Action API requests a trail hop needs, as parameters and response parsers. Shared by the
// bake script (through the cached, polite pipeline client) and the browser (through src/trail/client.ts),
// so both ask the same questions and read the answers the same way.
//   1. links:    the links in the article's prose (lead section only at runtime; the whole article as a bake fallback)
//   2. meta:     pageprops (disambiguation, QID), visible categories, description, revision — ≤ 50 titles
//   3. extracts: plain-text intro extracts — ≤ 20 titles (the API's limit for intro extracts)
import { decodeEntities } from '../text/plain';
import type { PageMeta } from './screen';

export type Params = Record<string, string | number>;

export const META_BATCH = 50;
export const EXTRACT_BATCH = 20;

export function linksParams(title: string, leadOnly: boolean): Params {
  return { action: 'parse', page: title, prop: 'text', redirects: 1, disableeditsection: 1, disablelimitreport: 1, ...(leadOnly ? { section: 0 } : {}) };
}

// Links in other namespaces (help pages, files, categories, portals…) and interwiki shortcuts.
const NAMESPACE =
  /^(help|hilfe|aide|wikipedia|wikipédia|wp|file|datei|fichier|image|bild|category|kategorie|catégorie|template|vorlage|modèle|portal|portail|special|spezial|spécial|talk|diskussion|discussion|user|benutzer|utilisateur|wiktionary|wikt|media|project|projet|module|draft|mediawiki|book|buch|livre|timedtext|w|s|q|d|c|n|b|v|commons|species|meta|mw):/i;

/**
 * The links of the article's prose, in reading order: anchors inside <p> paragraphs only, so infoboxes,
 * navigation boxes, references and identifier templates (ISBN, JSTOR…) never become trail stops.
 */
export function parseLinks(body: any): { title: string; links: string[] } {
  const parse = body?.parse;
  if (!parse || typeof parse.text !== 'string') throw new Error(`no parse result${body?.error ? `: ${body.error.code}` : ''}`);
  const links: string[] = [];
  const seen = new Set<string>();
  for (const para of parse.text.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) ?? []) {
    for (const a of para.matchAll(/<a\s[^>]*?href="\/wiki\/[^"]*"[^>]*>/g)) {
      const m = /\btitle="([^"]*)"/.exec(a[0]);
      if (!m || /\bclass="[^"]*\bnew\b/.test(a[0])) continue;
      const title = decodeEntities(m[1]!).trim();
      if (!title || NAMESPACE.test(title) || seen.has(title)) continue;
      seen.add(title);
      links.push(title);
    }
  }
  return { title: String(parse.title), links };
}

export function metaParams(titles: readonly string[]): Params {
  return {
    action: 'query',
    titles: titles.join('|'),
    redirects: 1,
    prop: 'pageprops|categories|description|info',
    ppprop: 'disambiguation|wikibase_item',
    clshow: '!hidden',
    cllimit: 'max',
  };
}

export function extractParams(titles: readonly string[]): Params {
  return { action: 'query', titles: titles.join('|'), redirects: 1, prop: 'extracts', exintro: 1, explaintext: 1, exlimit: 'max' };
}

/** Merge `query.pages` across continuation responses (categories arrive in pieces). */
export function mergePages(bodies: readonly any[]): any[] {
  const byTitle = new Map<string, any>();
  for (const b of bodies) {
    for (const p of b?.query?.pages ?? []) {
      const prev = byTitle.get(p.title);
      if (!prev) {
        byTitle.set(p.title, { ...p });
        continue;
      }
      for (const [k, v] of Object.entries(p)) {
        if (Array.isArray(v) && Array.isArray(prev[k])) prev[k] = [...prev[k], ...v];
        else if (v && typeof v === 'object' && prev[k] && typeof prev[k] === 'object') prev[k] = { ...prev[k], ...v };
        else prev[k] = v;
      }
    }
  }
  return [...byTitle.values()];
}

/** Requested title → resolved title, through normalisation and redirects. */
export function resolvedTitles(bodies: readonly any[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const b of bodies) {
    for (const n of b?.query?.normalized ?? []) map.set(n.from, n.to);
    for (const r of b?.query?.redirects ?? []) map.set(r.from, r.to);
  }
  const resolve = (t: string) => {
    let cur = t;
    for (let i = 0; i < 4 && map.has(cur); i++) cur = map.get(cur)!;
    return cur;
  };
  return new Map([...map.keys()].map((k) => [k, resolve(k)]));
}

export function parseMeta(bodies: readonly any[]): PageMeta[] {
  return mergePages(bodies).map((p) => ({
    title: String(p.title),
    missing: Boolean(p.missing || p.invalid),
    disambig: p.pageprops?.disambiguation !== undefined,
    qid: p.pageprops?.wikibase_item ?? null,
    categories: (p.categories ?? []).map((c: { title: string }) => c.title.replace(/^[^:]+:/, '')),
    description: typeof p.description === 'string' ? p.description : '',
    revid: Number(p.lastrevid ?? 0),
    length: Number(p.length ?? 0),
  }));
}

export function parseExtracts(bodies: readonly any[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of mergePages(bodies)) if (typeof p.extract === 'string') out.set(String(p.title), p.extract);
  return out;
}

/**
 * Batches of at most `n` titles whose encoded `titles=` parameter stays under `maxEncoded` characters
 * (non-Latin titles percent-encode to many times their length; the servers answer 414 past ~8 KB).
 */
export function titleBatches(titles: readonly string[], n: number, maxEncoded = 5000): string[][] {
  const split = (b: string[]): string[][] =>
    b.length > 1 && encodeURIComponent(b.join('|')).length > maxEncoded
      ? [...split(b.slice(0, Math.ceil(b.length / 2))), ...split(b.slice(Math.ceil(b.length / 2)))]
      : [b];
  const out: string[][] = [];
  for (let i = 0; i < titles.length; i += n) out.push(...split(titles.slice(i, i + n)));
  return out;
}
