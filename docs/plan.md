# Margin: the plan (v0, pre-build)

> Status: proposal awaiting a "go". No application code has been written yet.
> Font test renders: [`docs/research/fonts/`](research/fonts/).

**The short version.** The plan is solid and buildable, but one thing blocks it right now. This cloud environment can't reach any Wikimedia host: en/de/fr.wikipedia.org, Commons, upload and Wiktionary are all "blocked by the egress proxy". I can build milestone (a) without them. The content pipeline and the 30-day batch need them allowlisted.

The fonts are verified, not guessed. I rendered them in Chromium and had the engine report, glyph by glyph, which font actually drew each one. **Caveat** wins.

A few things in the brief conflict with reality or with each other. They're flagged in §13, and the questions are at the end.

---

## 1. Architecture

There are three layers that share one core.

1. **Content pipeline.** Node and TypeScript. It runs in my sessions or in GitHub Actions, never in the browser. It builds a candidate pool, picks topics and fetches from Wikimedia. It writes authoring packets, composes extractive fallbacks and verifies curated files. Finally it bakes the daily JSON and the images.
2. **Static app.** React, Vite, Tailwind, Motion, rough.js and d3-geo. It loads `/daily/{lang}/{date}.{slot}.json` for today's local date and plays the pages. All user data lives in localStorage, and a service worker handles offline use.
3. **Runtime Wikipedia.** The visitor's browser talks to Wikipedia for exactly one thing: the Rabbit Trail. Those calls use `origin=*`, are cached, and fall back to a pre-baked pool.

The shared core lives in `src/core`. It is plain, isomorphic TypeScript with no DOM and no Node APIs. It covers:
- sentence splitting
- number and date extraction
- typography normalisation
- page composition
- license filtering
- pace logic and unlock logic
- a seeded RNG

The build scripts and the browser import the same code. So the Rabbit Trail's live mini-things are composed by the same composer that builds the fallback days. Everything in the core is pure and unit-tested.

```
pool (committed) → picker → topics-queue (frozen picks) → fetcher (+ disk cache)
   → packets → [Claude authors offline] → curated → verifier ─┐
   → extractive composer ─────────────────────────────────────┴→ bake → public/daily/*.json + images
```

**The deploy needs no keys.** One GitHub Action runs nightly and on push. It builds the site and force-pushes the finished `dist/` to an orphan `pages` branch. GitHub Pages serves that branch directly, and Cloudflare Pages serves it through its Git integration with no build step. That means no tokens in Actions: the built-in `GITHUB_TOKEN` is the only credential, and it isn't a key you manage. It also keeps image binaries out of `main`'s history.

**What gets committed to `main`:**
- source code
- the pool, the queue and the overrides
- the curated JSON and its verifier stamps
- the baked daily *text* JSON, so a date's text never changes under a reader

**Images** are downloaded and encoded at build time from a committed manifest (Commons file name, SHA-1 and credit), then cached between runs. Visitors only ever load images from our own origin, so the site keeps working when Wikipedia is down.

**Rabbit Trail at runtime.** Each hop makes two or three small Action API calls:
1. List the current article's links, then pre-filter them.
2. Fetch descriptions, intro extracts, `pageimages` with `pilicense=free`, pageprops and length for about 20 of them.
3. After the visitor picks one, fetch that image's `extmetadata` for its credit, plus a Wikidata check so we skip living people.

We score locally and offer four choices. The same composer builds the mini-thing. Results are cached in IndexedDB for 7 days, and any failure quietly switches to the baked pool. A whole trail is about 15 requests, far below the browser rate limits.

**Entitlements.** `isPremium()` and `can(feature)` read one flag source. Everything is unlocked in v1, and a payment provider can plug in later without touching feature code.

## 2. Content pipeline

### Pool

