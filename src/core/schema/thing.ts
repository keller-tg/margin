// The daily "thing": what the pipeline bakes and the player plays. See docs/plan.md §3.
import type { Credit } from '../license/license';
import type { Lang } from '../typography/typography';

export type Slot = 'morning' | 'evening';
export type PaceId = 'easy' | 'medium' | 'deep';

export const DOMAINS = [
  'animals', 'plants', 'food', 'instruments', 'chemistry', 'earth', 'islands', 'landscapes', 'water',
  'household', 'tools', 'astronomy', 'people-science', 'people-arts', 'people-other', 'history', 'cities',
  'places', 'architecture', 'literature', 'music', 'art', 'film', 'myth', 'religion', 'philosophy', 'sport',
  'language', 'society', 'medicine', 'biology', 'physics', 'technology', 'mathematics',
] as const;
export type Domain = (typeof DOMAINS)[number];

export type ImgId = string;
export type FactId = string;

export type Emphasis = { phrase: string; mark: 'underline' | 'circle' | 'box' | 'bracket' };
export type Aside = { text: string; arrowTo?: string };

export type Page =
  | { type: 'title'; title: string; line: string; image?: ImgId }
  | { type: 'sentence'; text: string; marks?: Emphasis[]; aside?: Aside }
  | { type: 'bignumber'; fact: FactId; display: string; caption: string; aside?: Aside }
  | { type: 'timeline'; events: { fact: FactId; label: string }[] }
  | { type: 'image'; image: ImgId; caption: string }
  | { type: 'map'; map: string; label: string }
  | { type: 'compare'; items: { label: string; fact: FactId }[]; caption: string; shape: 'bars' | 'heights' | 'circles' }
  | { type: 'closing'; text: string };

export type PageType = Page['type'];

export type Fact = {
  kind: 'number' | 'measure' | 'date' | 'coords';
  value: number | string;
  unit?: string;
  /** The exact text span in the source, e.g. "8,849 metres". */
  surface: string;
  /** The source sentence the fact came from (keeps authors honest; see plan §6). */
  sentence?: string;
  /** Set for reference objects on compare pages (content/refs): the ref's id. */
  ref?: string;
};

/** A pre-projected map sketch (plan §3): coastline strokes in a 600×420 box, the point, and a closer view. */
export type MapData = { viewBox: string; zoomBox: string; paths: string[]; point: [number, number] };

export type ThingImage = {
  file: string;
  w: number;
  h: number;
  alt: string;
  /** Standard-width Commons thumbnail the build step downloads and re-encodes. Never loaded by visitors. */
  thumb: string | null;
  sha1: string;
  credit: Credit;
};

export type Source = { title: string; url: string; revid: number; license: 'CC BY-SA 4.0' };

export type Thing = {
  schema: 1;
  id: string;
  date: string;
  lang: Lang;
  slot: Slot;
  topic: { title: string; qid: string; pageid: number; revid: number; domain: Domain; teaser: string };
  sources: Source[];
  images: Record<ImgId, ThingImage>;
  facts: Record<FactId, Fact>;
  maps?: Record<string, MapData>;
  paces: Record<PaceId, Page[]>;
  authoredBy: 'curated' | 'extractive';
  qualityScore: number;
  verified?: { version: number; hash: string };
};
