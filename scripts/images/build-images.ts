// npm run images:build — the image step (milestone c).
//
// For every image the queues use (content/images/used.json):
//   1. download ONE Commons thumbnail at a standard width (1280, or the largest standard width the
//      original allows), politely and once: bytes are kept in .cache/images/ (gitignored, cached in CI);
//   2. re-encode locally with sharp to AVIF and WebP at 480/960/1280 px (never upscaled), EXIF-rotated,
//      metadata stripped;
//   3. write public/img/{id}/{width}.{avif,webp} and public/img/manifest.json with sizes, a paper-tinted
//      placeholder colour and the full credit.
// Visitors only ever load images from Margin's own origin. Binaries are build output, not committed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { ImageRecord } from '../../src/core/license/license';
import { p } from '../content/lib/store';
import { fetchImageBytes, stats } from '../content/lib/wiki';

const STANDARD = [250, 330, 500, 960, 1280] as const; // Wikimedia's standard thumbnail widths (T414805)
export const OUTPUT_WIDTHS = [480, 960, 1280] as const;
const CACHE = p('.cache/images');
const OUT = p('public/img');

export type ManifestEntry = {
  id: string;
  file: string;
  width: number; // of the largest output
  height: number;
  widths: number[];
  formats: ('avif' | 'webp')[];
  color: string; // average colour, for the placeholder behind the photo
  credit: ImageRecord['credit'];
};

/** Stable id for a file: the first 12 hex digits of its Commons SHA-1. */
export const imageId = (sha1: string) => sha1.slice(0, 12);

/** The Commons thumbnail URL at a standard width, on upload.wikimedia.org. */
export function thumbUrl(rec: Pick<ImageRecord, 'thumb' | 'width' | 'mime' | 'original'>): { url: string; width: number } {
  // small JPEG/PNG originals: the original itself (a standard thumbnail would lose resolution)
  if (rec.width <= 1280 && (rec.mime === 'image/jpeg' || rec.mime === 'image/png') && rec.original.startsWith('https://upload.wikimedia.org/'))
    return { url: rec.original, width: rec.width };
  if (!rec.thumb) throw new Error('record has no thumbnail URL');
  const width = [...STANDARD].reverse().find((w) => w <= rec.width) ?? STANDARD[0];
  const url = rec.thumb.url
    .replace(/^https:\/\/thumb\.wikimedia\.org\//, 'https://upload.wikimedia.org/')
    .replace(/\/(lossy-page1-|page1-)?\d+px-/, (_m, pre: string | undefined) => `/${pre ?? ''}${width}px-`);
  return { url, width };
}

const log = (m: string) => process.stderr.write(`${m}\n`);

async function main() {
  const used = JSON.parse(readFileSync(p('content/images/used.json'), 'utf8')) as Record<string, ImageRecord>;
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const manifest: Record<string, ManifestEntry> = {};
  let downloaded = 0;
  let encoded = 0;
  // earliest day first: the next days get their photos first while a throttled download is still running
  const firstUse = new Map<string, string>();
  for (const lang of ['en', 'de', 'fr']) {
    const q = JSON.parse(readFileSync(p(`content/queue/${lang}.json`), 'utf8')) as Record<string, Record<string, { image: { file: string } }>>;
    for (const [date, slots] of Object.entries(q)) for (const e of Object.values(slots)) {
      const prev = firstUse.get(e.image.file);
      if (!prev || date < prev) firstUse.set(e.image.file, date);
    }
  }
  const ordered = Object.entries(used).sort(([a], [b]) => (firstUse.get(a) ?? '9').localeCompare(firstUse.get(b) ?? '9') || a.localeCompare(b));
  for (const [file, rec] of ordered) {
    if (!rec.sha1) throw new Error(`${file}: no SHA-1`);
    const id = imageId(rec.sha1);
    const { url, width } = thumbUrl(rec);
    const cached = join(CACHE, `${id}-${width}`);
    if (!existsSync(cached)) {
      writeFileSync(cached, await fetchImageBytes(url));
      downloaded++;
      log(`  downloaded ${downloaded}: ${firstUse.get(file)} ${file.slice(5, 60)} (waited ${Math.round(stats.waitedMs / 1000)}s so far)`);
    }
    const src = sharp(readFileSync(cached)).rotate();
    const meta = await src.metadata();
    const srcW = meta.autoOrient?.width ?? meta.width!;
    const srcH = meta.autoOrient?.height ?? meta.height!;
    const widths = OUTPUT_WIDTHS.filter((w) => w <= srcW);
    if (widths.length === 0 || widths[widths.length - 1]! < srcW * 0.9) widths.push(Math.min(srcW, 1280) as never);
    const dir = join(OUT, id);
    mkdirSync(dir, { recursive: true });
    for (const w of widths) {
      const a = join(dir, `${w}.avif`);
      const b = join(dir, `${w}.webp`);
      if (existsSync(a) && existsSync(b)) continue;
      const resized = sharp(readFileSync(cached)).rotate().resize({ width: w, withoutEnlargement: true });
      await resized.clone().avif({ quality: 52, effort: 5 }).toFile(a);
      await resized.clone().webp({ quality: 74, effort: 5 }).toFile(b);
      encoded++;
    }
    const { dominant } = await sharp(readFileSync(cached)).resize(32).stats();
    const big = Math.max(...widths);
    manifest[file] = {
      id, file, width: big, height: Math.round((srcH * big) / srcW), widths: [...widths].sort((x, y) => x - y), formats: ['avif', 'webp'],
      color: `rgb(${dominant.r} ${dominant.g} ${dominant.b})`, credit: rec.credit,
    };
    // after every image: the app can use what is there while the rest is still downloading
    writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest) + '\n');
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest) + '\n');
  log(`images: ${Object.keys(manifest).length} in manifest, ${downloaded} downloaded, ${encoded} sizes encoded; network ${stats.network}, waited ${Math.round(stats.waitedMs / 1000)}s`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