`npm run pool:build` runs occasionally and commits one reviewable JSONL file per language. The sources are:
- **English Vital Articles, levels 4 and 5.** Their section structure (Astronomy, Animals, Food and drink, Musical instruments…) gives each topic a domain for free.
- **Each edition's own quality labels.** That's en Featured and Good articles, de *Exzellent* and *Lesenswert*, and fr *Article de qualité* and *Bon article*.
- **Vital articles mapped to de and fr through Wikidata sitelinks.** German and French get the same "important topics" backbone, but picks are still made independently per language.
- **"Did you know" hooks** from the en DYK archives, de *Schon gewusst?* and fr *Le saviez-vous ?*. These are an extra evening pool. They have to be parsed out of wiki pages, which is fragile, so they come in phase two.

### Enrichment and filters

Enrichment is cached. For each candidate we record:
- the disambiguation flag
- page length and lead length
- the lead image and its license
- coordinates
- the Wikidata class (P31)
- birth and death dates
- categories

**Filters:**
- **Page type.** We drop disambiguations, lists and year or date pages.
- **Images.** Anything without a freely licensed lead image hosted on Commons is dropped.
- **Lead length.** Leads that are too short or enormous are dropped.
- **People.** They are allowed only if Wikidata has a date of death at least two years back.
- **Blocklist.** A blocklist of titles and QIDs, plus a category-regex blocklist per language.
- **Calm exclusions (default).** War, battles, massacres, terrorism, crime, disasters, diseases, sexuality, drugs, suicide, and current politics and elections. This one is a values call (see question 2).

### Picker

The picker is pure and deterministic. The seed is `hash(date|lang|slot)`, using xmur3 then mulberry32. The score combines three things:
- **Quality.** A bonus for featured or good articles, a lead length in the sweet spot, and "richness": numbers, dates and coordinates that unlock more page types.
- **Diversity.** The domain differs from the last two days in the same slot and from today's other slot.
- **Novelty.** The topic hasn't been used in this language within 365 days. A committed history ledger tracks this.

The picker then takes a seeded, weighted sample from the top K. Mornings draw substantial topics. Evenings draw small, gentle ones (a species, a food, an object, a word, an instrument, a mineral, a place) from a different domain than that morning.

Once a pick lands in `content/queue/{lang}.json` it is **frozen**. Re-running never reshuffles days that are already scheduled, even if the pool changes. In `content/overrides.json` you can veto a title or QID, which gets it re-picked, or force a title onto a date, slot and language.

### Fetcher

The fetcher is Action API first, because that's the most stable surface. It uses:
- `extracts`
- `pageimages` with `pilicense=free`
- `coordinates`, `pageprops` and `info`
- `imageinfo` with `extmetadata`
- section text for Deep pages

The REST `page/summary` endpoint is a convenience, not a dependency.

Every request sends a descriptive User-Agent and `maxlag`. Requests run one at a time per host, throttled to about one per second. The fetcher backs off on errors and respects `Retry-After`. Responses go into an on-disk cache keyed by URL and revision ID. Every source records its `revid`, so the attribution can link the exact revision we adapted.

### Images

- **Licenses.** Only Commons-hosted files whose `LicenseShortName` is CC0, Public Domain, CC BY or CC BY-SA are used.
- **Rejections.** Files with a NonFree flag or with trademark or insignia restrictions are rejected.
- **Credits.** The Artist field's HTML is stripped to plain text. The license URL, file page and author are all stored.
- **Sizes.** Thumbnails are requested only at Wikimedia's standard widths (500, 960 or 1280) and then re-encoded locally to AVIF and WebP.

### Extractive composer

The composer splits sentences using a per-language abbreviation list (z. B., ca., St., av. J.-C., decimals, initials). It scores the sentences and builds typed pages from them.

To fit Easygoing's 15-word limit, it may cut a sentence at a clause boundary. If nothing fits, it uses a non-text page type such as a big number or an image instead of a weak sentence.

Each thing gets a quality score. The score is penalised for:
- dangling pronouns ("It was…" with no antecedent)
- leftover parentheses
- truncated clauses
- too few distinct page types

Below the threshold, the composer falls back to a safe minimal template: title, image, two clean sentences, closing. If even that fails, the build fails loudly.

### Typography normaliser

The normaliser is part of the shared core and applies to both composed and curated text.
- **French** gets non-breaking spaces before `; : ! ? »` and after `«`. This matters: the test render shows a lone `«` stranded at the end of a line without it.
- **German** gets `„…“` quotes.
- **All languages** get typographic apostrophes and dashes.

