// npm run content:trail-fixture -- --lang en --date 2026-10-08 --pace medium --picks 1,0,0,0,0
//
// Records a RECORDED FIXTURE for the live-trail e2e test: walks one trail exactly as the browser would
// (same requests, same seeded order, same screen), through the cached pipeline client, and saves every
// response keyed by its request parameters to e2e/fixtures/trail-api.recorded.{lang}-{date}.json.
// The e2e test answers the browser's Wikipedia requests from this file, so CI never calls the API.
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import type { Packet } from '../../src/core/compose/packet';
import type { PaceId } from '../../src/core/schema/thing';
import { seeded } from '../../src/core/rng/rng';
import { trailRules } from '../../src/core/trail/screen';
import { CHOICES, findSeeds, HOPS } from '../../src/core/trail/trail';
import { fixtureKey } from '../../src/core/trail/fixture';
import { p, packetPath, readJson, writeJson } from './lib/store';
import { actionApi, type WikiLang } from './lib/wiki';

const { values } = parseArgs({
  options: { lang: { type: 'string', default: 'en' }, date: { type: 'string', default: '2026-10-08' }, pace: { type: 'string', default: 'medium' }, picks: { type: 'string', default: '1,0,0,0,0' }, year: { type: 'string', default: '2026' } },
});
const lang = values.lang as WikiLang;
const date = values.date!;
const pace = values.pace as PaceId;
const picks = values.picks!.split(',').map(Number);
const read = (f: string) => readFileSync(p(f), 'utf8');
const rules = trailRules({ titles: read('content/blocklist/titles.txt'), qids: read('content/blocklist/qids.txt'), categories: read(`content/blocklist/categories.${lang}.txt`), topics: read(`content/blocklist/trail-topics.${lang}.txt`) });

const responses: Record<string, unknown> = {};
const api = async (params: Record<string, string | number>) => {
  const body = await actionApi(lang, params);
  responses[fixtureKey(params)] = body;
  return body;
};

const packet = readJson<Packet | null>(packetPath(lang, date, 'morning'), null);
if (!packet) throw new Error('no packet');
let from = packet.topic.title;
const visited = [from];
const path: { offered: string[]; chose: string }[] = [];
for (let hop = 0; hop < HOPS; hop++) {
  const r = await findSeeds(api, { lang, from, exclude: visited, rules, thisYear: Number(values.year), want: CHOICES, leadOnly: true, maxMetaBatches: 1, paces: [pace], rand: seeded(`trail:${lang}:${date}:${from}`) });
  if (r.seeds.length < CHOICES) throw new Error(`hop ${hop + 1} from ${from}: only ${r.seeds.length} stops pass; pick another path`);
  const chose = r.seeds[picks[hop] ?? 0]!;
  path.push({ offered: r.seeds.map((s) => s.title), chose: chose.title });
  process.stderr.write(`hop ${hop + 1} from ${from} (${r.requests} requests): ${r.seeds.map((s) => s.title).join(' · ')} → ${chose.title}\n`);
  visited.push(chose.title);
  from = chose.title;
}
writeJson(p(`e2e/fixtures/trail-api.recorded.${lang}-${date}.json`), {
  note: 'RECORDED FIXTURE: real Wikipedia Action API responses (CC BY-SA 4.0 text), recorded through the cached pipeline client by scripts/content/trail-fixture.ts. Used only by e2e/trail.spec.ts.',
  lang, date, pace, path, responses,
});
