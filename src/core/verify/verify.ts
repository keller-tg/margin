// The verifier (plan §6). Every rule is a hard failure that names the page and the offending token.
// Pure and isomorphic: the build scripts run it, and so can the browser for live trail things.
import { z } from 'zod';
import type { Packet } from '../compose/packet';
import { sourceText } from '../compose/packet';
import { classifyLicense, needsLicenseUrl } from '../license/license';
import { findNumbers, findNumberWords, findPeriods, HEDGES, NUMBER_WORDS } from '../numbers/numbers';
import { PACES, PACE_IDS, pageRange } from '../pace/pace';
import { DOMAINS, type Page, type PaceId, type Thing } from '../schema/thing';
import { countWords } from '../text/sentences';
import { foldForCompare, normalizeTypography, type Lang } from '../typography/typography';

export const VERIFIER_VERSION = 1;

export type Issue = { rule: string; where: string; message: string };

export type VerifyContext = {
  blocklist: { titles: Set<string>; qids: Set<string>; categoryPatterns: RegExp[] };
  /** German common nouns that may appear capitalised without occurring in the source. */
  deLexicon: Set<string>;
};

// ------------------------------------------------------------------ rule 1: schema
const zCredit = z.object({
  author: z.string(), authorSource: z.enum(['artist', 'uploader']), license: z.string(), licenseUrl: z.string().nullable(),
  fileUrl: z.string(), attribution: z.string().nullable(), attributionRequired: z.boolean(),
});
const zAside = z.object({ text: z.string(), arrowTo: z.string().optional() }).strict();
const zPage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('title'), title: z.string().min(1), line: z.string(), image: z.string().optional() }).strict(),
  z.object({ type: z.literal('sentence'), text: z.string().min(1), marks: z.array(z.object({ phrase: z.string(), mark: z.enum(['underline', 'circle', 'box', 'bracket']) })).optional(), aside: zAside.optional() }).strict(),
  z.object({ type: z.literal('bignumber'), fact: z.string(), display: z.string(), caption: z.string(), aside: zAside.optional() }).strict(),
  z.object({ type: z.literal('timeline'), events: z.array(z.object({ fact: z.string(), label: z.string() })).min(2).max(4) }).strict(),
  z.object({ type: z.literal('image'), image: z.string(), caption: z.string() }).strict(),
  z.object({ type: z.literal('map'), map: z.string(), label: z.string() }).strict(),
  z.object({ type: z.literal('compare'), items: z.array(z.object({ label: z.string(), fact: z.string() })).min(2), caption: z.string(), shape: z.enum(['bars', 'heights', 'circles']) }).strict(),
  z.object({ type: z.literal('closing'), text: z.string().min(1) }).strict(),
]);
export const zThing = z.object({
  schema: z.literal(1), id: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), lang: z.enum(['en', 'de', 'fr']), slot: z.enum(['morning', 'evening']),
  topic: z.object({ title: z.string(), qid: z.string().regex(/^Q\d+$/), pageid: z.number().int(), revid: z.number().int().positive(), domain: z.enum(DOMAINS), teaser: z.string() }),
  sources: z.array(z.object({ title: z.string(), url: z.string(), revid: z.number(), license: z.literal('CC BY-SA 4.0') })).min(1),
  images: z.record(z.string(), z.object({ file: z.string(), w: z.number(), h: z.number(), alt: z.string(), thumb: z.string().nullable(), sha1: z.string(), credit: zCredit })),
  facts: z.record(z.string(), z.object({ kind: z.enum(['number', 'measure', 'date', 'coords']), value: z.union([z.number(), z.string()]), unit: z.string().optional(), surface: z.string(), sentence: z.string().optional() })),
  paces: z.object({ easy: z.array(zPage), medium: z.array(zPage), deep: z.array(zPage) }),
  authoredBy: z.enum(['curated', 'extractive']), qualityScore: z.number(),
  verified: z.object({ version: z.number(), hash: z.string() }).optional(),
});