## 3. Page-type schema

```ts
type Page =
  | { type: 'title';     title: string; line: string; image?: ImgId }
  | { type: 'sentence';  text: string; marks?: Emphasis[]; aside?: Aside }
  | { type: 'bignumber'; fact: FactId; display: string; caption: string; aside?: Aside }
  | { type: 'timeline';  events: { fact: FactId; label: string }[] }            // 2–4 events
  | { type: 'image';     image: ImgId; caption: string }
  | { type: 'map';       map: MapId; label: string }                            // pre-projected sketch
  | { type: 'compare';   items: { label: string; fact: FactId | RefId }[]; caption: string;
                         shape: 'bars' | 'heights' | 'circles' }
  | { type: 'closing';   text: string };

type Emphasis = { phrase: string; mark: 'underline' | 'circle' | 'box' | 'bracket' }; // phrase must occur in text
type Aside    = { text: string; arrowTo?: string };   // margin note, ≤ 6 words, lives in the margin column

interface Thing {
  schema: 1; id: string; date: string; lang: 'en' | 'de' | 'fr'; slot: 'morning' | 'evening';
  topic:   { title: string; qid: string; pageid: number; revid: number; domain: Domain; teaser: string };
  sources: { title: string; url: string; revid: number; license: 'CC BY-SA 4.0' }[];
  images:  Record<ImgId, { files: Srcset; w: number; h: number; alt: string;
                           credit: { author: string; license: string; licenseUrl: string; fileUrl: string } }>;
  facts:   Record<FactId, { kind: 'number' | 'measure' | 'date' | 'coords'; value: number | string;
                            unit?: string; surface: string }>;
  maps?:   Record<MapId, { viewBox: string; zoomBox: string; paths: string[]; point: [number, number] }>;
  paces:   { easy: Page[]; medium: Page[]; deep: Page[] };
  trail?:  { pool: TrailSeed[] };                       // morning only: offline Rabbit Trail fallback
  authoredBy: 'curated' | 'extractive'; qualityScore: number;
  verified?: { version: number; hash: string };
}
```

Images, facts and maps are stored once and referenced by ID, so the three paces never duplicate anything.

The END page and the evening margin-note page belong to the app, not the content.

Maps are pre-projected at build time from Natural Earth, which is public domain, via `world-atlas` (ISC license). The browser only animates small SVG paths, so no map library ships to visitors.

## 4. Pace schema

```ts
const PACES = {
  easy:   { pages: [4, 4],   maxWords: 15, eveningPages: 2, trailHopPages: [1, 2],
            types: ['title', 'sentence', 'image', 'bignumber', 'closing'] },
  medium: { pages: [6, 7],   maxWords: 25, eveningPages: 3, trailHopPages: [2, 3],
            types: [...easy, 'timeline', 'map'] },
  deep:   { pages: [10, 12], maxWords: 40, eveningPages: 4, trailHopPages: [3, 4],
            types: 'all', deeperSections: true },
} as const;
```

- **Page counts** include the title and closing pages but not END.
- **Word counting.** A word is a whitespace-separated token containing at least one letter or digit, so "l'œuvre" counts as one word and "1,024" counts as one.
- **Switching pace.** The choice is stored locally. Changing it mid-sequence re-renders instantly from the JSON that's already loaded and lands on the page at the same relative position.
- **Equal status.** The UI never says "easy"; it shows *Easygoing / Medium / Deep*, and all three get the same polish.
- ⚠ The minute labels don't match the word limits; see §13.1.

## 5. Authoring-packet format

Packets live at `content/packets/{lang}/{date}.{slot}.json`, where `{lang}` is always the topic's own edition.

