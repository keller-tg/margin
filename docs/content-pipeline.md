# Content pipeline

```
npm run pool:build        # once: Vital Articles → enriched pool (slow, polite, resumable)
npm run content:prepare   # pick topics into the frozen queue, write authoring packets
npm run content:bake      # compose (extractive for now), verify, write public/daily/*.json
npm run content:verify    # re-verify everything that is baked
npm run content:preview -- en/2026-10-06.morning de/2026-10-06.evening
npm run content:quality   # seeded random samples + the weakest 10% with reasons
```

## Talking to Wikimedia (rules approved 2026-10-05)

All traffic goes through `scripts/content/lib/wiki.ts`:

- **Hosts.** en/de/fr.wikipedia.org (Action API) and query.wikidata.org (SPARQL), nothing else. Image metadata (license, author, attribution, dimensions) is requested from the **language edition's** Action API with `prop=imageinfo&iiprop=…|extmetadata`. Commons files come back through it as `imagerepository: "shared"`, so commons.wikimedia.org is never called directly.
- **Politeness.** Every request carries a descriptive User-Agent with contact info and `maxlag=5`. Titles are batched (at most 50 per request) and requests run strictly one at a time, at least 1.1 s apart. A 429, 502, 503 or 504 and a `maxlag` error are retried, honoring `Retry-After`, with exponential backoff.
- **Fetched once, ever.** Every response is stored under `content/cache/api/{host}/…`, keyed by URL with sorted parameters and without `maxlag`, and the cache is committed. Reruns and CI replay it and never re-fetch. An interrupted `pool:build` or `content:prepare` resumes for free.
- **Tests never touch the network.** Under Vitest a cache miss throws. Tests read only the clearly marked files in `fixtures/`.
- **Runtime.** Visitors never load anything from Wikimedia for the daily things: text and images are served from Margin's own origin. The only live Wikimedia call allowed in the browser is the Rabbit Trail (a later milestone), and only when the visitor starts one.

**Rate limits in practice.** From the cloud environment's shared IP, Wikimedia answers many requests with 429 and `Retry-After` between 1 s and 60 s. The client waits it out. That makes `pool:build` slow, about 6 requests a minute, but it only ever runs once.

## Pool

