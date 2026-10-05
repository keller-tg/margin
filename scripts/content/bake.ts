// npm run content:bake -- [--from 2026-10-06] [--days 30] [--langs en,de,fr]
//
// For every queued thing: curated text if it exists and verifies, otherwise the extractive
// composer. Every thing is verified before it is written to public/daily/{lang}/{date}.{slot}.json.
// A thing that fails verification fails the build, loudly.
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { composeExtractive } from '../../src/core/compose/compose';
import type { Packet } from '../../src/core/compose/packet';
import type { Slot, Thing } from '../../src/core/schema/thing';
import { stampFor, verifyThing } from '../../src/core/verify/verify';
import { addDays, dailyPath, loadQueue, loadVerifyContext, p, packetPath, readJson, writeJson } from './lib/store';
import type { WikiLang } from './lib/wiki';

const { values } = parseArgs({
  options: { from: { type: 'string', default: '2026-10-06' }, days: { type: 'string', default: '30' }, langs: { type: 'string', default: 'en,de,fr' } },
});
const FROM = values.from!;
const DAYS = Number(values.days);
const LANGS = values.langs!.split(',') as WikiLang[];
const SLOTS: Slot[] = ['morning', 'evening'];

let failures = 0;
const report: { id: string; title: string; quality: number; notes: string[]; issues: string[] }[] = [];

for (const lang of LANGS) {
  const queue = loadQueue(lang);
  const ctx = loadVerifyContext(lang);
  for (let d = 0; d < DAYS; d++) {
    const date = addDays(FROM, d);
    for (const slot of SLOTS) {
      if (!queue[date]?.[slot]) continue;
      const packet = readJson<Packet | null>(packetPath(lang, date, slot), null);
      if (!packet) throw new Error(`missing packet ${lang} ${date} ${slot}: run content:prepare`);
      const curatedFile = p(`content/curated/${lang}/${date}.${slot}.json`);
      if (existsSync(curatedFile)) process.stderr.write(`  ${lang} ${date} ${slot}: curated text exists but curated baking arrives with the authoring milestone; using extractive\n`);

      let thing: Thing;
      let notes: string[] = [];
      try {
        ({ thing, notes } = composeExtractive(packet));
      } catch (err) {
        failures++;
        report.push({ id: `${lang}-${date}-${slot}`, title: packet.topic.title, quality: 0, notes: [(err as Error).message], issues: [] });
        process.stderr.write(`✗ ${(err as Error).message}\n`);
        continue;
      }
      const issues = verifyThing(thing, packet, ctx);
      report.push({ id: thing.id, title: thing.topic.title, quality: thing.qualityScore, notes, issues: issues.map((i) => `${i.rule} @ ${i.where}: ${i.message}`) });
      if (issues.length) {
        failures++;
        process.stderr.write(`✗ ${thing.id} ${thing.topic.title}\n${issues.map((i) => `    ${i.rule} @ ${i.where}: ${i.message}`).join('\n')}\n`);
        continue;
      }
      thing.verified = stampFor(thing, packet);
      writeJson(dailyPath(lang, date, slot), thing);
    }
  }
}
writeJson(p('content/reports/bake.json'), { generatedAt: new Date().toISOString(), failures, things: report });
process.stderr.write(`baked ${report.length - failures}/${report.length}; report in content/reports/bake.json\n`);
if (failures) process.exit(1);