```jsonc
{
  "packetVersion": 1, "date": "2026-10-12", "slot": "morning", "lang": "de",
  "topic":  { "title": "Kraken", "qid": "Q…", "revid": 0,
              "url": "https://de.wikipedia.org/w/index.php?oldid=…", "domain": "animals" },
  "limits": { "easy": { "pages": [4, 4], "maxWords": 15 }, "medium": { … }, "deep": { … } },
  "source": {
    "lead": "plain text of the lead …",
    "sections": [ { "heading": "Anatomie", "text": "…" } ]   // Deep material, capped ≈ 2,500 words
  },
  "facts": [
    { "id": "f3", "kind": "number",  "value": 3, "surface": "drei Herzen", "sentence": "…", "section": "Anatomie" },
    { "id": "f7", "kind": "date",    "value": "1758", "sentence": "…" },
    { "id": "f9", "kind": "measure", "value": 9, "unit": "m", "surface": "bis zu 9 m", "sentence": "…" },
    { "id": "c1", "kind": "coords",  "value": "47.37,8.54" }
  ],
  "names":  [ "Carl von Linné", "Mittelmeer" ],              // proper names found in the source
  "images": [ { "id": "img1", "file": "File:….jpg", "caption": "…", "credit": { … } } ],
  "extractive": { "easy": [ … ], "medium": [ … ], "deep": [ … ] },  // fallback draft, for reference
  "hints":  { "bignumber": ["f9"], "timeline": ["f7"], "map": "c1" }
}
```

I write `content/curated/{lang}/{date}.{slot}.json`, which holds `{ packetHash, teaser, paces: { easy, medium, deep }, notes }`. Its pages reference fact and image IDs from the packet.

Batches are resumable for free. A unit of work counts as done once its curated file exists and passes verification, so an interrupted run just picks up where it stopped.

## 6. Verifier rules (`npm run content:verify`)

Every rule is a hard failure that names the file, the page and the offending token.

1. **Schema.** The file must validate (zod). Page types must be allowed for the pace and page counts must be in range. Every referenced fact or image ID must exist, and every emphasis phrase must actually occur in its text.
2. **Length.** Every page, and the teaser, must stay within the pace's word limit.
3. **Numbers.** Every number in the curated text must match a number in the packet's source text.
   - Digits are accepted in any local format: `1,000`, `1.000`, `1 000`, or Swiss `1'000`. Decimals can use `.` or `,`.
   - Number words count from two upward in all three languages. "One/ein/un" are skipped, because in German and French they are also the indefinite article.
   - Rounding is allowed only within ±10%, and only right after a hedge word (about, around, nearly · etwa, rund, fast, knapp · environ, près de, presque).
   - Text never converts units.
4. **Years and dates.** Years, decades (1870s, 1870er, années 1870) and centuries (19th, 19. Jahrhundert, XIXe siècle, Roman numerals included) are normalised. They must occur in the source.
5. **Proper names.**
   - In English and French, every capitalised word that doesn't start a sentence must occur in the source.
   - Common inflections are tolerated: the possessive 's, German -s, -es, -n and -en, and French plural -s and -x.
   - German capitalises every noun, so there every capitalised word must occur either in the packet or in a committed common-noun allowlist (`content/lexicon/de-common.txt`) that grows as we go.
   - This is strict on purpose. A false alarm costs ten seconds; a made-up name costs trust.
6. **Language.** A deterministic stopword-ratio check runs per page (for pages of six words or more) and per file. It's paired with typography checks for French spacing and German quotes.
7. **Attribution.** Every source has a URL, revid and license. Every image used has an author, license, license URL and file page, and the license is on the allowlist.
8. **Blocklist.** The topic, its QID and its categories are re-checked against the *current* blocklist.
9. **Fact integrity.** Values on `bignumber`, `timeline` and `compare` pages must equal their referenced fact exactly.
10. **Voice lint.** This is a failure for curated content:
    - no "did you know / wussten Sie / le saviez-vous"
    - no hype words from a per-language list
    - at most one exclamation mark per thing
    - no emoji

A passing file gets a stamp made of the curated hash, the packet hash and the verifier version. At build time, the verifier re-runs wherever the packet is still present and checks the stamp otherwise, so nothing unverified ships. Packets for days more than 30 days in the past are pruned so git doesn't bloat.

**An honest limitation.** The verifier proves that every number, year and name in my text exists in the source. It can't prove that a sentence relates them correctly, for example "3 hearts" versus "3 arms". Each fact carries its source sentence to keep me honest. Even so, `content:preview` is where a human eye earns its keep.

## 7. Unlock logic