`pool:build` reads the eleven [Vital Articles Level 4](https://en.wikipedia.org/wiki/Wikipedia:Vital_articles/Level/4) lists (about 10,000 entries) and maps each heading path to a Margin domain (`scripts/content/config/domains.ts`). Whole sections that the content policy excludes are dropped there. It then enriches each entry:

1. en pageprops (QID, disambiguation), length, free lead image, coordinates
2. Wikidata: human? date of death, P18 image, de/fr sitelinks
3. the same props for the de and fr articles
4. imageinfo + extmetadata for every candidate image

Output: `content/pool/{lang}.jsonl.gz`, `content/pool/dropped.{lang}.json` (compact: dropped topic → reason), `content/images/index.json.gz` (compact: every evaluated file → `ok` + event codes, or the rejection reason), `content/images/rejected.json` (file → reason, readable) and `content/reports/pool.json` (counts, fallbacks, rejections).

**Storage (decision of 2026-10-06).** Full records are kept only for what is used: `content/images/used.json` holds the full credits of the images in the queues, and the packets hold the full source text of the queued topics. Everything else is compact (id → reason) or compressed. The API cache is gzip. Raw image-metadata responses are not kept: `content:prepare` derives a used image's full record on demand (one batched request per 50 files, then cached). After pruning, the cache shrank from 83 MB to 9 MB, the image records from 15 MB to 1 MB, and the pool from 7 MB to 2 MB. `pool:build` still runs offline from the compact index.

**Image per topic and language.** Images are shared across editions, so the image is chosen in this order: the edition's own free lead image, then another edition's lead image, then Wikidata P18. A topic is dropped only if no free image exists anywhere.

**People** are kept only if Wikidata has a date of death at least two years back.

## Image licensing (`src/core/license`)

- **License.** `LicenseShortName` must be CC0, Public domain, CC BY or CC BY-SA. NonFree files, trademark and insignia restrictions, and non-Commons (local) files are rejected. So are SVG and GIF files, files smaller than 800 px on the long side, and extreme aspect ratios.
- **License URL.** Required for CC BY and CC BY-SA. For Public domain and CC0 it may be empty, and the credit then links the Commons file page. A URL is never invented.
- **Author.** The Artist HTML is reduced to plain text, talk-page signatures and timestamps are cut, and the first meaningful line is kept. If that is empty or longer than 80 characters, the uploader's username is used instead: the uploader of the file's **first** version, taken from its history. The `user` in a plain imageinfo response is the latest version's uploader, often a bot that only rotated or cropped the file. Bot accounts (Rotatebot, FlickreviewR, …) never count as authors. The image is rejected only if both fail.
- **Known limit.** Some people mass-upload other people's work (archive and museum transfers). For those files the uploader fallback names a real person who isn't the author. The Commons file page link, always present, carries the full provenance.
- **Attribution.** If the uploader set an `Attribution` text, it is shown verbatim. Otherwise the credit is built from author, license and the file page link. `AttributionRequired` is stored. The Commons file page is always linked.
- **Untrusted strings.** Every API string is reduced to plain text (`src/core/text/plain.ts`) and must be rendered as text, never as HTML.
- **Display.** Images may be cropped, resized, rotated or animated for display. The /about page says so (`about.imagesModified`).

Every fallback and rejection is counted in `content/reports/pool.json` and listed per file in `content/images/meta.json`.

## Review queue, word scan, image screen (decisions of 2026-10-06)

- **Category blocklist, narrow.** Only explicit sexual content, recreational drug use and trafficking, graphic violence *events* (massacres, genocide, terrorism, executions) and live political controversy block a topic. Biographical war categories and substance classes don't block (Fauré, Achebe, Armstrong and xenon are eligible again). Earlier rejects get re-checked on every `content:prepare`.
- **Word scan → review.** After composing, every page is scanned for words like bomb, massacre, execution, genocide, murder or suicide (`src/core/review/scan.ts`, en/de/fr). A hit sends the topic to `content/review/topics-queue.json` with status `review`, along with the matching pages, and the slot re-picks. Set `status` to `approved` to let the topic back in, or `rejected` to keep it out.
- **Manual review.** Robert Oppenheimer (de), Ezra Pound (en) and Palmyre (fr) are in the review queue, waiting for the owner's decision.
- **Image screen.** A file's own Commons categories, description and title are checked for nudity, explosions, corpses, weapons and combat. A hit falls back to the topic's next image (`altImages`). If no safe image is left, the topic is rejected. Hits are listed in `content/reports/image-screen.json`. **Known limit:** the screen only sees metadata. The sculpture of children behind fr "Nudité" has no tell-tale category, so only the topic blocklist caught it. The screen is a safety net, not a guarantee, and a human look at the images remains part of the review.

## Picking

`src/core/pick` is pure: seed = `hash(date|lang|slot|attempt)`. It scores FA/GA class, penalises abstract headings ("Basics", "General"), favours a length sweet spot, avoids the previous two days' domains and today's other slot, and excludes anything used within 365 days. It then draws from the top 40, weighted.

Checks that need the article itself run at pick time:
- the lead length
- the title and categories against `content/blocklist/`

A rejected candidate goes to `content/pool/rejects.json`, and the slot re-picks with the next attempt's seed. Picks in `content/queue/{lang}.json` are frozen. To veto or force a topic, use `content/overrides.json`.

## Composer and verifier

- `src/core/compose` builds all three paces from source sentences only. Rules added after the 2026-10-06 review, each with a regression test from real cases:
  - **Big numbers** are never part of a catalogue ID or code (`SMNK-PAL 10,000`). They need a unit or a counted word.
  - **Every sentence and timeline label needs a proper subject and a finite verb.** No "Placed on sale between 1877 and 1881.", no clause cut that leaves only a name and an appositive, no bibliography entries.
  - **Page 1 after the title says what the thing is.** It's a definitional lead sentence, shortened if needed by dropping an appositive or cutting after the predicate. Etymology never opens, and only Deep may use it, late.
  - The title line falls back to the definition's predicate when Wikidata has no description. Sentences in another language (book titles in a list of works) are never used.
- `src/core/quality/assess.ts` scores every baked thing by named problems: weak number, missing subject, dangling pronoun, short page, image instead of text, opener that isn't a definition, early etymology, few page types, no title line, foreign script, dense pages. `npm run content:quality` prints a seeded random sample and the weakest 10%. It cleans parentheticals, cuts long sentences only at clause boundaries, avoids dangling pronouns, and builds big-number and timeline pages from extracted facts. A quality score below 0.6 switches to a minimal template. If even that cannot fill the page budget, the build fails.
- Evening things have exactly 2/3/4 pages (Easygoing/Medium/Deep), with the title and closing included.
- `src/core/verify` implements plan §6. Its attribution rule follows the license rules above.
- Nothing ships unverified: `content:bake` writes a thing only if it verifies, and stamps it with the verifier version and hashes.

## Not in this milestone

- **Image binaries.** `content/images/meta.json` holds each image's standard-width (960 px) thumbnail URL and SHA-1. Downloading and re-encoding them to AVIF/WebP is a build step for the deploy milestone. Visitors never load them from Wikimedia.
- **Map and compare pages.** These need the Natural Earth projection and the `content/refs` table, which come with the page-type visuals.
- **Curated authoring.** `content/curated/` is read by a later milestone. Until then every thing is extractive.
- **DYK pools and the quality labels of de/fr.** These are phase two (plan §2).