/** Every visible string on a page, with a label for error messages. */
export function pageTexts(pg: Page): { field: string; text: string; limit: 'pace' | 'aside' | 'label' }[] {
  const out: { field: string; text: string; limit: 'pace' | 'aside' | 'label' }[] = [];
  switch (pg.type) {
    case 'title': out.push({ field: 'line', text: pg.line, limit: 'pace' }); break;
    case 'sentence': out.push({ field: 'text', text: pg.text, limit: 'pace' }); break;
    case 'closing': out.push({ field: 'text', text: pg.text, limit: 'pace' }); break;
    case 'bignumber': out.push({ field: 'caption', text: pg.caption, limit: 'pace' }); break;
    case 'image': out.push({ field: 'caption', text: pg.caption, limit: 'pace' }); break;
    case 'map': out.push({ field: 'label', text: pg.label, limit: 'pace' }); break;
    case 'timeline': pg.events.forEach((e, i) => out.push({ field: `events[${i}].label`, text: e.label, limit: 'pace' })); break;
    case 'compare': out.push({ field: 'caption', text: pg.caption, limit: 'pace' }); pg.items.forEach((it, i) => out.push({ field: `items[${i}].label`, text: it.label, limit: 'label' })); break;
  }
  if ('aside' in pg && pg.aside) out.push({ field: 'aside', text: pg.aside.text, limit: 'aside' });
  return out;
}

// ------------------------------------------------------------------ helpers for rules 3–6
function sourceNumbers(src: string, lang: Lang): Set<number> {
  const s = new Set<number>();
  for (const l of ['en', 'de', 'fr'] as Lang[]) for (const h of findNumbers(src, l)) for (const r of h.readings) s.add(r);
  for (const w of findNumberWords(src, lang)) s.add(w.value);
  return s;
}

function hedgedBefore(text: string, index: number, lang: Lang): boolean {
  const before = text.slice(Math.max(0, index - 24), index).toLowerCase();
  return HEDGES[lang].some((h) => new RegExp(`(^|\\s)${h.replace(/[.]/g, '\\.')}\\s*$`).test(before));
}

