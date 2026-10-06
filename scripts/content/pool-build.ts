// npm run pool:build — builds the candidate pool for en/de/fr. Slow, polite, resumable.
//
// Every API response is cached under content/cache/api/ (committed), so an interrupted run
// simply replays what it already has and continues; a finished run never touches the network
// again. Outputs (committed, reviewable):
//   content/pool/{lang}.jsonl.gz        one candidate per line (gzip)
//   content/pool/dropped.{lang}.json    compact: dropped topic → reason
//   content/images/index.json.gz        compact verdict per evaluated file (see lib/images.ts)
//   content/images/rejected.json        compact: rejected file → reason
//   content/reports/pool.json         counts, fallbacks and rejections
//
// Stages:
//   1. Vital Articles Level 4 wikitext → en titles with domain and FA/GA class
//   2. en: pageprops (QID, disambiguation), info (length), pageimages (free), coordinates  [50/request]
//   3. Wikidata SPARQL: P31 human?, birth/death, P18, de/fr sitelinks                     [50/request]
//   4. de + fr: the same props as stage 2 for the sitelinked titles                       [50/request]
//   5. imageinfo + extmetadata for every candidate file not yet in the index, asked of en.wikipedia.org [50/request]
//   6. choose each topic's image per language: own edition → other editions → Wikidata P18
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { canonicalFileTitle } from '../../src/core/license/license';
import { evaluateFiles, indexEntry, isOk, loadIndex, saveIndex } from './lib/images';
import type { Domain } from '../../src/core/schema/thing';
import { classify } from './config/domains';
import { actionApi, actionQueryAll, batches, sparql, stats, titleBatches, type WikiLang } from './lib/wiki';

const ROOT = join(import.meta.dirname, '../..');
const LANGS: WikiLang[] = ['en', 'de', 'fr'];
const VITAL_PAGES = [
  'Arts', 'Biology and health sciences', 'Everyday life', 'Geography', 'History', 'Mathematics', 'People',
  'Philosophy and religion', 'Physical sciences', 'Society and social sciences', 'Technology',
].map((s) => `Wikipedia:Vital articles/Level 4/${s}`);

const PEOPLE_MIN_YEARS_DEAD = 2;
const TODAY = new Date('2026-10-05T00:00:00Z');

export type Candidate = {
  lang: WikiLang;
  title: string;
  pageid: number;
  qid: string;
  domain: Domain;
  evening: boolean;
  abstract: boolean;
  path: string;
  enClass: string | null; // FA, GA, B, C, Start…
  length: number;
  coords: [number, number] | null;
  human: boolean;
  died: string | null;
  image: { file: string; via: 'own' | `edition:${WikiLang}` | 'wikidata-p18' };
  /** Further usable images, in order of preference, for when the image screen rejects `image`. */
  altImages: { file: string; via: 'own' | `edition:${WikiLang}` | 'wikidata-p18' }[];
};

/** Wikidata xsd:dateTime ("1852-11-27T00:00:00Z", "-0399-01-01T00:00:00Z") at least N years before TODAY. */
export function deadLongEnough(died: string | null): boolean {
  const m = died?.match(/^(-?)(\d+)-(\d\d)-(\d\d)/);
  if (!m) return false;
  const year = (m[1] ? -1 : 1) * Number(m[2]);
  const cutoff = TODAY.getUTCFullYear() - PEOPLE_MIN_YEARS_DEAD;
  const md = `${m[3]}-${m[4]}`;
  return year < cutoff || (year === cutoff && md <= TODAY.toISOString().slice(5, 10));
}

const progress = (m: string) => process.stderr.write(`${m}\n`);

// ---------------------------------------------------------------- stage 1
type VitalEntry = { title: string; path: string; enClass: string | null };

async function vitalEntries(): Promise<VitalEntry[]> {
  const body = await actionApi('en', { titles: VITAL_PAGES.join('|'), prop: 'revisions', rvprop: 'content|ids', rvslots: 'main' });
  const out: VitalEntry[] = [];
  for (const p of body.query.pages) {
    const page = p.title.split('/').pop() as string;
    const text: string = p.revisions[0].slots.main.content;
    let h2 = '';
    let h3 = '';
    for (const line of text.split('\n')) {
      const h = line.match(/^(={2,3})\s*([^=]+?)\s*\1\s*$/);
      if (h) {
        const name = h[2]!.replace(/\{\{anchor\|[^}]*\}\}/gi, '').trim();
        if (h[1]!.length === 2) [h2, h3] = [name, ''];
        else h3 = name;
        continue;
      }
      if (!/^#+\s/.test(line)) continue;
      const link = line.match(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/);
      if (!link || /^(Wikipedia|Category|File|Template|:)/i.test(link[1]!)) continue;
      const cls = line.match(/\{\{Icon\|(FA|GA|B|C|Start|Stub|LIST)\}\}/);
      out.push({ title: link[1]!.trim(), path: [page, h2, h3].filter(Boolean).join(' > '), enClass: cls?.[1] ?? null });
    }
  }
  const seen = new Set<string>();
  return out.filter((e) => (seen.has(e.title) ? false : (seen.add(e.title), true)));
}