`slotState(now)` is a pure function of the device's local wall-clock time.

- **Unlock times.** The morning unlocks at 05:00 and the evening at 17:00. Both stay "today" until local midnight. After midnight they quietly move into the Notebook archive. The last 7 days are free; the full archive sits behind the premium flag, which is unlocked in v1.
- **Before 05:00**, the landing page says in handwriting when the morning opens and offers the Notebook. There is no countdown.
- **Midnight.** A session that started before midnight stays pinned to its date until you close it. Nothing gets taken away at 23:59.
- **Content dates** are local calendar dates. The pipeline runs at least 14 days ahead (30 for curated content), which also covers UTC+14.
- **Missing day.** If today's file is missing, the app serves a baked evergreen set chosen by a hash of the date, so a day is never empty.
- **Not DRM.** This is a ritual, not access control: future JSON files are public, and peeking is allowed.

## 8. Folder structure

```
src/
  app/          routes, layout, providers, calm error states
  core/         isomorphic pure TS: text/ numbers/ typography/ compose/ license/ pace/ unlock/ rng/
  page-types/   Title Sentence BigNumber Timeline Image Map Compare Closing + End MarginNote
  player/       sequencing, page turn, keys/tap, progress ticks, auto-write
  ink/          pen-reveal mask, rough.js marks, tape & photo corners, margin asides
  notebook/     storage, archive flip view, JSON/Markdown export, import
  trail/        live fetch + cache, fallback pool, doodled path, copy/save-as-image
  pace/         calibration page, pace store
  entitlements/ isPremium(), can(feature), single flag source
  i18n/         en.json de.json fr.json, loader
  theme/        tokens, paper types, inks, night paper, motion prefs
  brand/        brand.config.ts (name, tagline), wordmark + icon SVG
scripts/
  content/         pool-build, prepare, verify, preview
  generate-daily/  bake: queue → fetch → curated | extractive → JSON + images
  fonts/           subset, metrics → CSS tokens, glyph-coverage check (the test below, as a CI check)
content/        pool/ queue/ history/ packets/ curated/ overrides.json blocklist/ lexicon/ refs/ .cache/ (ignored)
public/         fonts/ icons/ daily/ (baked text JSON)
docs/           architecture, authoring, content-policy, monetization, licenses, contributing
e2e/            Playwright flows + screenshot matrix (390/1440 × light/dark × reduced motion)
```

## 9. Fonts: verified, not guessed

**Method.**
1. I downloaded the TTFs from the official `google/fonts` repository.
2. I checked each font's character map (cmap) with fontTools.
3. I rendered a test sheet in Chromium and used the DevTools Protocol (`CSS.getPlatformFontsForNode`) to ask which font actually drew each glyph.
4. I looked at zoomed renders and a 390px page mock.

The test set was:
- German: `ä ö ü Ä Ö Ü ß „ “ ‚ ‘ » «`
- French: `é è ê ë à â î ï ô û ù ÿ ç œ æ` and their capitals
- Punctuation: `‘ ’ “ ” – — … ·`, the no-break space (NBSP) and the narrow no-break space (U+202F)
- Extras: `ẞ ≈ → × ° ½ €`

| Font | License | Who drew the DE/FR glyphs | Verdict |
|---|---|---|---|
| **Caveat** | OFL, no Reserved Font Name | The font itself drew all of them. Only the extras ẞ and → fell back. | ✅ **Primary ink.** It's the most pen-like, has variable weight from 400 to 700, and includes ≈. Its x-height is small (0.40 em), so body text runs at about 30px on mobile. |
| **Playpen Sans** | OFL | All drawn by the font. Only → fell back. | ✅ **The readable alternative.** It was designed for legibility. I'd offer it as a "clearer handwriting" setting and as a backup for Deep pages. |
| **Patrick Hand** | OFL | All drawn by the font. ẞ and → fell back. | ✅ Backup. Very legible, slightly comic. |
| Kalam | OFL | All drawn by the font. | ❌ **Broken `œ` spacing.** Its right side bearing is 188 units, against 20–36 for its other glyphs. It renders "cœ ur" and "l'œ uvre", which is bad for French. |
| Shadows Into Light, Architects Daughter | OFL | All drawn by the font. | ❌ Their `ß` reads as a capital B: "StraBe", "FuB". |
| Gochi Hand | OFL | All drawn by the font; ≈ fell back. | ❌ Heavy marker style and a B-like `ß`. |
| Reenie Beanie, Indie Flower | OFL | All drawn by the font. | ❌ Too scratchy to read comfortably, and the capitals are ambiguous. |
| **Inter** (UI and attribution) | OFL | All drawn by the font, including U+202F. | ✅ The quiet sans. |

