# The Rabbit Trail (milestone e)

```
npm run content:trail -- [--from 2026-10-06] [--days 30] [--langs en,de,fr]   # bake the offline pools
npm run content:trail-fixture -- --lang en --date 2026-10-08 --pace medium --picks 1,0,0,0,0   # e2e fixture
npx playwright test e2e/trail.spec.ts e2e/csp.spec.ts                          # → e2e/__shots__/e-*.png
```

From the morning's END page, "follow a rabbit trail" opens `/trail/:lang/:date`. A trail has **five hops**, then its own END page.
- **Each hop.** A choice of **exactly four** stops, each with a title and one line. Then 1–4 pages about the chosen stop:
  - Easygoing: 1–2 pages
  - Medium: 2–3 pages
  - Deep: 3–4 pages
- **Page 1 of a stop.** The title, its one line, and the first sentence. Each further page holds one more sentence of the lead, fitted to the pace's word limit by the same cleaning rules as the daily composer.
- **Text only.** Stops are written, never illustrated. No image is loaded at runtime, so there are no unscreened pictures and no visitor requests to upload.wikimedia.org.

The trail is its own lazily loaded chunk: about 39 KB, 16.5 KB gzipped. The main bundle grew only by the trail's words in the three languages and the link on the END page.

## Where the stops come from

The core is `src/core/trail/`: pure, isomorphic and tested with handmade fixtures. The bake script and the browser run the same code.

1. **Links.** One `action=parse&prop=text` request. Only the links inside the article's **prose paragraphs** are kept, in reading order. Infoboxes, navboxes, references and identifier templates (ISBN, JSTOR, ISSN…) never become stops. At runtime only the lead section is read. The bake falls back to the whole article if the lead is thin.
2. **Cheap prefilter, no request.** These are dropped:
   - lists, timelines, years, decades and centuries
   - the title veto list
   - the trail so far
3. **Metadata screen.** One request for up to **50 titles**: pageprops, visible categories, description, revision and size. Category lists that arrive in pieces are merged. This step drops:
   - missing pages and disambiguation pages
   - stubs under 8 000 bytes
   - vetoed QIDs
   - the pipeline's **narrow category blocklist** (`content/blocklist/categories.{lang}.txt`)
   - the **trail topic rules** (below)
   - **living or recently dead people**