const WORD_RE = /[\p{L}][\p{L}\p{M}’'\-]*/gu;

function sourceWordSet(src: string): Set<string> {
  const s = new Set<string>();
  for (const m of foldForCompare(src).replace(/[’']/g, "'").matchAll(WORD_RE)) {
    s.add(m[0]);
    for (const part of m[0].split(/[-']/)) if (part) s.add(part);
  }
  return s;
}

function inflections(word: string, lang: Lang): string[] {
  const w = word.replace(/[’']/g, "'");
  const out = [w, w.replace(/'s$/, ''), w.replace(/'$/, '')];
  if (lang === 'de') out.push(w.replace(/(es|s|n|en)$/, ''), w + 's', w + 'n', w + 'en', w + 'e');
  if (lang === 'fr') out.push(w.replace(/[sx]$/, ''), w + 's');
  if (lang === 'en') out.push(w.replace(/s$/, ''), w + 's', w.replace(/ies$/, 'y'), w.replace(/es$/, ''));
  for (const part of w.split(/[-']/)) if (part.length > 1) out.push(part);
  return out;
}

const STOPWORDS: Record<Lang, string[]> = {
  en: ['the', 'and', 'of', 'to', 'is', 'was', 'are', 'were', 'it', 'that', 'with', 'for', 'as', 'by', 'from', 'this', 'which', 'its', 'has', 'have', 'be', 'or', 'at', 'an', 'can', 'into', 'their', 'than', 'they', 'about'],
  de: ['der', 'die', 'das', 'und', 'ist', 'war', 'sind', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'mit', 'von', 'zu', 'auf', 'für', 'sich', 'nicht', 'auch', 'als', 'wird', 'wurde', 'bei', 'nach', 'aus', 'oder', 'im', 'zum'],
  fr: ['le', 'la', 'les', 'et', 'est', 'des', 'du', 'une', 'un', 'dans', 'pour', 'par', 'sur', 'qui', 'que', 'au', 'aux', 'il', 'elle', 'sont', 'était', 'avec', 'ce', 'cette', 'se', 'son', 'sa', 'ses', 'plus', 'pas'],
};

function stopwordCounts(text: string): Record<Lang, number> {
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const r = { en: 0, de: 0, fr: 0 } as Record<Lang, number>;
  for (const l of ['en', 'de', 'fr'] as Lang[]) {
    const set = new Set(STOPWORDS[l]);
    r[l] = words.filter((w) => set.has(w)).length;
  }
  return r;
}

const VOICE: Record<Lang, RegExp> = {
  en: /\b(did you know|amazing|incredible|mind-blowing|unbelievable|stunning|epic|insane|you won['’]t believe)\b/i,
  de: /\b(wussten sie|weisst du|wusstest du|unglaublich|krass|atemberaubend|sensationell|der hammer)\b/i,
  fr: /\b(le saviez-vous|saviez-vous|incroyable|hallucinant|époustouflant|dingue|stupéfiant)\b/i,
};
const EMOJI = /\p{Extended_Pictographic}/u;

/** Small, stable string hash (cyrb53) → hex. Isomorphic; good enough for a content stamp. */
export function hashString(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

export function stampFor(thing: Thing, packet: Packet): { version: number; hash: string } {
  const { verified: _ignored, ...body } = thing;
  return { version: VERIFIER_VERSION, hash: hashString(JSON.stringify(body)) + '.' + hashString(JSON.stringify(packet)) };
}

// ------------------------------------------------------------------ the verifier
export function verifyThing(thing: Thing, packet: Packet, ctx: VerifyContext): Issue[] {
  const issues: Issue[] = [];
  const fail = (rule: string, where: string, message: string) => issues.push({ rule, where, message });

  // 1. schema
  const parsed = zThing.safeParse(thing);
  if (!parsed.success) {
    for (const e of parsed.error.issues.slice(0, 10)) fail('schema', e.path.join('.'), e.message);
    return issues;
  }
  const lang = thing.lang;
  const src = sourceText(packet);
  const srcNums = sourceNumbers(src, lang);
  const srcFold = foldForCompare(src);
  const srcPeriods = findPeriods(src);
  const srcYears = new Set(findNumbers(src, lang).filter((h) => h.isYear).map((h) => h.value));
  const srcWords = sourceWordSet(src);

  for (const pace of PACE_IDS) {
    const pages = thing.paces[pace];
    const spec = PACES[pace];
    const [min, max] = pageRange(pace, thing.slot);
    if (pages.length < min || pages.length > max) fail('schema', pace, `${pages.length} pages, allowed ${min}–${max}`);
    if (pages[0]?.type !== 'title') fail('schema', `${pace}[0]`, 'first page must be the title');
    if (pages[pages.length - 1]?.type !== 'closing') fail('schema', `${pace}[${pages.length - 1}]`, 'last page must be the closing');

    pages.forEach((pg, i) => {
      const where = `${pace}[${i}] ${pg.type}`;
      if (!spec.types.includes(pg.type)) fail('schema', where, `page type not allowed at this pace`);
      if ((pg.type === 'title' && pg.image) || pg.type === 'image') {
        const id = pg.type === 'image' ? pg.image : pg.image!;
        if (!thing.images[id]) fail('schema', where, `unknown image ${id}`);
      }
      if (pg.type === 'bignumber' && !thing.facts[pg.fact]) fail('schema', where, `unknown fact ${pg.fact}`);
      if (pg.type === 'timeline') for (const e of pg.events) if (!thing.facts[e.fact]) fail('schema', where, `unknown fact ${e.fact}`);
      if (pg.type === 'compare') for (const it of pg.items) if (!thing.facts[it.fact]) fail('schema', where, `unknown fact ${it.fact}`);
      if (pg.type === 'sentence') for (const mk of pg.marks ?? []) if (!pg.text.includes(mk.phrase)) fail('schema', where, `emphasis "${mk.phrase}" not in text`);

      // 9. fact integrity
      if (pg.type === 'bignumber') {
        const f = thing.facts[pg.fact];
        if (f && pg.display !== normalizeTypography(f.surface, lang)) fail('facts', where, `display "${pg.display}" ≠ fact "${f.surface}"`);
      }
      if (pg.type === 'timeline') for (const e of pg.events) {
        const f = thing.facts[e.fact];
        if (f && !e.label.includes(String(f.value))) fail('facts', where, `label "${e.label}" does not show year ${f.value}`);
      }

      for (const { field, text, limit } of pageTexts(pg)) {
        const w = `${where}.${field}`;
        // 2. length
        const words = countWords(text);
        const cap = limit === 'aside' ? 6 : limit === 'label' ? 4 : spec.maxWords;
        if (words > cap) fail('length', w, `${words} words, limit ${cap}`);

        // 3. numbers (digits and number words)
        for (const h of findNumbers(text, lang)) {
          if (h.readings.some((r) => srcNums.has(r))) continue;
          const near = [...srcNums].some((s) => h.readings.some((r) => s !== 0 && Math.abs(r - s) / Math.abs(s) <= 0.1));
          if (near && hedgedBefore(text, h.index, lang)) continue;
          fail('numbers', w, `"${h.surface}" is not in the source`);
        }
        for (const nw of findNumberWords(text, lang)) {
          if (!srcNums.has(nw.value) && !new RegExp(`\\b${nw.word}\\b`, 'i').test(srcFold)) fail('numbers', w, `"${nw.word}" (${nw.value}) is not in the source`);
        }
        // 4. periods
        for (const p of findPeriods(text)) {
          const ok = srcPeriods.some((s) => s.kind === p.kind && s.value === p.value) ||
            [...srcYears].some((y) => (p.kind === 'decade' ? y >= p.value && y < p.value + 10 : Math.floor((y - 1) / 100) + 1 === p.value));
          if (!ok) fail('years', w, `"${p.surface}" is not supported by the source`);
        }
        // 5. proper names
        const tokens = [...foldForCompare(text).replace(/[’']/g, "'").matchAll(WORD_RE)];
        for (const m of tokens) {
          const tok = m[0];
          if (!/^\p{Lu}/u.test(tok)) continue;
          const before = foldForCompare(text).slice(0, m.index!).trimEnd();
          const sentenceStart = before === '' || /[.!?…:«»"“„‹›(–—]$/.test(before);
          if (sentenceStart) continue;
          if (lang === 'en' && tok === 'I') continue;
          const forms = inflections(tok, lang);
          if (forms.some((f) => srcWords.has(f))) continue;
          if (lang === 'de' && forms.some((f) => ctx.deLexicon.has(f.toLowerCase()))) continue;
          fail('names', w, `"${tok}" is not in the source${lang === 'de' ? ' or the German lexicon' : ''}`);
        }
        // 6. language and typography
        if (words >= 6) {
          const c = stopwordCounts(text);
          const others = (['en', 'de', 'fr'] as Lang[]).filter((l) => l !== lang).map((l) => c[l]);
          if (c[lang] === 0 || c[lang] < Math.max(...others)) fail('language', w, `does not read as ${lang} (${JSON.stringify(c)})`);
        }
        if (lang === 'fr' && /[^\u00a0\u202f]([;:!?»])/.test(text.replace(/https?:\S+/g, '')) && !/\d:\d/.test(text)) {
          const m = text.match(/(.)([;:!?»])/);
          if (m && m[1] !== '\u00a0' && m[1] !== '\u202f') fail('typography', w, `French needs a non-breaking space before "${m[2]}"`);
        }
        if (lang === 'de' && /[ßẞ]/.test(text)) fail('typography', w, 'Swiss German writes "ss", not "ß"');
        if (lang === 'de' && /[„“]/.test(text)) fail('typography', w, 'Swiss German uses «guillemets»');

        // 10. voice (curated only)
        if (thing.authoredBy === 'curated') {
          const v = text.match(VOICE[lang]);
          if (v) fail('voice', w, `"${v[0]}"`);
          if (EMOJI.test(text)) fail('voice', w, 'emoji');
        }
      }
    });
    if (thing.authoredBy === 'curated') {
      const bangs = pages.flatMap(pageTexts).map((t) => (t.text.match(/!/g) ?? []).length).reduce((a, b) => a + b, 0);
      if (bangs > 1) fail('voice', pace, `${bangs} exclamation marks (max 1)`);
    }
  }
  if (countWords(thing.topic.teaser) > PACES.easy.maxWords) fail('length', 'topic.teaser', `teaser over ${PACES.easy.maxWords} words`);

  // 6. per-file language check
  const allText = PACE_IDS.flatMap((p) => thing.paces[p]).flatMap(pageTexts).map((t) => t.text).join(' ');
  const c = stopwordCounts(allText);
  if (c[lang] < Math.max(...(['en', 'de', 'fr'] as Lang[]).filter((l) => l !== lang).map((l) => c[l]))) fail('language', 'file', `file does not read as ${lang}`);

  // 7. attribution
  for (const s of thing.sources) {
    if (!/^https:\/\/(en|de|fr)\.wikipedia\.org\/w\/index\.php\?.*oldid=\d+/.test(s.url)) fail('attribution', `source ${s.title}`, 'url must link the exact revision (oldid)');
    if (!(s.revid > 0)) fail('attribution', `source ${s.title}`, 'missing revid');
  }
  for (const [id, img] of Object.entries(thing.images)) {
    issues.push(...checkCredit(id, img.credit));
  }

  // 8. blocklist (current list)
  if (ctx.blocklist.titles.has(thing.topic.title.toLowerCase())) fail('blocklist', 'topic', `title "${thing.topic.title}" is blocklisted`);
  if (ctx.blocklist.qids.has(thing.topic.qid)) fail('blocklist', 'topic', `${thing.topic.qid} is blocklisted`);
  for (const cat of packet.categories) for (const re of ctx.blocklist.categoryPatterns) if (re.test(cat)) fail('blocklist', 'topic', `category "${cat}" matches ${re}`);

  return issues;
}

/**
 * Rule 7 for images (approved 2026-10-05): author and license always; the license URL is required for
 * CC BY / CC BY-SA and may be empty for Public domain / CC0, because the credit then links the
 * Commons file page — which must always be present.
 */
export function checkCredit(id: string, c: Thing['images'][string]['credit']): Issue[] {
  const out: Issue[] = [];
  const where = `image ${id}`;
  if (!c.author.trim()) out.push({ rule: 'attribution', where, message: 'missing author' });
  const kind = classifyLicense(c.license);
  if (!kind) out.push({ rule: 'attribution', where, message: `license "${c.license}" is not on the allowlist` });
  if (kind && needsLicenseUrl(kind) && !c.licenseUrl) out.push({ rule: 'attribution', where, message: `${c.license} requires a license URL` });
  if (c.licenseUrl !== null && !/^https:\/\/[^\s<>"]+$/.test(c.licenseUrl)) out.push({ rule: 'attribution', where, message: 'license URL is not a plain https URL' });
  if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(c.fileUrl)) out.push({ rule: 'attribution', where, message: 'missing Commons file page link' });
  return out;
}

export function isPaceId(x: string): x is PaceId {
  return (PACE_IDS as readonly string[]).includes(x);
}

export { NUMBER_WORDS };
