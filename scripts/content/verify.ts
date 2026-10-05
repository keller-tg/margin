// npm run content:verify — re-verifies every baked thing against its packet and the current blocklist.
// Where the packet has been pruned, it checks the stamp's verifier version instead.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Packet } from '../../src/core/compose/packet';
import type { Slot, Thing } from '../../src/core/schema/thing';
import { stampFor, VERIFIER_VERSION, verifyThing } from '../../src/core/verify/verify';
import { loadVerifyContext, p, packetPath, readJson } from './lib/store';
import type { WikiLang } from './lib/wiki';

let checked = 0;
let failed = 0;
for (const lang of ['en', 'de', 'fr'] as WikiLang[]) {
  const dir = p(`public/daily/${lang}`);
  let files: string[] = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { continue; }
  const ctx = loadVerifyContext(lang);
  for (const f of files) {
    const thing = readJson<Thing>(join(dir, f), null as unknown as Thing);
    const [date, slot] = f.replace(/\.json$/, '').split('.') as [string, Slot];
    const packet = readJson<Packet | null>(packetPath(lang, date, slot), null);
    checked++;
    if (!packet) {
      if (thing.verified?.version !== VERIFIER_VERSION) { failed++; console.error(`✗ ${lang}/${f}: no packet and stamp is not v${VERIFIER_VERSION}`); }
      continue;
    }
    const issues = verifyThing(thing, packet, ctx);
    if (thing.verified?.hash !== stampFor(thing, packet).hash) issues.push({ rule: 'stamp', where: 'file', message: 'stamp does not match content and packet' });
    if (issues.length) {
      failed++;
      console.error(`✗ ${lang}/${f}\n${issues.map((i) => `    ${i.rule} @ ${i.where}: ${i.message}`).join('\n')}`);
    }
  }
}
console.error(`${checked - failed}/${checked} things verified`);
if (failed) process.exit(1);
