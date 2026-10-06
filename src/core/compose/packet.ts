// The authoring packet (plan §5): everything a thing may say, with its provenance.
// Curated text and extractive text are both checked against it by the verifier.
import type { Domain, Fact, PaceId, Slot, ThingImage } from '../schema/thing';
import type { Lang } from '../typography/typography';

export type Packet = {
  packetVersion: 1;
  date: string;
  slot: Slot;
  lang: Lang;
  topic: { title: string; qid: string; pageid: number; revid: number; url: string; domain: Domain };
  limits: Record<PaceId, { pages: readonly [number, number]; maxWords: number }>;
  source: {
    /** Wikidata short description (CC0), plain text, may be empty. */
    description: string;
    /** Plain text of the article lead. */
    lead: string;
    /** Deep material from later sections, capped. */
    sections: { heading: string; text: string }[];
  };
  facts: Record<string, Fact & { section?: string }>;
  images: Record<string, ThingImage>;
  /** Category names, for the blocklist re-check. */
  categories: string[];
  /** Reference objects for compare pages, each with its own source sentence (content/refs/refs.json). */
  refs?: RefSource[];
};

export type RefSource = {
  id: string;
  label: string;
  value: number;
  unit: string;
  surface: string;
  metres: number;
  sentence: string;
  source: { title: string; revid: number; url: string };
};

/** All text a thing is allowed to draw numbers, years and names from. */
export function sourceText(p: Packet): string {
  return [
    p.topic.title, p.source.description, p.source.lead, ...p.source.sections.flatMap((s) => [s.heading, s.text]),
    // refs are sources too: their labels and sentences (with their own numbers) are allowed text
    ...(p.refs ?? []).flatMap((r) => [r.label, r.sentence]),
  ].join('\n');
}
