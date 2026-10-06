// The browser's only conversation with Wikipedia (plan decision 12): Action API GETs with `origin=*`
// (anonymous CORS, no cookies), an `Api-User-Agent` header as Wikimedia asks of browser clients, a
// timeout, and a small cache in memory and localStorage. No retries: on 429 or any failure the trail
// quietly falls back to its pre-baked pool, so a busy Wikipedia is never asked twice.
import type { Api } from '../core/trail/trail';
import type { Lang } from '../core/typography/typography';

export const API_USER_AGENT = 'Margin/0.1 (https://github.com/keller-tg/margin) rabbit-trail';
export const TRAIL_HOSTS = ['en.wikipedia.org', 'de.wikipedia.org', 'fr.wikipedia.org'] as const;

const CACHE_KEY = 'margin.trail.cache.v1';
const TTL_MS = 7 * 24 * 3600 * 1000;
const MAX_ENTRY = 200_000; // characters; bigger answers stay in memory only
const MAX_TOTAL = 1_500_000; // characters of localStorage used for the cache, oldest dropped first
const TIMEOUT_MS = 6000;

type Entry = { t: number; body: unknown };
const memory = new Map<string, Entry>();

function readStore(): Record<string, Entry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const data = raw ? (JSON.parse(raw) as unknown) : {};
    return data && typeof data === 'object' ? (data as Record<string, Entry>) : {};
  } catch {
    return {};
  }
}

function writeStore(url: string, entry: Entry) {
  try {
    const size = JSON.stringify(entry).length;
    if (size > MAX_ENTRY) return;
    const all = readStore();
    all[url] = entry;
    const now = Date.now();
    let items = Object.entries(all).filter(([, e]) => now - e.t < TTL_MS);
    items.sort((a, b) => b[1].t - a[1].t); // newest first
    let total = 0;
    items = items.filter(([, e]) => (total += JSON.stringify(e).length) <= MAX_TOTAL);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(items)));
  } catch {
    // storage full or unavailable: the memory cache still works for this visit
  }
}

export function apiUrl(lang: Lang, params: Record<string, string | number>): string {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  const all = { format: 'json', formatversion: 2, origin: '*', ...params };
  for (const [k, v] of Object.entries(all)) url.searchParams.set(k, String(v));
  return url.toString();
}

/** An Api for findSeeds(): cached, with a timeout; throws on anything but a JSON 200. */
export function browserApi(lang: Lang, fetchImpl: typeof fetch = fetch.bind(globalThis)): Api {
  return async (params) => {
    const url = apiUrl(lang, params);
    const now = Date.now();
    const mem = memory.get(url);
    if (mem && now - mem.t < TTL_MS) return mem.body;
    const stored = readStore()[url];
    if (stored && now - stored.t < TTL_MS) {
      memory.set(url, stored);
      return stored.body;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, { headers: { 'Api-User-Agent': API_USER_AGENT }, signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { error?: { code?: string } };
      if (body?.error) throw new Error(`api error: ${body.error.code ?? 'unknown'}`); // never cached
      const entry = { t: now, body };
      memory.set(url, entry);
      writeStore(url, entry);
      return body;
    } finally {
      clearTimeout(timer);
    }
  };
}