**Notes.**
- **The narrow no-break space.** None of the handwriting fonts has U+202F, which French uses before `; : ! ?`. The normaliser uses U+00A0 instead, which all of them have. I could also add a narrow-space glyph while subsetting: the OFL allows that, and none of these fonts declares a Reserved Font Name.
- **The missing extras don't matter.** Arrows are drawn with rough.js anyway, and capital ẞ practically never appears.
- **Ruled-line baseline alignment.** I tested it and it carries across platforms. The effective metrics match on macOS, Windows and Linux: Caveat and Playpen set USE_TYPO_METRICS with typo metrics equal to hhea, and Patrick Hand's win metrics equal hhea.
  - Inside a line box of height R, at font size S, the baseline sits at `R/2 + (ascent − descent)·S/2`. For Caveat at 30px on a 36px rule, that's 27.9px.
  - I generate the rule positions as CSS tokens from that formula. The render in light and night paper shows letters sitting on the lines with descenders hanging below, like real handwriting.
  - The `ascent-override` and `descent-override` descriptors are set as extra insurance.
  - Only Chromium is available in this environment, so Safari still needs a check on your device.
- **An optional Swiss touch.** A "Deutsch (Schweiz)" display variant that writes `ss` instead of `ß` is a trivial display transform. It's optional.

**Contrast.** All values are WCAG ratios against `#f7f2e8` paper, except the night cream ink, which is measured against the `#24211e` night paper.

| Colour | Ratio |
|---|---|
| graphite `#2e2c29` | 12.5:1 |
| blue-black `#1f2a44` | 12.8:1 |
| sepia `#5b4636` | 7.9:1 |
| night cream `#ece3d2` on `#24211e` | 12.6:1 |
| terracotta margin-note text `#a4492f` | 5.3:1 (AA) |
| terracotta margin line `#c0674a` | 3.6:1 (decorative only) |

Body ink stays at 7:1 or better, to make up for thin handwriting strokes on a grainy paper texture.

## 10. Tagline options

1. **"Learn one real thing. Then close the notebook."** This is the placeholder, because it carries the whole anti-feed promise.
   - DE: „Eine echte Sache lernen. Dann das Heft zuklappen.“
   - FR: « Apprendre une vraie chose. Puis refermer le carnet. »
2. "A few quiet pages, twice a day."
3. "Something true, written in the margin."

## 11. Motion, briefly

- **Pen-writing reveal.** Each rendered line gets a clip-path wipe. Line boxes are measured with `Range.getClientRects()`, the duration scales with the line's length, and a tiny nib dot rides the wipe's edge. The text is real DOM from the first frame.
- **Strokes.** The wordmark and the rough.js marks animate `stroke-dashoffset`. That works because they are real strokes.
- **Page turn.** The outgoing page peels away using a clip-path polygon from the right edge, with a soft gradient shadow and a slight translate, over about 550ms. The next page waits underneath.
- **Reduced motion and "skip motion".** Pages switch with a 200ms crossfade, and every mark is drawn statically.
- **Paper rustle.** It's off by default. It's synthesised with WebAudio from filtered noise, which makes it license-clean by construction.

## 12. Estimate for the 30-day batch

**Size.** 30 days × 3 languages × 2 slots makes **180 things**, each written in three paces.
- That's about 2,800 pages, of which about 1,700 carry text.
- That works out to roughly **35,000–45,000 authored words**.
- I'd read about 0.4–0.6 million words of packet source along the way.

