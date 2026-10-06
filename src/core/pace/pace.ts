// The three paces. Labels have no minutes (decision 3): they differ only by word limits and page counts.
import type { PageType, PaceId, Slot } from '../schema/thing';

export type PaceSpec = {
  /** [min, max] pages for a morning thing, title and closing included (the app's END page is not). */
  pages: readonly [number, number];
  /** Exact page count for an evening thing, title and closing included. */
  eveningPages: number;
  maxWords: number;
  types: readonly PageType[];
  /** [min, max] pages per Rabbit Trail hop. */
  trailHopPages: readonly [number, number];
};

const EASY_TYPES = ['title', 'sentence', 'image', 'bignumber', 'closing'] as const;

export const PACES: Record<PaceId, PaceSpec> = {
  easy: { pages: [4, 4], eveningPages: 2, maxWords: 15, types: EASY_TYPES, trailHopPages: [1, 2] },
  medium: { pages: [6, 7], eveningPages: 3, maxWords: 25, types: [...EASY_TYPES, 'timeline', 'map'], trailHopPages: [2, 3] },
  deep: { pages: [10, 12], eveningPages: 4, maxWords: 40, types: [...EASY_TYPES, 'timeline', 'map', 'compare'], trailHopPages: [3, 4] },
};

export const PACE_IDS: readonly PaceId[] = ['easy', 'medium', 'deep'];

export function pageRange(pace: PaceId, slot: Slot): readonly [number, number] {
  const p = PACES[pace];
  return slot === 'evening' ? [p.eveningPages, p.eveningPages] : p.pages;
}
