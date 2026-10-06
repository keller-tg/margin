// npm run content:trail -- [--from 2026-10-06] [--days 30] [--langs en,de,fr]
//
// The Rabbit Trail's offline fallback: for every morning thing, a pool of screened trail stops taken from
// the morning article's links (lead first, then the whole article if the lead is thin), with everything
// a hop needs, written to public/trail/{lang}/{date}.json. The browser uses it when Wikipedia can't be
// reached, is rate-limited, or offers fewer than four stops that pass the screen.
//
// Same screening code as the browser (src/core/trail), through the cached, sequential, polite pipeline
// client (scripts/content/lib/wiki.ts). Re-running is free: every response is in content/cache/api.
import { parseArgs } from 'node:util';
import type { Packet } from '../../src/core/compose/packet';
import { seeded } from '../../src/core/rng/rng';
import { PACE_IDS } from '../../src/core/pace/pace';
import { trailRules } from '../../src/core/trail/screen';
import { CHOICES, findSeeds, HOPS, type TrailPool, type TrailSeed } from '../../src/core/trail/trail';
import { readFileSync } from 'node:fs';
import { addDays, loadQueue, p, packetPath, readJson, writeJson } from './lib/store';
import { actionApi, setLogger, stats, type WikiLang } from './lib/wiki';

const { values } = parseArgs({
  options: { from: { type: 'string', default: '2026-10-06' }, days: { type: 'string', default: '30' }, langs: { type: 'string', default: 'en,de,fr' } },
});
const FROM = values.from!;
const DAYS = Number(values.days);
const LANGS = values.langs!.split(',') as WikiLang[];

/** Twice what five hops of four choices need (8), so every pace still finds four that fit. */
export const POOL_SIZE = 16;
/** Below this a trail could run out of fresh choices before its fifth hop. */
const POOL_MIN = HOPS + CHOICES - 1;
const THIS_YEAR = new Date().getUTCFullYear();

setLogger((m) => process.stderr.write(`  ${m}\n`));

const read = (f: string) => readFileSync(p(f), 'utf8');
const report: { id: string; from: string; seeds: number; leadOnly: boolean; requests: number; rejected: Record<string, number> }[] = [];
let thin = 0;

for (const lang of LANGS) {
  const rules = trailRules({ titles: read('content/blocklist/titles.txt'), qids: read('content/blocklist/qids.txt'), categories: read(`content/blocklist/categories.${lang}.txt`), topics: read(`content/blocklist/trail-topics.${lang}.txt`) });
  const queue = loadQueue(lang);
  const api = (params: Record<string, string | number>) => actionApi(lang, params);
  for (let d = 0; d < DAYS; d++) {
    const date = addDays(FROM, d);
    if (!queue[date]?.morning) continue;
    const packet = readJson<Packet | null>(packetPath(lang, date, 'morning'), null);
    if (!packet) throw new Error(`missing packet ${lang} ${date} morning: run content:prepare`);
    const title = packet.topic.title;
    const common = { lang, rules, thisYear: THIS_YEAR, want: POOL_SIZE, paces: PACE_IDS, rand: seeded(`trail-pool:${lang}:${date}`) } as const;
    const first = await findSeeds(api, { ...common, from: title, exclude: [], leadOnly: true, maxMetaBatches: 3 });
    let seeds: TrailSeed[] = first.seeds;
    let rejected = first.rejected;
    let requests = first.requests;
    const leadOnly = seeds.length >= POOL_SIZE;
    if (!leadOnly) {
      const more = await findSeeds(api, { ...common, want: POOL_SIZE - seeds.length, from: title, exclude: seeds.map((s) => s.title), leadOnly: false, maxMetaBatches: 4 });
      seeds = [...seeds, ...more.seeds];
      rejected = [...rejected, ...more.rejected];
      requests += more.requests;
    }
    const pool: TrailPool = { version: 1, lang, date, from: { title, revid: packet.topic.revid }, seeds };
    writeJson(p(`public/trail/${lang}/${date}.json`), pool);
    const reasons: Record<string, number> = {};
    for (const r of rejected) {
      const k = r.reason.replace(/".*"/, '"…"');
      reasons[k] = (reasons[k] ?? 0) + 1;
    }
    report.push({ id: `${lang}-${date}`, from: title, seeds: seeds.length, leadOnly, requests, rejected: reasons });
    if (seeds.length < POOL_MIN) thin++;
    process.stderr.write(`${seeds.length >= POOL_MIN ? '✓' : '✗'} ${lang} ${date} ${title}: ${seeds.length} stops${leadOnly ? '' : ' (lead + article)'}\n`);
  }
}

for (const lang of LANGS) writeJson(p(`content/reports/trail-pools.${lang}.json`), report.filter((r) => r.id.startsWith(`${lang}-`)));
const total = report.reduce((a, r) => a + r.seeds, 0);
process.stderr.write(`\n${report.length} pools, ${total} stops (avg ${(total / Math.max(1, report.length)).toFixed(1)}); thin (< ${POOL_MIN}): ${thin}; network ${stats.network}, cached ${stats.cached}\n`);
if (thin) process.exitCode = 1;
