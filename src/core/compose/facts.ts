// Facts for a packet: every number, measure and year in the source, with its sentence.
import { findNumbers } from '../numbers/numbers';
import type { Fact } from '../schema/thing';
import { splitSentences } from '../text/sentences';
import { proseForSplitting } from './clean';
import type { Lang } from '../typography/typography';

/**
 * Part of a catalogue ID or code, not a quantity: "SMNK-PAL 10,000", "NGC 4486", "No. 5", "Nr. 9", "n° 3".
 * Letters-hyphen-letters/digits immediately before the number give it away.
 */
export function isCodeNumber(sentence: string, index: number): boolean {
  const before = sentence.slice(Math.max(0, index - 24), index);
  return /(^|[\s(])[\p{Lu}\d]{2,}(?:[-–][\p{Lu}\d]+)*[-–\s]$/u.test(before) || /\b(No|Nos|Nr|n°|N°|#)\.?\s?$/u.test(before);
}

export type PacketFact = Fact & { section?: string };

export function extractFacts(lang: Lang, parts: { text: string; section?: string }[], coords: [number, number] | null): Record<string, PacketFact> {
  const facts: Record<string, PacketFact> = {};
  let n = 0;
  for (const part of parts) {
    for (const sentence of splitSentences(proseForSplitting(part.text), lang)) {
      for (const h of findNumbers(sentence, lang)) {
        // skip numbers glued to letters or inside identifiers ("A380", "COVID-19", "Ludwig XIV")
        const before = sentence[h.index - 1] ?? ' ';
        if (/[\p{L}\-/]/u.test(before)) continue;
        if (isCodeNumber(sentence, h.index)) continue;
        const id = `f${++n}`;
        facts[id] = {
          kind: h.isYear ? 'date' : h.unit ? 'measure' : 'number',
          value: h.isYear ? String(h.value) : h.value,
          ...(h.unit ? { unit: h.unit } : {}),
          surface: h.surface,
          sentence,
          ...(part.section ? { section: part.section } : {}),
        };
      }
    }
  }
  if (coords) facts.c1 = { kind: 'coords', value: `${coords[0]},${coords[1]}`, surface: '' };
  return facts;
}
