// The only door between the content pipeline and Wikimedia.
//
// Rules (docs/plan.md, "Fetcher" and the 2026-10-05 network decisions):
//  - every request sends a descriptive User-Agent with contact info, and maxlag on the Action API
//  - requests run strictly one at a time, with a minimum gap between them (all hosts share one IP)
//  - 429/503 and maxlag errors are retried, honouring Retry-After, with exponential backoff
//  - every response is cached on disk under content/cache/api/ and the cache is committed,
//    so each URL is fetched once, ever; reruns and CI replay the cache
//  - metadata for images is asked of the language editions' Action API, never of commons.wikimedia.org
//  - tests must never reach the network: under Vitest, a cache miss throws
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const USER_AGENT = 'Margin/0.1 (https://github.com/keller-tg/margin; contact: keller-tg on GitHub) content-pipeline';
export const CACHE_DIR = join(import.meta.dirname, '../../../content/cache/api');

const MIN_GAP_MS = 1100;
const MAX_ATTEMPTS = 8;
const ALLOWED_HOSTS = new Set([
  'en.wikipedia.org',
  'de.wikipedia.org',
  'fr.wikipedia.org',
  'query.wikidata.org',
]);

export type WikiLang = 'en' | 'de' | 'fr';
type Params = Record<string, string | number | boolean | undefined>;

export const stats = { network: 0, cached: 0, retries: 0, waitedMs: 0 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRequestAt = 0;
let chain: Promise<unknown> = Promise.resolve();

/** Canonical cache key: host + path + sorted params, without volatile params like maxlag. */
export function cacheKey(url: URL): string {
  const p = new URLSearchParams([...url.searchParams].filter(([k]) => k !== 'maxlag').sort(([a], [b]) => a.localeCompare(b)));
  return `${url.host}${url.pathname}?${p}`;
}

function cachePath(key: string): string {
  const h = createHash('sha1').update(key).digest('hex');
  const host = key.slice(0, key.indexOf('/'));
  return join(CACHE_DIR, host, h.slice(0, 2), `${h}.json`);
}

type CacheEntry = { key: string; fetchedAt: string; body: unknown };

export function readCache(url: URL): unknown | undefined {
  const key = cacheKey(url);
  const p = cachePath(key);
  if (!existsSync(p)) return undefined;
  const e = JSON.parse(readFileSync(p, 'utf8')) as CacheEntry;
  return e.body;
}

function writeCache(url: URL, body: unknown): void {
  const key = cacheKey(url);
  const p = cachePath(key);
  mkdirSync(dirname(p), { recursive: true });
  const e: CacheEntry = { key, fetchedAt: new Date().toISOString(), body };
  writeFileSync(p, JSON.stringify(e) + '\n');
}

const onVitest = () => Boolean(process.env.VITEST);

async function liveFetch(url: URL, init: RequestInit): Promise<unknown> {
  if (onVitest()) throw new Error(`live network call attempted under tests: ${url}`);
  if (!ALLOWED_HOSTS.has(url.host)) throw new Error(`host not allowed for the pipeline: ${url.host}`);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const gap = lastRequestAt + MIN_GAP_MS - Date.now();
    if (gap > 0) await sleep(gap);
    lastRequestAt = Date.now();
    stats.network++;

    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT, ...init.headers } });
    } catch (err) {
      const wait = 2 ** attempt * 2000;
      log(`network error on ${url.host} (${(err as Error).message}); retry in ${wait / 1000}s`);
      await backoff(wait);
      continue;
    }

    if (res.status === 429 || res.status === 503 || res.status === 502 || res.status === 504) {
      const ra = Number(res.headers.get('retry-after'));
      const wait = Math.max(Number.isFinite(ra) ? ra * 1000 : 0, 2 ** attempt * 2000);
      log(`${res.status} from ${url.host}, retry-after=${res.headers.get('retry-after') ?? '–'}; waiting ${Math.round(wait / 1000)}s`);
      await backoff(wait);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}: ${(await res.text()).slice(0, 300)}`);

    const body = (await res.json()) as { error?: { code?: string; lag?: number } };
    if (body.error?.code === 'maxlag') {
      const ra = Number(res.headers.get('retry-after')) || 5;
      log(`maxlag on ${url.host} (lag ${body.error.lag}s); waiting ${ra}s`);
      await backoff(ra * 1000);
      continue;
    }
    if (body.error) throw new Error(`API error for ${url}: ${JSON.stringify(body.error).slice(0, 300)}`);
    return body;
  }
  throw new Error(`gave up after ${MAX_ATTEMPTS} attempts: ${url}`);
}

async function backoff(ms: number) {
  stats.retries++;
  stats.waitedMs += ms;
  await sleep(ms);
}

let logger: (msg: string) => void = (m) => process.stderr.write(`  [wiki] ${m}\n`);
export function setLogger(fn: (msg: string) => void) {
  logger = fn;
}
function log(m: string) {
  logger(m);
}

/** Serialise every live request through one chain: strictly sequential across all hosts. */
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

async function cachedGet(url: URL, init: RequestInit = {}): Promise<unknown> {
  const hit = readCache(url);
  if (hit !== undefined) {
    stats.cached++;
    return hit;
  }
  return enqueue(async () => {
    const again = readCache(url);
    if (again !== undefined) return again;
    const body = await liveFetch(url, init);
    writeCache(url, body);
    return body;
  });
}

/** One Action API request against a language edition (cached forever). */
export function actionApi(lang: WikiLang, params: Params): Promise<any> {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  const all: Params = { action: 'query', format: 'json', formatversion: 2, ...params, maxlag: 5 };
  for (const [k, v] of Object.entries(all)) if (v !== undefined) url.searchParams.set(k, String(v));
  return cachedGet(url);
}

/**
 * An Action API query that follows `continue` until done, merging `query.pages` by pageid/title.
 * Each continuation is its own cached request.
 */
export async function actionQueryAll(lang: WikiLang, params: Params): Promise<{ pages: any[]; raw: any[] }> {
  const raw: any[] = [];
  const byKey = new Map<string, any>();
  let cont: Record<string, string> = {};
  for (let i = 0; i < 50; i++) {
    const body = await actionApi(lang, { ...params, ...cont });
    raw.push(body);
    for (const p of body.query?.pages ?? []) {
      const k = String(p.pageid ?? p.title);
      const prev = byKey.get(k);
      byKey.set(k, prev ? mergePage(prev, p) : p);
    }
    if (!body.continue) break;
    cont = body.continue;
  }
  return { pages: [...byKey.values()], raw };
}

function mergePage(a: any, b: any): any {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (Array.isArray(v) && Array.isArray(out[k])) out[k] = [...out[k], ...v];
    else if (v && typeof v === 'object' && out[k] && typeof out[k] === 'object') out[k] = { ...out[k], ...v };
    else out[k] = v;
  }
  return out;
}

/** One SPARQL query against the Wikidata Query Service (cached forever). */
export function sparql(query: string): Promise<any> {
  const url = new URL('https://query.wikidata.org/sparql');
  url.searchParams.set('query', query.replace(/\s+/g, ' ').trim());
  url.searchParams.set('format', 'json');
  return cachedGet(url, { headers: { Accept: 'application/sparql-results+json' } });
}

/** Split into batches of at most `n` (Action API: 50 titles per request). */
export function batches<T>(xs: readonly T[], n = 50): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
