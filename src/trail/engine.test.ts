// HANDMADE FIXTURES: a hand-written fake Action API (formatversion=2 shapes) and a hand-written pool. No network.
import { describe, expect, it, vi } from 'vitest';
import type { Api, TrailPool, TrailSeed } from '../core/trail/trail';
import { nextOptions, rulesFor } from './engine';

const lead = (t: string) => `${t} is a small island in the South Atlantic Ocean near the coast. It has a few hundred inhabitants and many seabirds. The island was first charted in the eighteenth century by sailors.`;
const seed = (title: string): TrailSeed => ({ title, description: 'island', revid: 1, sentences: [lead(title).split('. ')[0] + '.', 'It has a few hundred inhabitants and many seabirds.', 'The island was first charted in the eighteenth century by sailors.'] });
const pool: TrailPool = { version: 1, lang: 'en', date: '2099-01-01', from: { title: 'Home', revid: 1 }, seeds: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(seed) };

function fakeWiki(links: string[]): Api {
  return async (p) => {
    const titles = String(p.titles ?? '').split('|');
    if (p.action === 'parse') return { parse: { title: 'Home', text: `<p>${links.map((t) => `<a href="/wiki/${t}" title="${t}">${t}</a>`).join(' ')}</p>` } };
    if (p.prop === 'extracts') return { query: { pages: titles.map((title) => ({ title, extract: lead(title) })) } };
    return { query: { pages: titles.map((title, i) => ({ pageid: i + 1, title, lastrevid: 7, length: 20000, description: 'island' })) } };
  };
}
const base = { lang: 'en' as const, date: '2099-01-01', pace: 'medium' as const, from: 'Home', visited: ['Home'], pool, stayOffline: false };

describe('trail engine', () => {
  it('rules include the trail topic rules', () => {
    expect(rulesFor('en').topicPatterns.length).toBeGreaterThan(0);
    expect(rulesFor('fr').categoryPatterns.length).toBeGreaterThan(0);
  });

  it('live: four stops that pass the screen', async () => {
    const r = await nextOptions({ ...base, api: fakeWiki(['A', 'B', 'C', 'D', 'E']) });
    expect(r.source).toBe('live');
    expect(r.options).toHaveLength(4);
  });

  it('fewer than four pass: the pool for this hop, but stay online', async () => {
    const r = await nextOptions({ ...base, api: fakeWiki(['A', 'List of birds', '1982']) });
    expect(r).toMatchObject({ source: 'pool', offline: false });
    expect(r.options.map((o) => o.title).every((t) => t.startsWith('P'))).toBe(true);
  });

  it('a failure (429, timeout, blocked) falls back to the pool and marks the trail offline', async () => {
    const r = await nextOptions({ ...base, api: async () => Promise.reject(new Error('HTTP 429')) });
    expect(r).toMatchObject({ source: 'pool', offline: true });
    expect(r.options).toHaveLength(4);
  });

  it('once offline, Wikipedia is not asked again; the pool skips the trail so far', async () => {
    const api = vi.fn(fakeWiki(['A', 'B', 'C', 'D']));
    const r = await nextOptions({ ...base, visited: ['Home', 'P1', 'P2'], stayOffline: true, api });
    expect(api).not.toHaveBeenCalled();
    expect(r.options.map((o) => o.title)).not.toContain('P1');
  });

  it('no network and no pool: no options (the page offers the way to the END)', async () => {
    const r = await nextOptions({ ...base, pool: null, online: false, api: fakeWiki([]) });
    expect(r.options).toEqual([]);
  });
});
