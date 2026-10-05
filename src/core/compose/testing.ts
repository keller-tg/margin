// Test helpers over the HANDMADE packet fixture (fixtures/README.md). Not used by the app or pipeline.
import handmade from '../../../fixtures/wikimedia/packet-en.handmade.json';
import type { VerifyContext } from '../verify/verify';
import { extractFacts } from './facts';
import type { Packet } from './packet';

export function fixturePacket(slot: 'morning' | 'evening' = 'morning'): Packet {
  const { _FIXTURE, ...p } = structuredClone(handmade) as unknown as Packet & { _FIXTURE: string };
  void _FIXTURE;
  p.slot = slot;
  p.facts = extractFacts('en', [{ text: p.source.lead }, ...p.source.sections.map((s) => ({ text: s.text, section: s.heading }))], null);
  return p;
}
export const emptyCtx: VerifyContext = { blocklist: { titles: new Set(), qids: new Set(), categoryPatterns: [] }, deLexicon: new Set() };

