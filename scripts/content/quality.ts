// npm run content:quality -- [--seed <text>] [--samples 5]
//
// (a) A seeded RANDOM draw of sample pages across slots, languages and paces — not hand-picked.
//     The draw repeats (same seed sequence) until the samples cover both slots, all three languages and
//     all three paces; the seed and the number of draws are printed so anyone can reproduce it.
// (b) The weakest 10% of all baked things by the automatic assessment (src/core/quality/assess.ts),
//     with the reasons. Written to content/reports/quality.json as well.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { PACE_IDS } from '../../src/core/pace/pace';
import { assessThing, type Finding } from '../../src/core/quality/assess';
import { seeded } from '../../src/core/rng/rng';
import type { Page, PaceId, Thing } from '../../src/core/schema/thing';
import { p, readJson, writeJson } from './lib/store';

const { values } = parseArgs({ options: { seed: { type: 'string', default: 'margin-review-2026-10-06' }, samples: { type: 'string', default: '5' } } });
const SEED = values.seed!;
const N = Number(values.samples);

const things: Thing[] = [];
for (const lang of ['en', 'de', 'fr']) {
  const dir = p(`public/daily/${lang}`);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) things.push(readJson<Thing>(join(dir, f), null as unknown as Thing));
}
const assessed = things.map((t) => ({ t, ...assessThing(t) }));

function render(pg: Page, t: Thing): string {
  switch (pg.type) {
    case 'title': return `**${pg.title}**: *${pg.line}*${pg.image ? ' [photo]' : ''}`;
    case 'sentence': return pg.text;
    case 'closing': return `${pg.text} ◦`;
    case 'bignumber': return `┃ **${pg.display}** ┃ ${pg.caption}`;
    case 'image': return `[photo: ${t.images[pg.image]?.file.replace(/^File:/, '')}]`;
    case 'timeline': return 'Timeline: ' + pg.events.map((e) => `${t.facts[e.fact]?.value} ${e.label}`).join(' · ');
    case 'map': return `[map] ${pg.label}`;
    case 'compare': return `[compare] ${pg.caption}`;
  }
}

// (a) seeded random, stratified by rejection sampling
const rand = seeded(SEED);
let sample: { t: Thing; pace: PaceId }[] = [];
let draws = 0;
for (; draws < 10000; draws++) {
  const picked = new Set<number>();
  sample = [];
  while (sample.length < N) {
    const i = Math.floor(rand() * things.length);
    if (picked.has(i)) continue;
    picked.add(i);
    sample.push({ t: things[i]!, pace: PACE_IDS[Math.floor(rand() * 3)]! });
  }
  const covers = new Set(sample.map((s) => s.t.slot)).size === 2 && new Set(sample.map((s) => s.t.lang)).size === 3 && new Set(sample.map((s) => s.pace)).size === 3;
  if (covers) break;
}
console.log(`## (a) Random samples: seed "${SEED}", draw ${draws + 1}`);
for (const [k, s] of sample.entries()) {
  const a = assessed.find((x) => x.t === s.t)!;
  console.log(`\n**${k + 1} · ${s.t.lang.toUpperCase()} ${s.t.slot} ${s.t.date} · ${s.t.topic.title} · ${s.pace} (${s.t.paces[s.pace].length} pages) · score ${a.score}**`);
  s.t.paces[s.pace].forEach((pg, i) => console.log(`${i + 1}. ${render(pg, s.t)}`));
  const c = s.t.images.img1?.credit;
  if (c) console.log(`   credit: ${c.attribution ?? c.author}${c.authorSource === 'uploader' ? ' (uploader)' : ''} · ${c.license}${c.licenseUrl ? ' · license link' : ''} · Commons file page`);
}

// (b) weakest 10%
const sorted = [...assessed].sort((a, b) => a.score - b.score || a.t.id.localeCompare(b.t.id));
const weakest = sorted.slice(0, Math.ceil(things.length * 0.1));
const summarize = (fs: Finding[]) => {
  const by = new Map<string, Finding[]>();
  for (const f of fs) by.set(f.problem, [...(by.get(f.problem) ?? []), f]);
  return [...by].map(([k, v]) => `${k} ×${v.length} (${[...new Set(v.map((x) => x.pace))].join('/')}): "${v[0]!.detail.slice(0, 90)}"`);
};
console.log(`\n## (b) Weakest 10%: ${weakest.length} of ${things.length}`);
for (const w of weakest) console.log(`- ${w.t.id} · ${w.t.topic.title} · score ${w.score}\n    ${summarize(w.findings).join('\n    ')}`);

const totals: Record<string, number> = {};
for (const a of assessed) for (const f of a.findings) totals[f.problem] = (totals[f.problem] ?? 0) + 1;
console.log(`\nAll ${things.length} things, problem counts: ${JSON.stringify(totals)}`);
console.log(`Score distribution: ${JSON.stringify(Object.entries(assessed.reduce<Record<string, number>>((acc, a) => { const k = a.score >= 0.9 ? '≥0.9' : a.score >= 0.75 ? '0.75–0.9' : a.score >= 0.6 ? '0.6–0.75' : '<0.6'; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})))}`);

writeJson(p('content/reports/quality.json'), {
  generatedAt: new Date().toISOString(), seed: SEED, draws: draws + 1,
  samples: sample.map((s) => ({ id: s.t.id, pace: s.pace })),
  totals,
  weakest: weakest.map((w) => ({ id: w.t.id, title: w.t.topic.title, score: w.score, findings: w.findings })),
  all: assessed.map((a) => ({ id: a.t.id, score: a.score, problems: a.findings.map((f) => f.problem) })),
});
