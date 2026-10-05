// Verifies that the shipped web fonts draw every German/French glyph themselves (no browser fallback).
// Renders each character in Chromium and asks the engine (CSS.getPlatformFontsForNode) which font drew it.
// Run: npm run fonts:check   (exits non-zero on any fallback)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const REQUIRED = [...'äöüÄÖÜß„“‚‘»«éèêëàâîïôûùÿçœæÉÈÊËÀÂÎÏÔÛÙÇŒÆŸ‘’“”–—…·€°0123456789'];
const FONTS = [
  { family: 'Caveat', file: 'caveat.woff2' },
  { family: 'Playpen Sans', file: 'playpen-sans.woff2' },
  { family: 'Inter', file: 'inter.woff2' },
];

const faces = FONTS.map(
  (f) => `@font-face{font-family:"${f.family}";src:url("${path.join(root, 'public/fonts', f.file)}") format("woff2")}`,
).join('');
const rows = FONTS.map(
  (f) =>
    `<div style="font-family:'${f.family}',monospace">${REQUIRED.map((c) => `<span data-f="${f.family}">${c}</span>`).join('')}</div>`,
).join('');
const tmp = path.join(os.tmpdir(), `margin-glyphs-${process.pid}.html`);
fs.writeFileSync(tmp, `<!doctype html><meta charset="utf-8"><style>${faces}body{font-size:24px}</style>${rows}`);

const executablePath = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
await page.goto('file://' + tmp);
await page.evaluate(() => document.fonts.ready);
const cdp = await page.context().newCDPSession(page);
await cdp.send('DOM.enable');
await cdp.send('CSS.enable');
const { root: doc } = await cdp.send('DOM.getDocument', { depth: -1 });
const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: doc.nodeId, selector: 'span[data-f]' });

const failures = [];
for (const nodeId of nodeIds) {
  const { node } = await cdp.send('DOM.describeNode', { nodeId, depth: 1 });
  const family = node.attributes[node.attributes.indexOf('data-f') + 1];
  const ch = node.children?.[0]?.nodeValue;
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  if (!(fonts.length === 1 && fonts[0].isCustomFont)) {
    failures.push(`${family}: "${ch}" drawn by ${fonts.map((f) => f.familyName).join(' + ')}`);
  }
}
await browser.close();
fs.rmSync(tmp);

if (failures.length) {
  console.error('Glyph fallback detected:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log(`OK: ${FONTS.length} fonts × ${REQUIRED.length} glyphs, all drawn by the fonts themselves.`);
