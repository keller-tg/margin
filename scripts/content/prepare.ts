// npm run content:prepare -- [--from 2026-10-06] [--days 30] [--langs en,de,fr]
//
// 1. Picks topics into content/queue/{lang}.json. Picks are frozen: a date that already has a pick
//    keeps it, unless it now fails a check (veto, blocklist, review queue, image screen).
// 2. Writes an authoring packet per queued thing to content/packets/{lang}/{date}.{slot}.json.
// 3. Writes the full credit records of every image in use to content/images/used.json.
//
// Checks per pick (decisions of 2026-10-05/06):
//  - title/QID blocklist and narrow category rules (content/blocklist/) → reject
//  - lead length → reject
//  - image screen: the file's own Commons categories, description and title; a hit moves on to the
//    topic's next image (altImages); no safe image left → reject
//  - word scan over the generated pages (bomb, massacre, execution…) → review queue, not reject
//  - anything in the review queue (content/review/topics-queue.json) stays out of the active queue
//    until a human sets its status to "approved"
// Rejected candidates go to content/pool/rejects.json (id + reason). The slot re-picks with the next
// attempt's seed, so the result stays deterministic.
import { parseArgs } from 'node:util';
import { composeExtractive } from '../../src/core/compose/compose';
import { extractFacts } from '../../src/core/compose/facts';
import type { Packet, RefSource } from '../../src/core/compose/packet';
import { PACES } from '../../src/core/pace/pace';
import { pick } from '../../src/core/pick/pick';
import type { ImageRecord } from '../../src/core/license/license';
import { scanThing } from '../../src/core/review/scan';
import type { Domain, Slot, ThingImage } from '../../src/core/schema/thing';
import { countWords } from '../../src/core/text/sentences';
import type { Candidate } from './pool-build';
import { fetchArticle, type Article } from './lib/article';
import { evaluateFiles, indexEntry, loadIndex, saveIndex, type ImageResult } from './lib/images';
import {
  addDays, loadOverrides, loadPool, loadQueue, loadVerifyContext, p, packetPath, queuePath, readJson,
  rejectsPath, writeJson, type QueueEntry, type Rejects,
} from './lib/store';
import { stats, type WikiLang } from './lib/wiki';

const { values } = parseArgs({
  options: { from: { type: 'string', default: '2026-10-06' }, days: { type: 'string', default: '30' }, langs: { type: 'string', default: 'en,de,fr' } },
});
const FROM = values.from!;
const DAYS = Number(values.days);
const LANGS = values.langs!.split(',') as WikiLang[];
const NOVELTY_DAYS = 365;
const SLOTS: Slot[] = ['morning', 'evening'];
const LEAD_WORDS: Record<Slot, [number, number]> = { morning: [60, 1200], evening: [30, 1200] };
const log = (m: string) => process.stderr.write(`${m}\n`);

// ------------------------------------------------------------------ review queue
export type ReviewItem = {
  lang: WikiLang; qid: string; title: string;
  status: 'review' | 'approved' | 'rejected';
  source: 'manual' | 'word-scan';
  reasons: string[];
  hits?: { pace: string; page: number; word: string; text: string }[];
  pickedFor?: { date: string; slot: Slot };
  addedAt: string;
};
type ReviewFile = { about: string; items: ReviewItem[] };
const REVIEW_PATH = p('content/review/topics-queue.json');
const review = readJson<ReviewFile>(REVIEW_PATH, {
  about: 'Topics held back for a human to read. Set "status" to "approved" to let a topic back into the picks, or "rejected" to keep it out for good. "review" keeps it out until decided.',
  items: [],
});
const reviewStatus = (lang: WikiLang, qid: string) => review.items.find((i) => i.lang === lang && i.qid === qid)?.status;
const heldBack = (lang: WikiLang, qid: string) => { const s = reviewStatus(lang, qid); return s === 'review' || s === 'rejected'; };

// ------------------------------------------------------------------ rejects
const rejects = readJson<Rejects>(rejectsPath(), { en: {}, de: {}, fr: {} });
const overrides = loadOverrides();

/** Category rejects made under an older, broader blocklist get re-checked: if no rule matches now, the topic is eligible again. */
async function refreshCategoryRejects(lang: WikiLang) {
  const ctx = loadVerifyContext(lang);
  for (const [qid, r] of Object.entries(rejects[lang])) {
    if (!r.reason.startsWith('blocklisted category')) continue;
    const a = await fetchArticle(lang, r.title);
    const still = a?.categories.find((c) => ctx.blocklist.categoryPatterns.some((re) => re.test(c)));
    if (!still) {
      delete rejects[lang][qid];
      log(`  ${lang}: "${r.title}" is eligible again (${r.reason} no longer matches)`);
    }
  }
}

