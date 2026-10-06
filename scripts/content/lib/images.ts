// Image metadata for the pipeline: license, credit and screen signals of Commons files, asked of
// en.wikipedia.org's Action API (Commons files come through as imagerepository "shared"), batched,
// cached forever by the wiki client.
//
// Storage (decision of 2026-10-06, "keep full records only for what is used"):
//   content/images/index.json.gz   compact verdict for every file ever evaluated:
//                                  "ok" (+ event codes) or the rejection reason
//   content/images/rejected.json   the rejected files, file → reason (plain, reviewable)
//   content/images/used.json       full credit records of the images the queues use (written by prepare)
// Full records are re-derived on demand from the (cached) API responses for the files that get used.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { canonicalFileTitle, evaluateImage, isBotAccount, type ImageInfo, type ImageVerdict } from '../../../src/core/license/license';
import { screenImageMeta } from '../../../src/core/review/scan';
import { p } from './store';
import { actionQueryAll, titleBatches } from './wiki';

const EXTMETA = 'LicenseShortName|LicenseUrl|Artist|Credit|Attribution|AttributionRequired|UsageTerms|Copyrighted|Restrictions|NonFree';
const SCREEN = 'Categories|ImageDescription|ObjectName';

export type ImageResult = { verdict: ImageVerdict; screenHits: string[] };

/**
 * Evaluates files: license and credit (with the original-uploader fallback) and, if `screen`, the image
 * screen over Commons categories, description and title. Two batched requests per 50 files at most.
 */
export async function evaluateFiles(files: string[], opts: { screen: boolean; progress?: (m: string) => void }): Promise<Map<string, ImageResult>> {
  const out = new Map<string, ImageResult>();
  const infos = new Map<string, ImageInfo>();
  const all = titleBatches([...new Set(files.map(canonicalFileTitle))]);
  let i = 0;
  for (const b of all) {
    if (opts.progress && ++i % 20 === 0) opts.progress(`  imageinfo ${i}/${all.length}`);
    const { pages, raw } = await actionQueryAll('en', {
      titles: b.join('|'), prop: 'imageinfo',
      iiprop: 'url|size|mime|sha1|user|extmetadata', iiextmetadatafilter: opts.screen ? `${EXTMETA}|${SCREEN}` : EXTMETA,
      iiextmetadatalanguage: 'en', iiurlwidth: 960,
    });
    const alias = new Map<string, string>();
    for (const r of raw) for (const n of r.query?.normalized ?? []) alias.set(n.from, n.to);
    const byTitle = new Map(pages.map((pg) => [pg.title as string, pg as ImageInfo]));
    for (const f of b) {
      const info = byTitle.get(alias.get(f) ?? f);
      if (!info) { out.set(f, { verdict: { ok: false, file: f, reason: 'missing', events: [] }, screenHits: [] }); continue; }
      infos.set(f, info);
      const m = info.imageinfo?.[0]?.extmetadata ?? {};
      const get = (k: string) => (typeof m[k]?.value === 'string' ? (m[k]!.value as string) : '');
      const screenHits = opts.screen ? screenImageMeta({ categories: get('Categories'), description: get('ImageDescription'), objectName: get('ObjectName') }) : [];
      out.set(f, { verdict: evaluateImage(info), screenHits });
    }
  }

  // author fell back to the uploader: use the uploader of the FIRST version (the latest is often a bot)
  const fallback = [...out].filter(([, r]) => r.verdict.events.includes('author-uploader-fallback')).map(([f]) => f);
  for (const b of titleBatches(fallback)) {
    const { pages, raw } = await actionQueryAll('en', { titles: b.join('|'), prop: 'imageinfo', iiprop: 'user|timestamp', iilimit: 'max' });
    const alias = new Map<string, string>();
    for (const r of raw) for (const n of r.query?.normalized ?? []) alias.set(n.from, n.to);
    const byTitle = new Map(pages.map((pg) => [pg.title as string, pg]));
    for (const f of b) {
      const versions: { user?: string; timestamp?: string }[] = byTitle.get(alias.get(f) ?? f)?.imageinfo ?? [];
      const first = [...versions].sort((a, c) => (a.timestamp ?? '').localeCompare(c.timestamp ?? ''))[0];
      const v = evaluateImage(infos.get(f)!, { originalUploader: first?.user ?? null });
      if (first?.user && isBotAccount(first.user)) v.events.push('author-uploader-is-bot');
      out.set(f, { ...out.get(f)!, verdict: v });
    }
  }
  return out;
}

// ------------------------------------------------------------------ the compact index
export type IndexEntry = string | string[]; // reason, or ["ok", ...events]
const INDEX = () => p('content/images/index.json.gz');

export function loadIndex(): Record<string, IndexEntry> {
  return existsSync(INDEX()) ? (JSON.parse(gunzipSync(readFileSync(INDEX())).toString('utf8')) as Record<string, IndexEntry>) : {};
}

export function saveIndex(index: Record<string, IndexEntry>): void {
  const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(INDEX(), gzipSync(JSON.stringify(sorted), { level: 9 }));
  const rejected = Object.fromEntries(Object.entries(sorted).filter(([, v]) => typeof v === 'string'));
  writeFileSync(p('content/images/rejected.json'), JSON.stringify(rejected, null, 0).replace(/,"/g, ',\n"') + '\n');
}

export const indexEntry = (v: ImageVerdict): IndexEntry => (v.ok ? ['ok', ...v.events] : v.reason);
export const isOk = (e: IndexEntry | undefined) => Array.isArray(e);
