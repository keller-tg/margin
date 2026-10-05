// Builds public/favicon.svg from the Caveat "m" outline: one margin line on paper, one handwritten m.
// Run after fonts:build if the wordmark changes:  node scripts/brand/build-icons.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const { m } = JSON.parse(await fs.readFile(path.join(root, 'src/brand/wordmark-paths.json'), 'utf8'));

const S = 64; // icon size
const baseline = 44; // rule the m sits on
const glyphH = -m.y1; // x-height-ish of "m" at font size 100
const scale = 30 / glyphH;
const lineX = 18;
const tx = lineX + 9 - m.x1 * scale;
const ty = baseline;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
  <style>
    .p{fill:#f7f2e8}.r{stroke:#6082a5;stroke-opacity:.32}.l{stroke:#c0674a}.i{fill:#2e2c29}
    @media (prefers-color-scheme:dark){.p{fill:#24211e}.r{stroke:#ece3d2;stroke-opacity:.14}.l{stroke:#c9785c}.i{fill:#ece3d2}}
  </style>
  <rect class="p" width="${S}" height="${S}" rx="12"/>
  <path class="r" stroke-width="1.2" d="M0 ${baseline + 0.6}H${S}M0 ${baseline - 22 + 0.6}H${S}"/>
  <path class="l" stroke-width="2.2" d="M${lineX} 0V${S}"/>
  <path class="i" transform="translate(${tx.toFixed(2)} ${ty}) scale(${scale.toFixed(4)})" d="${m.d}"/>
</svg>
`;
await fs.writeFile(path.join(root, 'public/favicon.svg'), svg);
console.log('wrote public/favicon.svg');
