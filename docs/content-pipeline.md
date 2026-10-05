# Content pipeline

```
npm run pool:build        # once: Vital Articles → enriched pool (slow, polite, resumable)
npm run content:prepare   # pick topics into the frozen queue, write authoring packets
npm run content:bake      # compose (extractive for now), verify, write public/daily/*.json
npm run content:verify    # re-verify everything that is baked
npm run content:preview -- en/2026-10-06.morning de/2026-10-06.evening
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

Output: `content/pool/{lang}.jsonl`, `content/images/meta.json` (every evaluated image, with verdict, credit and events) and `content/reports/pool.json` (counts, fallbacks, rejections).

**Image per topic and language.** Images are shared across editions, so the image is chosen in this order: the edition's own free lead image, then another edition's lead image, then Wikidata P18. A topic is dropped only if no free image exists anywhere.

**People** are kept only if Wikidata has a date of death at least two years back.

## Image licensing (`src/core/license`)

- **License.** `LicenseShortName` must be CC0, Public domain, CC BY or CC BY-SA. NonFree files, trademark and insignia restrictions, and non-Commons (local) files are rejected. So are SVG and GIF files, files smaller than 800 px on the long side, and extreme aspect ratios.
- **License URL.** Required for CC BY and CC BY-SA. For Public domain and CC0 it may be empty, and the credit then links the Commons file page. A URL is never invented.
- **Author.** The Artist HTML is reduced to plain text, talk-page signatures and timestamps are cut, and the first meaningful line is kept. If that is empty or longer than 80 characters, the uploader's username is used instead. The image is rejected only if both fail.
- **Attribution.** If the uploader set an `Attribution` text, it is shown verbatim. Otherwise the credit is built from author, license and the file page link. `AttributionRequired` is stored. The Commons file page is always linked.
- **Untrusted strings.** Every API string is reduced to plain text (`src/core/text/plain.ts`) and must be rendered as text, never as HTML.
- **Display.** Images may be cropped, resized, rotated or animated for display. The /about page says so (`about.imagesModified`).

Every fallback and rejection is counted in `content/reports/pool.json` and listed per file in `content/images/meta.json`.

## Picking

`src/core/pick` is pure: seed = `hash(date|lang|slot|attempt)`. It scores FA/GA class, penalises abstract headings ("Basics", "General"), favours a length sweet spot, avoids the previous two days' domains and today's other slot, and excludes anything used within 365 days. It then draws from the top 40, weighted.

Checks that need the article itself run at pick time:
- the lead length
- the title and categories against `content/blocklist/`

A rejected candidate goes to `content/pool/rejects.json`, and the slot re-picks with the next attempt's seed. Picks in `content/queue/{lang}.json` are frozen. To veto or force a topic, use `content/overrides.json`.

## Composer and verifier

- `src/core/compose` builds all three paces from source sentences only. It cleans parentheticals, cuts long sentences only at clause boundaries, avoids dangling pronouns, and builds big-number and timeline pages from extracted facts. A quality score below 0.6 switches to a minimal template. If even that cannot fill the page budget, the build fails.
- Evening things have exactly 2/3/4 pages (Easygoing/Medium/Deep), with the title and closing included.
- `src/core/verify` implements plan §6. Its attribution rule follows the license rules above.
- Nothing ships unverified: `content:bake` writes a thing only if it verifies, and stamps it with the verifier version and hashes.

## Not in this milestone

- **Image binaries.** `content/images/meta.json` holds each image's standard-width (960 px) thumbnail URL and SHA-1. Downloading and re-encoding them to AVIF/WebP is a build step for the deploy milestone. Visitors never load them from Wikimedia.
- **Map and compare pages.** These need the Natural Earth projection and the `content/refs` table, which come with the page-type visuals.
- **Curated authoring.** `content/curated/` is read by a later milestone. Until then every thing is extractive.
- **DYK pools and the quality labels of de/fr.** These are phase two (plan §2).
