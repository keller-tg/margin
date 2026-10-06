// npm run content:refs — builds content/refs/refs.json from content/refs/refs.config.json.
//
// For every reference object and language, the value is taken from that language's own Wikipedia
// article (lead first, then sections): the first metric length within `tolerance` of `approx`. The
// sentence, revision and URL are stored with it, so the verifier can check refs like any other source.
// A reference that cannot be found in a language is left out for that language (and reported).
import type { Lang } from '../../src/core/typography/typography';
import { proseForSplitting } from '../../src/core/compose/clean';
import { findNumbers } from '../../src/core/numbers/numbers';
import { inMetres } from '../../src/core/numbers/units';
import { splitSentences } from '../../src/core/text/sentences';
import { fetchArticle } from './lib/article';
import { p, readJson, writeJson } from './lib/store';
import { stats, type WikiLang } from './lib/wiki';

type RefConfig = { id: string; dimension: 'length'; approx: number; tolerance: number; titles: Record<Lang, string>; labels: Record<Lang, string> };
export type RefEntry = {
  id: string;
  dimension: 'length';
  label: string;
  value: number;
  unit: string;
  surface: string;
  metres: number;
  sentence: string;
  source: { title: string; revid: number; url: string };
};
export type RefTable = Record<Lang, RefEntry[]>;

const config = readJson<{ refs: RefConfig[] }>(p('content/refs/refs.config.json'), { refs: [] });
const out: RefTable = { en: [], de: [], fr: [] };
const missing: string[] = [];

for (const ref of config.refs) {
  for (const lang of ['en', 'de', 'fr'] as WikiLang[]) {
    const a = await fetchArticle(lang, ref.titles[lang]);
    if (!a) { missing.push(`${ref.id}/${lang}: article missing`); continue; }
    const texts = [a.lead, ...a.sections.map((s) => s.text)];
    let found: RefEntry | null = null;
    for (const t of texts) {
      for (const sentence of splitSentences(proseForSplitting(t), lang)) {
        for (const h of findNumbers(sentence, lang)) {
          const m = inMetres(h.value, h.unit);
          if (m === null || Math.abs(m - ref.approx) / ref.approx > ref.tolerance) continue;
          // never the end of a range ("29.9–30.5 m", "zwischen 20 und 29 Meter", "de 25 à 27 m"): one value or none
          if (/\d[\d.,'’\u00a0 ]*\s*(–|-|bis|und|à|to|and|or|oder|ou)\s*$/i.test(sentence.slice(0, h.index))) continue;
          if (/^\s*(–|-|bis|à|to)\s*\d/.test(sentence.slice(h.index + h.surface.length))) continue;
          found = {
            id: ref.id, dimension: ref.dimension, label: ref.labels[lang], value: h.value, unit: h.unit!, surface: h.surface, metres: m, sentence,
            source: { title: a.title, revid: a.revid, url: `https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(a.title.replace(/ /g, '_'))}&oldid=${a.revid}` },
          };
          break;
        }
        if (found) break;
      }
      if (found) break;
    }
    if (found) out[lang].push(found);
    else missing.push(`${ref.id}/${lang}: no length near ${ref.approx} m in the article`);
  }
}

writeJson(p('content/refs/refs.json'), out);
for (const lang of ['en', 'de', 'fr'] as const) for (const r of out[lang]) console.log(`${lang} ${r.id.padEnd(10)} ${r.surface.padEnd(16)} ← ${r.sentence.slice(0, 110)}`);
if (missing.length) console.log(`missing:\n  ${missing.join('\n  ')}`);
console.error(`network ${stats.network}, cache ${stats.cached}, waited ${Math.round(stats.waitedMs / 1000)}s`);
