// The picker (plan §2): pure and deterministic. seed = hash(date|lang|slot).
import { seeded, weightedPick } from '../rng/rng';
import type { Domain, Slot } from '../schema/thing';

export type PoolEntry = {
  title: string;
  qid: string;
  domain: Domain;
  evening: boolean;
  abstract: boolean;
  enClass: string | null;
  length: number;
  coords: [number, number] | null;
  human: boolean;
};

export type PickContext = {
  date: string;
  lang: string;
  slot: Slot;
  /** QIDs used in this language within the novelty window (365 days), plus vetoed and rejected ones. */
  exclude: Set<string>;
  /** Domains to avoid: same slot on the previous two days, and today's other slot. */
  avoidDomains: Set<Domain>;
};

const CLASS_BONUS: Record<string, number> = { FA: 1, GA: 0.8, B: 0.5, C: 0.35, Start: 0.2, Stub: 0.05 };

export function scoreEntry(e: PoolEntry, slot: Slot): number {
  let s = CLASS_BONUS[e.enClass ?? ''] ?? 0.2;
  if (e.abstract) s *= 0.15; // "Love", "Mathematics": wrong for four pages
  // length sweet spot (bytes of wikitext): enough to say something, not an encyclopedia of its own
  const kb = e.length / 1000;
  if (slot === 'morning') s *= kb < 15 ? 0.4 : kb > 220 ? 0.6 : 1;
  else s *= kb < 6 ? 0.4 : kb > 120 ? 0.5 : 1;
  if (e.coords) s *= 1.1; // a map page becomes possible
  return s;
}

export const TOP_K = 40;

/**
 * Seeded, weighted sample from the top K eligible entries.
 * `attempt` advances the seed so a rejected pick (lead too short, blocklisted category…) re-picks deterministically.
 */
export function pick<T extends PoolEntry>(pool: readonly T[], ctx: PickContext, attempt = 0): T | undefined {
  const eligible = pool.filter(
    (e) => !ctx.exclude.has(e.qid) && !ctx.avoidDomains.has(e.domain) && (ctx.slot === 'evening' ? e.evening : true),
  );
  const top = eligible
    .map((e) => ({ e, s: scoreEntry(e, ctx.slot) }))
    .sort((a, b) => b.s - a.s || a.e.qid.localeCompare(b.e.qid))
    .slice(0, TOP_K);
  const rand = seeded(`${ctx.date}|${ctx.lang}|${ctx.slot}|${attempt}`);
  return weightedPick(top, (x) => x.s, rand)?.e;
}