// ------------------------------------------------------------------ images: credit records + screen
// Full records are derived on demand (batched, cached) for the files a topic may use; the screen runs on
// the same response. Verdicts are written back to the compact index.
const imageResults = new Map<string, ImageResult>();
const index = loadIndex();
const imageScreenLog: { file: string; hits: string[]; topic: string; lang: WikiLang }[] = [];

async function evaluate(files: string[]): Promise<void> {
  const todo = [...new Set(files)].filter((f) => !imageResults.has(f));
  for (const [f, r] of await evaluateFiles(todo, { screen: true })) {
    imageResults.set(f, r);
    index[f] = indexEntry(r.verdict);
  }
}
const usableNow = (f: string) => { const r = imageResults.get(f); return Boolean(r && r.verdict.ok && r.screenHits.length === 0); };

async function safeImage(c: Pick<Candidate, 'image' | 'altImages' | 'title'>, lang: WikiLang): Promise<Candidate['image'] | null> {
  const options = [c.image, ...(c.altImages ?? [])];
  await evaluate(options.map((o) => o.file));
  for (const o of options) {
    if (usableNow(o.file)) return o;
    const r = imageResults.get(o.file);
    const hits = r?.screenHits.length ? r.screenHits : [r && !r.verdict.ok ? r.verdict.reason : 'not evaluated'];
    if (!imageScreenLog.some((x) => x.file === o.file && x.lang === lang)) imageScreenLog.push({ file: o.file, hits, topic: c.title, lang });
  }
  return null;
}

// ------------------------------------------------------------------ packets
function thingImage(file: string, alt: string): ThingImage {
  const v = imageResults.get(file)?.verdict;
  if (!v?.ok) throw new Error(`image ${file} has no usable record`);
  const m = v.record;
  return { file: m.file, w: m.width, h: m.height, alt, thumb: m.thumb?.url ?? null, sha1: m.sha1, credit: m.credit };
}

const REFS = readJson<Record<WikiLang, RefSource[]>>(p('content/refs/refs.json'), { en: [], de: [], fr: [] });
const coordsByQid: Record<WikiLang, Map<string, [number, number] | null>> = { en: new Map(), de: new Map(), fr: new Map() };
const coordsOf = (lang: WikiLang, qid: string) => {
  if (coordsByQid[lang].size === 0) for (const c of loadPool(lang)) coordsByQid[lang].set(c.qid, c.coords);
  return coordsByQid[lang].get(qid) ?? null;
};

function buildPacket(lang: WikiLang, date: string, slot: Slot, e: { qid: string; domain: Domain; image: Candidate['image'] }, a: Article): Packet {
  const parts = [{ text: a.lead }, ...a.sections.map((s) => ({ text: s.text, section: s.heading }))];
  return {
    packetVersion: 1, date, slot, lang,
    topic: {
      title: a.title, qid: e.qid, pageid: a.pageid, revid: a.revid, domain: e.domain,
      url: `https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(a.title.replace(/ /g, '_'))}&oldid=${a.revid}`,
    },
    limits: Object.fromEntries(Object.entries(PACES).map(([k, v]) => [k, { pages: slot === 'evening' ? [v.eveningPages, v.eveningPages] : v.pages, maxWords: v.maxWords }])) as Packet['limits'],
    source: { description: a.description, lead: a.lead, sections: a.sections },
    facts: extractFacts(lang, parts, coordsOf(lang, e.qid)),
    images: { img1: thingImage(e.image.file, a.title) },
    categories: a.categories,
    refs: REFS[lang],
  };
}

// ------------------------------------------------------------------ checks
type Verdict = { ok: true; image: Candidate['image'] } | { ok: false; to: 'reject' | 'review'; reason: string; hits?: ReviewItem['hits'] };