4. **Text screen.** Intro extracts come in requests of up to 20 titles, the API's limit for extracts. A candidate is dropped when:
   - the **review word scan** hits anywhere in its lead (`src/core/review/words.ts`); in the daily pipeline a hit means human review, on a live trail it simply drops the stop;
   - fewer than 2 usable sentences or 30 words remain after cleaning;
   - it can't fill the reader's pace;
   - there is no one-line description (the short description, else the lead's own "X is a …").
5. **Order.** The candidates are shuffled with a seed from the language, date and article, and the first four that pass are offered. A hop usually costs **three requests**.

**People.** The pipeline checks Wikidata dates of death. The trail stays on the three Wikipedia hosts, so it reads the article's own visible birth and death categories instead (en "1950 births" / "2001 deaths" / "Living people", de "Geboren 1950" / "Gestorben 2001", fr "Naissance en 1950" / "Décès en 2001", and the century and "unknown" variants):
- Any birth, death or "living" category marks a person.
- A person passes only with a death year at least three calendar years back (at least two full years, like the pipeline), or a death in an earlier century.
- No death category means *living*.

**Trail topic rules (`content/blocklist/trail-topics.{lang}.txt`).** The daily pool never contains wars, battles, weapons, crime or elections, because whole Vital-Articles sections are excluded (`scripts/content/config/domains.ts`). A trail stop can be any article, so these category rules stand in for that layer.
- They match categories that say what an article **is**: "Wars involving Argentina", "Battles of …", "Rifles of …", "Elections in …", "Krieg (…)", "Guerre impliquant …".
- They never match biographical ones ("… personnel of World War I", "Militaire … de la guerre …"). That follows the narrow-rules decision of 2026-10-06.
- Unit tests pin both directions.

## Runtime: live first, pool when needed (`src/trail/`)

- **`client.ts`.** Action API GETs to `{lang}.wikipedia.org` only.
  - Requests use `origin=*` (anonymous CORS, `credentials: 'omit'`, no referrer) and carry an `Api-User-Agent` header, as Wikimedia asks of browser clients; Wikipedia's preflight allows it.
  - Each request has a 6 s timeout. There are **no retries**.
  - Answers are cached in memory and in `localStorage` (`margin.trail.cache.v1`) for 7 days, within 1.5 MB, oldest dropped first. Error bodies are never cached.
- **`engine.ts`.** It tries the live path. In these cases the hop uses the **pre-baked pool** instead, with four unvisited stops that fit the pace, in a seeded order:
  - Wikipedia answers but fewer than four stops pass: the pool covers this hop, and the next hop tries live again.
  - The request fails (offline, 429, timeout, blocked): the pool covers this hop and **the rest of the trail**, so a busy Wikipedia is never asked again and again.
  - The choice page says which: "Paths found on Wikipedia just now." or "Paths from the notebook's own pages."
- **The pools.** `scripts/content/trail-pool.ts` bakes `public/trail/{lang}/{date}.json`, one per morning thing. Each holds 16 stops: twice what five hops of four choices need, so every pace still finds four that fit. Every stop carries its sentences and its revision, so an offline trail is complete with no network at all.
  - The bake goes through the cached, sequential, polite pipeline client: UA, maxlag, Retry-After, and the committed cache.
  - Its report is in `content/reports/trail-pools.{lang}.json`, with stop counts and rejection reasons.
- **The next hop's paths** are looked for while the reader is still reading the current stop.

## END: the way you came (`src/trail/TrailEnd.tsx`)

- **The path.** The six stops (the morning thing plus five) are real text: links to the exact revisions. A pencil path wanders through a sketchy red ring at each stop, and the last stop gets a double ring. The path is measured from the real layout, so it follows the text at any width, and the pen draws it like every other stroke.
- **keep in my notebook.** Saves the trail in `localStorage` (`margin.trails.v1`, keyed `lang:date`), on this device only. The Notebook (milestone f) lists kept trails.
- **copy as text.** The way as plain text, with a credit line and a link to every revision. It uses the Clipboard API, with a select-and-copy fallback.
- **save as image.** The trail is drawn on a `<canvas>` (1080 × 1350 PNG) in the reader's own paper, ink and handwriting, with the credit line, entirely in the browser with no library. Phones get the share sheet (Save Image, Photos…) and desktops a download.

## Content Security Policy (`scripts/build/csp.ts`)

The built `index.html` gets a CSP `<meta>`:
```
default-src 'self'; script-src 'self' 'sha256-…'; style-src 'self'; img-src 'self' data: blob:; font-src 'self';
connect-src 'self' https://en.wikipedia.org https://de.wikipedia.org https://fr.wikipedia.org;
object-src 'none'; base-uri 'self'; form-action 'self'
```
- The one inline script (preferences before first paint) is allowed by its hash. There is no `unsafe-inline` anywhere.
- It applies to the build only, because the dev server injects its own scripts. `e2e/csp.spec.ts` runs the built site under `vite preview` and checks that the daily pages and the trail cause no violations, and that a request to any other host is blocked.
- `frame-ancestors` and other header-only directives come with the deploy config in (h).

## Tests

All tests use fixtures; CI never calls the API.
- **Unit tests** use handmade API bodies (`src/core/trail/trail.test.ts`, `src/trail/*.test.ts`). They cover screening, people, the topic rules in both directions, the prose-link adapter, merged continuations, batching ≤ 50 titles, pages per pace, the live→pool fallbacks and the text export.
- **The offline e2e path** blocks Wikipedia and runs on the real baked pool.
- **The live e2e path** answers from `e2e/fixtures/trail-api.recorded.en-2026-10-08.json`. That file holds real responses, recorded through the cached client by `content:trail-fixture` along one fixed path. The test also checks that every request goes to en.wikipedia.org with `origin=*` and an `Api-User-Agent`, at about three requests per hop.

## What to check on Safari / iPhone

1. **CORS with `Api-User-Agent`.** Safari sends a preflight for the custom header. The trail should say "Paths found on Wikipedia just now." With Lockdown Mode or a content blocker it should quietly switch to "Paths from the notebook's own pages."
2. **Offline.** Airplane mode, then start a trail: four choices still appear (from the pool), and the trail reaches its END.
3. **save as image.** On iPhone it should open the share sheet with "Save Image". The PNG should show your paper colour, the handwriting font (not a fallback), the path and the rings.
4. **copy as text.** iOS asks nothing; paste into Notes. The text should hold the arrows, the titles and the revision links.
5. **Long titles on the END page** ("Coat of arms of the Falkland Islands") end in "…" on a phone and never push the page sideways.
6. **Private browsing.** "keep in my notebook" must not crash. With storage unavailable it says "That didn't work here."
7. **Reduced motion.** Everything is shown at once, and the "Looking for paths…" line doesn't pulse.
