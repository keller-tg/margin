// npm run content:prepare -- [--from 2026-10-06] [--days 30] [--langs en,de,fr]
//
// 1. Picks topics into content/queue/{lang}.json. Picks are frozen: a date that already has a pick
//    is never reshuffled, unless the pick is now vetoed or blocklisted.
// 2. Writes an authoring packet per queued thing to content/packets/{lang}/{date}.{slot}.json.
//
// Checks that need the article itself (lead length, categories against the blocklist) run here, at
// pick time. A rejected candidate is recorded in content/pool/rejects.json and the slot re-picks with
// the next seed, so the outcome stays deterministic.
import { parseArgs } from 'node:util';
import { extractFacts } from '../../src/core/compose/facts';
import type { Packet } from '../../src/core/compose/packet';
import { PACES } from '../../src/core/pace/pace';
import { pick } from '../../src/core/pick/pick';
import type { Domain, Slot, ThingImage } from '../../src/core/schema/thing';
import { countWords } from '../../src/core/text/sentences';
import { fetchArticle, type Article } from './lib/article';
import {
  addDays, loadImageMeta, loadOverrides, loadPool, loadQueue, loadVerifyContext, packetPath, queuePath, readJson,
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

const rejects = readJson<Rejects>(rejectsPath(), { en: {}, de: {}, fr: {} });
const overrides = loadOverrides();
const imageMeta = loadImageMeta();
const log = (m: string) => process.stderr.write(`${m}\n`);

function checkArticle(a: Article | null, slot: Slot, lang: WikiLang): string | null {
  if (!a) return 'article missing';
  const ctx = loadVerifyContext(lang);
  if (ctx.blocklist.titles.has(a.title.toLowerCase())) return 'blocklisted title';
  for (const c of a.categories) for (const re of ctx.blocklist.categoryPatterns) if (re.test(c)) return `blocklisted category "${c}"`;
  const w = countWords(a.lead);
  const [lo, hi] = LEAD_WORDS[slot];
  if (w < lo) return `lead too short (${w} words)`;
  if (w > hi) return `lead too long (${w} words)`;
  return null;
}

async function pickInto(lang: WikiLang): Promise<void> {
  const pool = loadPool(lang);
  const queue = loadQueue(lang);
  const vetoQids = new Set(overrides.veto.filter((v) => !v.lang || v.lang === lang).map((v) => v.qid).filter(Boolean) as string[]);
  const vetoTitles = new Set(overrides.veto.filter((v) => !v.lang || v.lang === lang).map((v) => v.title?.toLowerCase()).filter(Boolean) as string[]);
  const ctx0 = loadVerifyContext(lang);

  for (let d = 0; d < DAYS; d++) {
    const date = addDays(FROM, d);
    queue[date] ??= {};
    for (const slot of SLOTS) {
      const existing = queue[date]![slot];
      if (existing && !vetoQids.has(existing.qid) && !vetoTitles.has(existing.title.toLowerCase()) && !ctx0.blocklist.qids.has(existing.qid)) continue;
      if (existing) log(`  ${lang} ${date} ${slot}: "${existing.title}" is vetoed now, re-picking`);

      // novelty: anything queued in this language within ±365 days, plus vetoes, plus rejects
      const exclude = new Set<string>([...vetoQids, ...ctx0.blocklist.qids, ...Object.keys(rejects[lang])]);
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
      for (let attempt = 0; attempt < 60 && !chosen; attempt++) {
        const c = forced && attempt === 0 ? pool.find((x) => x.title === forced.title) : pick(pool.filter((x) => !vetoTitles.has(x.title.toLowerCase())), { date, lang, slot, exclude, avoidDomains: avoid }, attempt);
        if (!c) break;
        const reason = checkArticle(await fetchArticle(lang, c.title), slot, lang);
        if (reason) {
          rejects[lang][c.qid] = { title: c.title, reason };
          exclude.add(c.qid);
          log(`  ${lang} ${date} ${slot}: reject "${c.title}" (${reason})`);
          continue;
        }
        chosen = { title: c.title, qid: c.qid, pageid: c.pageid, domain: c.domain, image: c.image, pickedAt: new Date().toISOString(), attempt };
      }
      if (!chosen) throw new Error(`${lang} ${date} ${slot}: nothing eligible`);
      queue[date]![slot] = chosen;
      log(`  ${lang} ${date} ${slot}: ${chosen.title} [${chosen.domain}]`);
      writeJson(queuePath(lang), queue); // after every pick: an interrupted run keeps its progress
      writeJson(rejectsPath(), rejects);
    }
  }
}

function thingImage(file: string, alt: string): ThingImage {
  const m = imageMeta[file];
  if (!m || !m.ok) throw new Error(`image ${file} has no accepted metadata`);
  return { file: m.file, w: m.width, h: m.height, alt, thumb: m.thumb?.url ?? null, sha1: m.sha1, credit: m.credit };
}

async function packets(lang: WikiLang): Promise<void> {
  const queue = loadQueue(lang);
  for (let d = 0; d < DAYS; d++) {
    const date = addDays(FROM, d);
    for (const slot of SLOTS) {
      const e = queue[date]?.[slot];
      if (!e) continue;
      const a = (await fetchArticle(lang, e.title))!;
      const parts = [{ text: a.lead }, ...a.sections.map((s) => ({ text: s.text, section: s.heading }))];
      const packet: Packet = {
        packetVersion: 1, date, slot, lang,
        topic: {
          title: a.title, qid: e.qid, pageid: a.pageid, revid: a.revid, domain: e.domain,
          url: `https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(a.title.replace(/ /g, '_'))}&oldid=${a.revid}`,
        },
        limits: { easy: PACES.easy, medium: PACES.medium, deep: PACES.deep } as Packet['limits'],
        source: { description: a.description, lead: a.lead, sections: a.sections },
        facts: extractFacts(lang, parts, null),
        images: { img1: thingImage(e.image.file, a.title) },
        categories: a.categories,
      };
      packet.limits = Object.fromEntries(Object.entries(PACES).map(([k, v]) => [k, { pages: slot === 'evening' ? [v.eveningPages, v.eveningPages] : v.pages, maxWords: v.maxWords }])) as Packet['limits'];
      writeJson(packetPath(lang, date, slot), packet);
    }
  }
}

for (const lang of LANGS) {
  log(`${lang}: picking ${DAYS} days from ${FROM}`);
  await pickInto(lang);
  log(`${lang}: packets`);
  await packets(lang);
}
log(`done. network ${stats.network}, cache ${stats.cached}, retries ${stats.retries}, waited ${Math.round(stats.waitedMs / 1000)}s`);