async function check(lang: WikiLang, date: string, slot: Slot, c: { title: string; qid: string; domain: Domain; image: Candidate['image']; altImages?: Candidate['altImages'] }): Promise<Verdict> {
  const ctx = loadVerifyContext(lang);
  const a = await fetchArticle(lang, c.title);
  if (!a) return { ok: false, to: 'reject', reason: 'article missing' };
  if (ctx.blocklist.titles.has(a.title.toLowerCase()) || ctx.blocklist.qids.has(c.qid)) return { ok: false, to: 'reject', reason: 'blocklisted title or QID' };
  for (const cat of a.categories) for (const re of ctx.blocklist.categoryPatterns) if (re.test(cat)) return { ok: false, to: 'reject', reason: `blocklisted category "${cat}"` };
  const w = countWords(a.lead);
  const [lo, hi] = LEAD_WORDS[slot];
  if (w < lo) return { ok: false, to: 'reject', reason: `lead too short (${w} words)` };
  if (w > hi) return { ok: false, to: 'reject', reason: `lead too long (${w} words)` };

  const image = await safeImage({ ...c, altImages: c.altImages ?? [] }, lang);
  if (!image) return { ok: false, to: 'reject', reason: 'no image passes the image screen' };

  if (reviewStatus(lang, c.qid) !== 'approved') {
    const { thing } = composeExtractive(buildPacket(lang, date, slot, { ...c, image }, a));
    const hits = scanThing(thing);
    if (hits.length) return { ok: false, to: 'review', reason: `word scan: ${[...new Set(hits.map((h) => h.word))].join(', ')}`, hits };
  }
  return { ok: true, image };
}

function sendToReview(lang: WikiLang, c: { title: string; qid: string }, reason: string, hits: ReviewItem['hits'], date: string, slot: Slot) {
  if (review.items.some((i) => i.lang === lang && i.qid === c.qid)) return;
  review.items.push({ lang, qid: c.qid, title: c.title, status: 'review', source: 'word-scan', reasons: [reason], hits: hits?.slice(0, 12), pickedFor: { date, slot }, addedAt: new Date().toISOString() });
}

// ------------------------------------------------------------------ picking
async function pickInto(lang: WikiLang): Promise<void> {
  const pool = loadPool(lang);
  const byQid = new Map(pool.map((c) => [c.qid, c]));
  const queue = loadQueue(lang);
  const vetoQids = new Set(overrides.veto.filter((v) => !v.lang || v.lang === lang).map((v) => v.qid).filter(Boolean) as string[]);
  const vetoTitles = new Set(overrides.veto.filter((v) => !v.lang || v.lang === lang).map((v) => v.title?.toLowerCase()).filter(Boolean) as string[]);
  const ctx0 = loadVerifyContext(lang);

  // evaluate and screen the images of everything already queued in one batched pass
  await evaluate(Object.values(queue).flatMap((s) => Object.values(s)).flatMap((e) => (e ? [e.image.file, ...(byQid.get(e.qid)?.altImages ?? []).map((a) => a.file)] : [])));

  for (let d = 0; d < DAYS; d++) {
    const date = addDays(FROM, d);
    queue[date] ??= {};
    for (const slot of SLOTS) {
      const existing = queue[date]![slot];
      if (existing) {
        const reasons: string[] = [];
        if (vetoQids.has(existing.qid) || vetoTitles.has(existing.title.toLowerCase())) reasons.push('vetoed');
        if (heldBack(lang, existing.qid)) reasons.push(`in the review queue (${reviewStatus(lang, existing.qid)})`);
        let v: Verdict | null = null;
        if (!reasons.length) {
          v = await check(lang, date, slot, { ...existing, altImages: byQid.get(existing.qid)?.altImages ?? [] });
          if (v.ok) {
            if (v.image.file !== existing.image.file) log(`  ${lang} ${date} ${slot}: "${existing.title}" image ${existing.image.file} fails the image screen → ${v.image.file}`);
            existing.image = v.image;
            continue;
          }
          reasons.push(v.reason);
          if (v.to === 'review') sendToReview(lang, existing, v.reason, v.hits, date, slot);
          else rejects[lang][existing.qid] = { title: existing.title, reason: v.reason };
        }
        log(`  ${lang} ${date} ${slot}: "${existing.title}" leaves the queue (${reasons.join('; ')}), re-picking`);
        delete queue[date]![slot];
      }

      // novelty: anything queued in this language within ±365 days, plus vetoes, rejects and held-back reviews
      const exclude = new Set<string>([...vetoQids, ...ctx0.blocklist.qids, ...Object.keys(rejects[lang])]);
      for (const it of review.items) if (it.lang === lang && heldBack(lang, it.qid)) exclude.add(it.qid);
      for (const [qd, slots] of Object.entries(queue)) {
        if (Math.abs((Date.parse(qd) - Date.parse(date)) / 864e5) > NOVELTY_DAYS) continue;
        for (const e of Object.values(slots)) if (e) exclude.add(e.qid);
      }
      const avoid = new Set<Domain>();
      for (const back of [1, 2]) { const e = queue[addDays(date, -back)]?.[slot]; if (e) avoid.add(e.domain); }
      const other = queue[date]![slot === 'morning' ? 'evening' : 'morning'];
      if (other) avoid.add(other.domain);

      const forced = overrides.force.find((f) => f.lang === lang && f.date === date && f.slot === slot);
      let chosen: QueueEntry | null = null;
      for (let attempt = 0; attempt < 80 && !chosen; attempt++) {
        const c = forced && attempt === 0 ? pool.find((x) => x.title === forced.title) : pick(pool.filter((x) => !vetoTitles.has(x.title.toLowerCase())), { date, lang, slot, exclude, avoidDomains: avoid }, attempt);
        if (!c) break;
        exclude.add(c.qid);
        const v = await check(lang, date, slot, c);
        if (!v.ok) {
          if (v.to === 'review') sendToReview(lang, c, v.reason, v.hits, date, slot);
          else rejects[lang][c.qid] = { title: c.title, reason: v.reason };
          log(`  ${lang} ${date} ${slot}: ${v.to} "${c.title}" (${v.reason})`);
          continue;
        }
        chosen = { title: c.title, qid: c.qid, pageid: c.pageid, domain: c.domain, image: v.image, pickedAt: new Date().toISOString(), attempt };
      }
      if (!chosen) throw new Error(`${lang} ${date} ${slot}: nothing eligible`);
      queue[date]![slot] = chosen;
      log(`  ${lang} ${date} ${slot}: ${chosen.title} [${chosen.domain}]`);
      writeJson(queuePath(lang), queue); // after every pick: an interrupted run keeps its progress
      writeJson(rejectsPath(), rejects);
      writeJson(REVIEW_PATH, review);
    }
  }
  writeJson(queuePath(lang), queue);
}

