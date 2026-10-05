// npm run content:preview -- <lang>/<date>.<slot> [...] [--pace easy|medium|deep]
// Prints things as plain text in the terminal, for a human read-through.
import { parseArgs } from 'node:util';
import type { Page, PaceId, Thing } from '../../src/core/schema/thing';
import { p, readJson } from './lib/store';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { pace: { type: 'string' } } });

function render(pg: Page, t: Thing): string {
  switch (pg.type) {
    case 'title': return `▌ ${pg.title}\n  ${pg.line}${pg.image ? `\n  [photo: ${t.images[pg.image]?.file}]` : ''}`;
    case 'sentence': return `  ${pg.text}`;
    case 'closing': return `  ${pg.text}   ◦ end`;
    case 'bignumber': return `  ┃ ${pg.display} ┃\n  ${pg.caption}`;
    case 'image': return `  [photo: ${t.images[pg.image]?.file}] — ${pg.caption}`;
    case 'timeline': return pg.events.map((e) => `  ● ${t.facts[e.fact]?.value}  ${e.label}`).join('\n');
    case 'map': return `  [map] ${pg.label}`;
    case 'compare': return `  [compare] ${pg.caption}`;
  }
}

for (const ref of positionals) {
  const t = readJson<Thing>(p(`public/daily/${ref}.json`), null as unknown as Thing);
  const paces = (values.pace ? [values.pace] : ['easy', 'medium', 'deep']) as PaceId[];
  console.log(`\n══ ${t.lang} · ${t.date} · ${t.slot} · ${t.topic.title} [${t.topic.domain}] · quality ${t.qualityScore}`);
  for (const pace of paces) {
    console.log(`── ${pace} (${t.paces[pace].length} pages)`);
    t.paces[pace].forEach((pg, i) => console.log(`${String(i + 1).padStart(2)}. ${render(pg, t).trimStart()}`));
  }
  for (const [id, img] of Object.entries(t.images)) {
    const c = img.credit;
    console.log(`   ${id} credit: ${c.attribution ?? c.author}${c.authorSource === 'uploader' ? ' (uploader)' : ''} · ${c.license}${c.licenseUrl ? ` <${c.licenseUrl}>` : ''} · ${c.fileUrl}`);
  }
  console.log(`   text: ${t.sources[0]?.url} (CC BY-SA 4.0)`);
}
