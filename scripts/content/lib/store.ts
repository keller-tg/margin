// Reading and writing the committed content files.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Slot } from '../../../src/core/schema/thing';
import type { VerifyContext } from '../../../src/core/verify/verify';
import type { Candidate } from '../pool-build';
import type { WikiLang } from './wiki';

export const ROOT = join(import.meta.dirname, '../../..');
export const p = (...parts: string[]) => join(ROOT, ...parts);

export function readJson<T>(file: string, fallback: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback;
}
export function writeJson(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
}

export function loadPool(lang: WikiLang): Candidate[] {
  const f = p(`content/pool/${lang}.jsonl.gz`);
  if (!existsSync(f)) throw new Error(`no pool for ${lang}: run npm run pool:build first`);
  return gunzipSync(readFileSync(f)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Candidate);
}

export type QueueEntry = { title: string; qid: string; pageid: number; domain: Candidate['domain']; image: Candidate['image']; pickedAt: string; attempt: number };
export type Queue = Record<string, Partial<Record<Slot, QueueEntry>>>;
export const queuePath = (lang: WikiLang) => p(`content/queue/${lang}.json`);
export const loadQueue = (lang: WikiLang) => readJson<Queue>(queuePath(lang), {});

export type Rejects = Record<WikiLang, Record<string, { title: string; reason: string }>>;
export const rejectsPath = () => p('content/pool/rejects.json');

export type Overrides = {
  veto: { lang?: WikiLang; title?: string; qid?: string }[];
  force: { lang: WikiLang; date: string; slot: Slot; title: string }[];
};
export const loadOverrides = () => readJson<Overrides>(p('content/overrides.json'), { veto: [], force: [] });

const lines = (f: string) =>
  existsSync(f) ? readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [];

export function loadVerifyContext(lang: WikiLang): VerifyContext {
  return {
    blocklist: {
      titles: new Set(lines(p('content/blocklist/titles.txt')).map((t) => t.toLowerCase())),
      qids: new Set(lines(p('content/blocklist/qids.txt')).map((t) => t.split(/\s/)[0]!)),
      categoryPatterns: lines(p(`content/blocklist/categories.${lang}.txt`)).map((r) => new RegExp(r, 'iu')),
    },
    deLexicon: new Set(lines(p('content/lexicon/de-common.txt')).map((t) => t.toLowerCase())),
  };
}

export const packetPath = (lang: WikiLang, date: string, slot: Slot) => p(`content/packets/${lang}/${date}.${slot}.json`);
export const dailyPath = (lang: WikiLang, date: string, slot: Slot) => p(`public/daily/${lang}/${date}.${slot}.json`);

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
