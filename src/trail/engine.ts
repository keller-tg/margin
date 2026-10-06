// Where can the trail go next? Live from Wikipedia when it answers with four stops that pass the screen;
// otherwise from the morning thing's pre-baked pool. After a network failure (offline, timeout, 429,
// blocked) the rest of the trail stays on the pool, so Wikipedia isn't asked again and again.
import type { PaceId } from '../core/schema/thing';
import { seeded } from '../core/rng/rng';
import { trailRules, type TrailRules } from '../core/trail/screen';
import { CHOICES, findSeeds, poolChoices, type Api, type TrailPool, type TrailSeed } from '../core/trail/trail';
import type { Lang } from '../core/typography/typography';
import titlesTxt from '../../content/blocklist/titles.txt?raw';
import qidsTxt from '../../content/blocklist/qids.txt?raw';
import catEn from '../../content/blocklist/categories.en.txt?raw';
import catDe from '../../content/blocklist/categories.de.txt?raw';
import catFr from '../../content/blocklist/categories.fr.txt?raw';
import topEn from '../../content/blocklist/trail-topics.en.txt?raw';
import topDe from '../../content/blocklist/trail-topics.de.txt?raw';
import topFr from '../../content/blocklist/trail-topics.fr.txt?raw';

const CATEGORIES: Record<Lang, string> = { en: catEn, de: catDe, fr: catFr };
const TOPICS: Record<Lang, string> = { en: topEn, de: topDe, fr: topFr };
const rulesCache = new Map<Lang, TrailRules>();
export function rulesFor(lang: Lang): TrailRules {
  let r = rulesCache.get(lang);
  if (!r) rulesCache.set(lang, (r = trailRules({ titles: titlesTxt, qids: qidsTxt, categories: CATEGORIES[lang], topics: TOPICS[lang] })));
  return r;
}

export type Source = 'live' | 'pool';
export type Options = { options: TrailSeed[]; source: Source; offline: boolean };

export type NextQuery = {
  lang: Lang;
  date: string;
  pace: PaceId;
  /** The article the reader is standing on. */
  from: string;
  /** The trail so far (the morning thing included). */
  visited: readonly string[];
  pool: TrailPool | null;
  /** True once a live request has failed on this trail. */
  stayOffline: boolean;
  api: Api;
  online?: boolean;
};

export async function nextOptions(q: NextQuery): Promise<Options> {
  const fromPool = (offline: boolean): Options => ({
    options: q.pool ? poolChoices(q.pool, q.visited, q.lang, q.pace, seeded(`trail:${q.lang}:${q.date}:${q.visited.length}`)) : [],
    source: 'pool',
    offline,
  });
  if (q.stayOffline || q.online === false) return fromPool(true);
  try {
    const r = await findSeeds(q.api, {
      lang: q.lang,
      from: q.from,
      exclude: q.visited,
      rules: rulesFor(q.lang),
      thisYear: new Date().getFullYear(),
      want: CHOICES,
      leadOnly: true,
      maxMetaBatches: 1,
      paces: [q.pace],
      rand: seeded(`trail:${q.lang}:${q.date}:${q.from}`),
    });
    if (r.seeds.length >= CHOICES) return { options: r.seeds, source: 'live', offline: false };
    return fromPool(false); // Wikipedia answered, but fewer than four stops passed the screen
  } catch {
    return fromPool(true);
  }
}
