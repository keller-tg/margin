import { describe, expect, it } from 'vitest';
import type { Domain } from '../schema/thing';
import { pick, type PoolEntry } from './pick';

// HANDMADE pool entries, not real data.
const entry = (i: number, domain: Domain, evening = false, enClass = 'B'): PoolEntry => ({
  title: `T${i}`, qid: `Q${i}`, domain, evening, abstract: false, enClass, length: 40000, coords: null, human: false,
});
const pool: PoolEntry[] = [
  ...Array.from({ length: 30 }, (_, i) => entry(i, 'animals', true)),
  ...Array.from({ length: 30 }, (_, i) => entry(100 + i, 'history')),
  ...Array.from({ length: 10 }, (_, i) => entry(200 + i, 'food', true, 'FA')),
];
const ctx = { date: '2026-10-06', lang: 'en', slot: 'morning' as const, exclude: new Set<string>(), avoidDomains: new Set<Domain>() };

describe('pick', () => {
  it('is deterministic per (date, lang, slot, attempt)', () => {
    expect(pick(pool, ctx)).toEqual(pick(pool, ctx));
    const picks = new Set(Array.from({ length: 10 }, (_, d) => pick(pool, { ...ctx, date: `2026-10-${10 + d}` })?.qid));
    expect(picks.size).toBeGreaterThan(3);
  });
  it('evenings only draw evening-eligible topics', () => {
    for (let a = 0; a < 20; a++) expect(pick(pool, { ...ctx, slot: 'evening' }, a)?.evening).toBe(true);
  });
  it('respects exclusions and domain diversity', () => {
    for (let a = 0; a < 20; a++) {
      const r = pick(pool, { ...ctx, exclude: new Set(['Q200']), avoidDomains: new Set<Domain>(['food', 'animals']) }, a);
      expect(r?.domain).toBe('history');
    }
  });
});