// ---------------------------------------------------------------- stages 2 & 4
type PageProps = { title: string; pageid: number; qid: string | null; disambig: boolean; length: number; pageimage: string | null; coords: [number, number] | null };

async function pageProps(lang: WikiLang, titles: string[]): Promise<Map<string, PageProps>> {
  const out = new Map<string, PageProps>();
  const all = titleBatches(titles);
  let i = 0;
  for (const b of all) {
    if (++i % 20 === 0) progress(`  ${lang} props ${i}/${all.length}  (net ${stats.network}, cache ${stats.cached}, waited ${Math.round(stats.waitedMs / 1000)}s)`);
    const { pages, raw } = await actionQueryAll(lang, {
      titles: b.join('|'), redirects: 1,
      prop: 'pageprops|info|pageimages|coordinates', ppprop: 'wikibase_item|disambiguation',
      piprop: 'name', pilicense: 'free', pilimit: 50, colimit: 50, coprimary: 'primary',
    });
    // map requested title → final title (normalized / redirected)
    const alias = new Map<string, string>();
    for (const r of raw) for (const n of [...(r.query?.normalized ?? []), ...(r.query?.redirects ?? [])]) alias.set(n.from, n.to);
    const resolve = (t: string) => { let x = t; for (let k = 0; k < 3 && alias.has(x); k++) x = alias.get(x)!; return x; };
    const byTitle = new Map(pages.filter((p) => !p.missing && !p.invalid).map((p) => [p.title as string, p]));
    for (const t of b) {
      const p = byTitle.get(resolve(t));
      if (!p) continue;
      const c = p.coordinates?.[0];
      out.set(t, {
        title: p.title, pageid: p.pageid, qid: p.pageprops?.wikibase_item ?? null,
        disambig: p.pageprops?.disambiguation !== undefined, length: p.length ?? 0,
        pageimage: p.pageimage ?? null, coords: c ? [c.lat, c.lon] : null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- stage 3
type WikidataInfo = { human: boolean; died: string | null; p18: string[]; sitelinks: Partial<Record<WikiLang, string>> };

async function wikidata(qids: string[]): Promise<Map<string, WikidataInfo>> {
  const out = new Map<string, WikidataInfo>();
  const all = batches(qids, 50);
  let i = 0;
  for (const b of all) {
    if (++i % 20 === 0) progress(`  wikidata ${i}/${all.length}  (net ${stats.network}, cache ${stats.cached}, waited ${Math.round(stats.waitedMs / 1000)}s)`);
    const q = `SELECT ?item ?human ?died ?img ?de ?fr WHERE {
      VALUES ?item { ${b.map((x) => `wd:${x}`).join(' ')} }
      BIND(EXISTS { ?item wdt:P31 wd:Q5 } AS ?human)
      OPTIONAL { ?item wdt:P570 ?died }
      OPTIONAL { ?item wdt:P18 ?img }
      OPTIONAL { ?sde schema:about ?item ; schema:isPartOf <https://de.wikipedia.org/> ; schema:name ?de }
      OPTIONAL { ?sfr schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?fr }
    }`;
    const body = await sparql(q);
    for (const row of body.results.bindings) {
      const qid = row.item.value.split('/').pop();
      const cur = out.get(qid) ?? { human: false, died: null, p18: [], sitelinks: {} };
      cur.human = row.human?.value === 'true';
      if (row.died?.value && (!cur.died || row.died.value > cur.died)) cur.died = row.died.value;
      if (row.img?.value) {
        const f = canonicalFileTitle(decodeURIComponent(row.img.value.split('/Special:FilePath/').pop()!));
        if (!cur.p18.includes(f)) cur.p18.push(f);
      }
      if (row.de?.value) cur.sitelinks.de = row.de.value;
      if (row.fr?.value) cur.sitelinks.fr = row.fr.value;
      out.set(qid, cur);
    }
  }
  return out;
}

// ---------------------------------------------------------------- stage 5
// see lib/images.ts: verdicts live in the compact index; only files not in it are fetched

// ---------------------------------------------------------------- main
async function main() {
  progress('stage 1: vital articles');
  const vital = await vitalEntries();
  const classified = vital.map((v) => ({ ...v, ...classify(v.path) }));
  const kept = classified.filter((v) => v.domain !== 'excluded');
  progress(`  ${vital.length} entries, ${vital.length - kept.length} excluded by list policy`);

  progress('stage 2: en props');
  const en = await pageProps('en', kept.map((v) => v.title));

  progress('stage 3: wikidata');
  const qids = [...new Set([...en.values()].map((p) => p.qid).filter((q): q is string => Boolean(q)))];
  const wd = await wikidata(qids);

  const props: Record<WikiLang, Map<string, PageProps>> = { en, de: new Map(), fr: new Map() };
  for (const lang of ['de', 'fr'] as const) {
    progress(`stage 4: ${lang} props`);
    const titles = [...new Set([...wd.values()].map((w) => w.sitelinks[lang]).filter((t): t is string => Boolean(t)))];
    props[lang] = await pageProps(lang, titles);
  }

  progress('stage 5: image metadata');
  const files = new Set<string>();
  for (const lang of LANGS) for (const p of props[lang].values()) if (p.pageimage) files.add(canonicalFileTitle(p.pageimage));
  for (const w of wd.values()) for (const f of w.p18) files.add(f);
  const index = loadIndex();
  const unknown = [...files].filter((f) => index[f] === undefined).sort();
  progress(`  ${files.size} files, ${unknown.length} not in content/images/index.json.gz yet`);
  for (const [f, r] of await evaluateFiles(unknown, { screen: false, progress })) index[f] = indexEntry(r.verdict);
  saveIndex(index);

  progress('stage 6: assemble pools');
  const report = {
    generatedAt: new Date().toISOString(),
    vitalEntries: vital.length,
    excludedByListPolicy: vital.length - kept.length,
    images: { evaluated: 0, accepted: 0, rejected: {} as Record<string, number>, events: {} as Record<string, number> },
    perLang: {} as Record<string, Record<string, number>>,
  };
  for (const f of files) {
    const e = index[f];
    if (e === undefined) continue;
    report.images.evaluated++;
    if (Array.isArray(e)) {
      report.images.accepted++;
      for (const ev of e.slice(1)) report.images.events[ev] = (report.images.events[ev] ?? 0) + 1;
    } else {
      const r = e.replace(/ \(.*$/, '');
      report.images.rejected[r] = (report.images.rejected[r] ?? 0) + 1;
    }
  }

  const usable = (f: string | null | undefined): boolean => Boolean(f) && isOk(index[canonicalFileTitle(f!)]);

  mkdirSync(join(ROOT, 'content/pool'), { recursive: true });
  for (const lang of LANGS) {
    const counts: Record<string, number> = {};
    const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
    const dropped: Record<string, string> = {};
    let current = '';
    const drop = (reason: string) => { bump(`drop:${reason}`); dropped[current] = reason; };
    const lines: string[] = [];
    for (const v of kept) {
      const ep = en.get(v.title);
      current = ep?.qid ?? `en:${v.title}`;
      if (!ep?.qid) { drop('no-qid'); continue; }
      const w = wd.get(ep.qid);
      const localTitle = lang === 'en' ? v.title : w?.sitelinks[lang];
      const p = localTitle ? props[lang].get(localTitle) : undefined;
      if (!p) { drop('no-article-in-edition'); continue; }
      if (p.disambig) { drop('disambiguation'); continue; }
      if (/^(List of|Liste d|Liste der|Timeline of|\d{1,4}$)/i.test(p.title)) { drop('list-or-year'); continue; }
      if (w?.human) {
        if (!deadLongEnough(w.died)) { drop('person-living-or-recent'); continue; }
      }
      // images in order of preference: own edition → other editions → Wikidata P18.
      // The first is the topic's image; up to 4 more are kept for the image screen to fall back on.
      type ImageRef = Candidate['image'];
      const options: ImageRef[] = [];
      const add = (f: string | null | undefined, via: ImageRef['via']) => {
        if (!usable(f)) return;
        const file = canonicalFileTitle(f!);
        if (!options.some((o) => o.file === file)) options.push({ file, via });
      };
      add(p.pageimage, 'own');
      for (const other of LANGS.filter((l) => l !== lang)) {
        const ot = other === 'en' ? v.title : w?.sitelinks[other];
        add(ot ? props[other].get(ot)?.pageimage : null, `edition:${other}`);
      }
      for (const f of w?.p18 ?? []) add(f, 'wikidata-p18');
      const image = options[0];
      if (!image) { drop('no-free-image-anywhere'); continue; }
      bump(`image:${image.via.startsWith('edition') ? 'other-edition' : image.via}`);
      bump('kept');
      const c: Candidate = {
        lang, title: p.title, pageid: p.pageid, qid: ep.qid, domain: v.domain as Domain, evening: v.evening, abstract: v.abstract,
        path: v.path, enClass: v.enClass, length: p.length, coords: p.coords ?? ep.coords, human: Boolean(w?.human), died: w?.died?.slice(0, 10) ?? null,
        image, altImages: options.slice(1, 5),
      };
      lines.push(JSON.stringify(c));
    }
    writeFileSync(join(ROOT, `content/pool/${lang}.jsonl.gz`), gzipSync(lines.join('\n') + '\n', { level: 9 }));
    writeFileSync(join(ROOT, `content/pool/dropped.${lang}.json`), JSON.stringify(dropped, null, 0).replace(/,"/g, ',\n"') + '\n');
    report.perLang[lang] = counts;
    progress(`  ${lang}: ${JSON.stringify(counts)}`);
  }

  mkdirSync(join(ROOT, 'content/reports'), { recursive: true });
  writeFileSync(join(ROOT, 'content/reports/pool.json'), JSON.stringify(report, null, 2) + '\n');
  progress(`done. network ${stats.network}, cache ${stats.cached}, retries ${stats.retries}, waited ${Math.round(stats.waitedMs / 1000)}s`);
}

await main();