**My time.**
- **`content:prepare`.** The first pool enrichment takes about 1–2 hours of polite API time. That's a one-off, and it's cached. After that, preparing 30 days takes about 20–40 minutes.
- **Authoring.** Writing plus verify-and-fix loops takes about 1.5–3 minutes per thing. That's **about 5–9 hours of session time**, spread over a few sessions. I'd work in chunks of five days for one language and verify after each chunk.
- **Real numbers.** I'll time the first chunk and report actual figures instead of this napkin math.

**Your time.** Skimming `content:preview` takes about 1–2 minutes per day per language you actually read. For German and English that's about 30–60 minutes a month.

**Refills.** Monthly refills after that take about an afternoon session.

## 13. Conflicts and things in the brief that look off

1. **The pace minutes don't add up.** Easygoing allows 4 pages of at most 15 words, so 60 words, which take about 20 seconds to read. Even with the writing animation and images it lands around one minute, not two. Medium lands around two minutes and Deep around four to five. Options:
   - drop the minutes and use descriptions instead ("a few pages / a handful / a slow coffee")
   - raise the word limits

   My default is to drop the minutes and show a measured estimate later.
2. **The "capitalised proper names" check breaks for German**, because every German noun is capitalised. The fix is the strict allowlist approach in §6, rule 5.
3. **"Write DE/FR from the English packet if no native one exists"** conflicts with "each language independently chosen". It also makes verification brittle, because German names won't appear in an English source. Picks are per edition anyway, so I'd drop that path: every thing is written from its own edition.
4. **Several Wikimedia endpoints changed since the brief was written:**
   - `/page/related` was blocked in February 2025 and is being removed.
   - The `api.wikimedia.org` feed is deprecated from July 2026, so we use `{wiki}/api/rest_v1/feed/featured` instead.
   - The featured feed has no "Did you know" section; that has to be parsed from wiki pages.
   - Commons now rejects non-standard thumbnail widths.
   - New 2026 rate limits allow about 200 requests a minute with a proper User-Agent, and 10 a minute without one.

   Hence: the Action API first, an adapter layer, and contract tests. The Rabbit Trail uses plain article links, which is what a trail is anyway, with `morelike:` search as a backup.
5. **Wiktionary.** The definition endpoint is documented as experimental, exists only on en.wiktionary, and I couldn't verify it from here. My proposal is no Wiktionary in v1. Evening "word" topics would come from Wikipedia articles about words and phrases.
6. **`stroke-dashoffset` on handwriting fonts** traces each glyph's outline. It reads as "outline, then fill", not as a pen. So text gets the mask wipe, and dash animation is reserved for real strokes: rough.js marks, the margin line and the wordmark.
7. **Deploying to Cloudflare from Actions needs an API token**, which the brief rules out. The `pages` branch plus Cloudflare's Git integration (§1) solves that.
8. **Committing images to `main`** would grow the repo by roughly half a gigabyte a year. The build-time manifest plus the orphan `pages` branch solves that.
9. **Premium gates in an open-source static site are honor-system.** Every daily JSON is public, and anyone can flip the flag in a fork. That's fine and in the spirit of the project; just be aware of it until a license-key Worker exists.
10. **"Available until local midnight" vs the 7-day archive.** I read it as "today's slot until midnight, then it lives in the Notebook".
11. **The `compare` page needs reference objects** (a person, a bus, a football pitch) whose sizes aren't in the packet. I'll ship a small committed `content/refs` table with values taken from Wikipedia, and the verifier will treat those as allowed facts.
12. **Lighthouse vs the pen reveal.** The player has to wait for the font before it starts writing, or the reveal janks. The landing page uses `font-display: swap` with one preloaded subset of about 40–60 KB.

## 14. Risks

1. **Network access, which blocks progress right now.** The proxy here blocks every Wikimedia host. Milestone (b) onward and the 30-day batch need them allowlisted.
2. **Topic quality.** Vital articles lean big and abstract ("Love", "Mathematics"), which is wrong for four pages. The mitigations are concreteness scoring, a separate gentle pool for evenings, a frozen queue you can review, and overrides.
3. **The extractive fallback will feel clunkier**, especially at 15 words per page. That's acceptable for a fallback, but curated coverage should stay ahead of the calendar.
4. **Image licensing is messy.** Problems we'll hit:
   - HTML in the Artist field, "unknown author", and many variants of public-domain tags
   - lead images that are maps, logos or flags, which bring trademark or insignia issues or are unreadable at phone size
   - English and French local fair-use files

   The mitigations are Commons-only images, a license allowlist, restriction checks, an "is this a photo?" heuristic and a review column in the preview.
