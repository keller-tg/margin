# margin

*Learn one real thing. Then close the notebook.*

Margin is a calm notebook that fills itself twice a day: one real thing in the morning, one small thing in the evening. Then it ends. It has no feed, no streaks, no notifications and no tracking. The content is adapted from Wikipedia (CC BY-SA). The site makes no AI calls and holds no API keys.

**What talks to whom.** The daily pages (text, photos, maps) are served entirely from Margin's own origin, so reading them sends nothing to Wikipedia or anyone else. **The Rabbit Trail is different:** when you start one, *your browser* asks Wikipedia (en/de/fr.wikipedia.org) directly for the next stops, so Wikipedia sees your IP address and those requests, under the [Wikimedia privacy policy](https://foundation.wikimedia.org/wiki/Policy:Privacy_policy). Those requests are anonymous (no cookies) and text-only (no images). The Content Security Policy allows no other host. Without a connection, the trail uses pages baked into the site instead.

> **Status:** early development. Milestone (a) is done: paper, ink, fonts, theme, i18n and the wordmark. Milestone (b) is done: the content pipeline (pool, picker, fetcher with a committed cache, image licensing, extractive composer, verifier). See [`docs/content-pipeline.md`](docs/content-pipeline.md). Milestone (c) is done: the image step, the pace calibration page and the player (title, sentence and image pages, pen-writing reveal, page turn). Milestone (d) is done: big number, timeline, map, compare and closing pages, the margin note and the END page. See [`docs/player.md`](docs/player.md). Milestone (e) is done: the Rabbit Trail. See [`docs/trail.md`](docs/trail.md). See [`docs/plan.md`](docs/plan.md) for the full plan and the decisions behind it.

## Develop

```sh
npm install
npm run dev          # http://localhost:5173  (dev-only type specimen at /specimen)
npm test             # unit tests (Vitest)
npm run build        # typecheck + static build to dist/
npm run shots        # Playwright screenshot matrix → e2e/__shots__/ (390/1440 × light/dark)
npm run fonts:build  # re-subset fonts, regenerate metrics + wordmark outlines (outputs are committed)
npm run fonts:check  # assert every DE/FR glyph is drawn by our fonts, not a fallback
npm run content:bake # compose + verify the daily things from the committed queue and packets (no network)
npm run images:build # download the used Commons images once, encode AVIF/WebP to public/img/ (build output, not committed)
npm run content:trail # bake the Rabbit Trail's offline pools to public/trail/ (cached API, polite)
```

## How the paper works

Text sits *on* the ruled lines, not between them. Each font's real vertical metrics (`src/theme/font-metrics.json`) feed a small formula. For a line box of height L and font size S, the baseline sits at `L/2 + (ascent − descent)·S/2`. That formula positions both the rules and every block of handwriting. `src/theme/baseline.ts` documents it, and the CSS in `src/theme/tokens.css` and `src/paper/paper.css` mirrors it. A test keeps the CSS and the font files in sync.

## Before launch

The owner must check whether the name **"Margin"**, its domain and its trademark are available.

## Licenses

The code is MIT. Adapted Wikipedia content (`content/`, `public/daily/`, `public/trail/`) is CC BY-SA 4.0 (`LICENSE-CONTENT`). Fonts are SIL OFL 1.1. See [`docs/licenses.md`](docs/licenses.md).