async function packets(lang: WikiLang): Promise<void> {
  const queue = loadQueue(lang);
  await evaluate(Object.values(queue).flatMap((s) => Object.values(s)).flatMap((e) => (e ? [e.image.file] : [])));
  for (let d = 0; d < DAYS; d++) {
    const date = addDays(FROM, d);
    for (const slot of SLOTS) {
      const e = queue[date]?.[slot];
      if (!e) continue;
      const a = (await fetchArticle(lang, e.title))!;
      writeJson(packetPath(lang, date, slot), buildPacket(lang, date, slot, e, a));
    }
  }
}

for (const lang of LANGS) {
  log(`${lang}: re-checking earlier category rejects`);
  await refreshCategoryRejects(lang);
  log(`${lang}: picking ${DAYS} days from ${FROM}`);
  await pickInto(lang);
  log(`${lang}: packets`);
  await packets(lang);
}
// full credit records of every image any queue uses (all languages, whatever --langs was)
const queued = (['en', 'de', 'fr'] as WikiLang[]).flatMap((lang) => Object.values(loadQueue(lang)).flatMap((s) => Object.values(s)).flatMap((e) => (e ? [e.image.file] : [])));
await evaluate(queued);
const usedImages: Record<string, ImageRecord & { events: string[] }> = {};
for (const f of queued) { const v = imageResults.get(f)!.verdict; if (v.ok) usedImages[f] = { ...v.record, events: v.events }; }
saveIndex(index);
writeJson(rejectsPath(), rejects);
writeJson(REVIEW_PATH, review);
writeJson(p('content/images/used.json'), Object.fromEntries(Object.entries(usedImages).sort(([a], [b]) => a.localeCompare(b))));
// cumulative: earlier runs' findings stay listed (a file screened once is not re-logged by later runs)
const previous = readJson<{ rejectedByScreen: typeof imageScreenLog }>(p('content/reports/image-screen.json'), { rejectedByScreen: [] }).rejectedByScreen;
const merged = [...previous, ...imageScreenLog.filter((x) => !previous.some((y) => y.file === x.file && y.lang === x.lang))];
writeJson(p('content/reports/image-screen.json'), { updatedAt: new Date().toISOString(), rejectedByScreen: merged });
log(`done. network ${stats.network}, cache ${stats.cached}, retries ${stats.retries}, waited ${Math.round(stats.waitedMs / 1000)}s`);