5. **AI drift.** The right tokens can end up in the wrong relationship. The mitigations are the verifier, the source sentences carried in each fact, and a human preview.
6. **Verifier false positives** early on, especially German nouns and inflections. The allowlist workflow keeps it strict but teachable.
7. **Wikimedia API churn.** The RESTBase sunset and other deprecations are ongoing. The mitigations are the adapter layer, aggressive caching, and contract tests in the nightly job that fail loudly instead of shipping empty days.
8. **Sensitive content slipping through a category filter**, for example a calm-looking building with a dark history. The mitigations are the default exclusions plus your veto.
9. **Handwriting fatigue and accessibility.** The mitigations are short pages, ink at 7:1 or better, the Playpen option, and full DOM text for screen readers.
10. **Baseline drift across browsers.** Safari can't be checked here. The mitigations are the metric overrides plus a check on your device.
11. **Repository growth.** The mitigations are keeping only text on `main` and pruning old packets.
12. **Rabbit Trail privacy.** The visitor's browser talks to Wikipedia only once they start a trail. This will be stated on /about, and the Content Security Policy restricts `connect-src` to Wikimedia.
13. **Mixed licenses.** The code is MIT. All adapted content (`content/` and `public/daily/`) is CC BY-SA 4.0, with its own LICENSE-CONTENT file.
14. **The name "Margin".** You need to check name, domain and trademark availability before launch. The README will say so.

---

## Blocking questions (one batch)

1. **Network access. This is the only true blocker.** Please allowlist these domains in the environment's network settings (cloud environment menu → Edit → Network access → Custom, keeping the package-manager defaults):
   - `*.wikipedia.org`
   - `*.wikimedia.org` (Commons, upload, thumb, meta)
   - `*.wikidata.org`, including `query.wikidata.org`
   - optionally `*.wiktionary.org`

   Steps: https://code.claude.com/docs/en/cloud-environments#network-access
2. **Calm-content policy.** Is it OK to exclude war, battles, disasters, diseases, crime, sexuality, drugs and current politics by default? It narrows history quite a bit.
3. **Pace labels.** Should I drop the minutes (my default), or keep them and raise the word limits?
4. **Hosting.** Cloudflare Pages as the primary host, with GitHub Pages as the fallback, both served from the orphan `pages` branch. Do you already have a Cloudflare account and a domain? And is `keller-tg/margin` public now, or should it go public later?
5. **Batch start and speed.** Should the curated batch start tomorrow (2026-10-06)? And do you want me to split the authoring across parallel sub-agents per language to save wall-clock time, or keep it to this one session?
6. **Three quick yes/nos.** Tagline 1 as the placeholder? The Swiss `ss` variant? Leave Wiktionary out of v1?

If you don't answer something, I'll go with the defaults above. Say **"go"** and I'll start with milestone (a).

### Sources for the API findings
- [/page/related endpoint removal (wikitech-l)](https://lists.wikimedia.org/hyperkitty/list/wikitech-l@lists.wikimedia.org/thread/GFC2IJO7L4BWO3YTM7C5HF4MCCBE2RJ2/) · [T376297](https://phabricator.wikimedia.org/T376297)
- [API Portal deprecation (Wikitech)](https://wikitech.wikimedia.org/wiki/API_Portal/Deprecation)
- [Common thumbnail sizes (MediaWiki)](https://www.mediawiki.org/wiki/Common_thumbnail_sizes) · [T414805 standard sizes only](https://phabricator.wikimedia.org/T414805)
- [Wikimedia APIs rate limits (MediaWiki)](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits) · [Robot policy](https://wikitech.wikimedia.org/wiki/Robot_policy)
- [Wikimedia REST API, incl. experimental Wiktionary definitions (MediaWiki)](https://www.mediawiki.org/wiki/Wikimedia_REST_API)
