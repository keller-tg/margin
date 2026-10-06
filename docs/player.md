# The player (milestones c and d)

```
npm run images:build   # once per new batch: Commons → public/img/ (AVIF + WebP, credits in manifest.json)
npm run dev            # http://localhost:5173 → Begin
npm run shots          # landing/specimen screenshots
npx playwright test e2e/player.spec.ts   # player + pace screenshots → e2e/__shots__/player-*.png, pace-*.png
npx playwright test e2e/pages-d.spec.ts  # the (d) pages, note and END → e2e/__shots__/d-*.png
npm run content:refs   # re-read the compare reference heights from Wikipedia (cached)
```

## Routes

- `/begin` opens today's open slot: the evening once it has opened, otherwise the morning. On the first visit it asks for a pace first.
- `/pace` is the calibration page. It shows the three paces with the fullest page of today's morning at each pace, plus one tick per page. The paces have equal status, no recommendation and no minutes.
- `/read/:lang/:date/:slot` plays one day's thing. `?pace=easy|medium|deep` sets the pace (used by the screenshots and for shareable links). `?page=N` (1-based) opens on page N.

## Reading

- **Turning pages.** Tap or click the right two-thirds of a page, press → / Space / Enter / PageDown, or swipe left. Back works the same way with the left third, ← / PageUp, or a swipe right. Escape closes the notebook. While the pen is writing, the first tap finishes the writing and the next one turns the page.
- **Pace switch.** The title page has a pace switch. Changing the pace keeps the relative position (page 3 of 7 becomes page 2 of 4).
- **App pages.** After the content pages come the app's own pages: on an evening the **margin note**, then on every reading the **END** page. "Next" on END closes the notebook. The page ticks at the bottom count content pages only.

## Page types (milestone d, `src/player/pages.tsx`)

Every page is real text in the DOM. Strokes (`[data-draw]` SVG paths) are drawn by the same pen as the writing, via `stroke-dashoffset`, in document order. `data-draw="together"` draws a group's paths in parallel, e.g. a coastline. The sketches come from `src/ink/sketch.ts` and are seeded per page, so a page looks the same every time.

- **Big number.** The number large in ink, a red double underline drawn under it, the source sentence under that.
- **Timeline.** A drawn line with a red dot per event. Each event shows the year in red and its sentence in ink.
- **Map.** A coastline sketch with a red ring round the place. With motion it starts wide and moves closer (1.3 s) once drawn; with reduced motion it is the close view straight away. Projected at bake time (`scripts/content/lib/map.ts`): d3-geo azimuthal equal-area, centred on the place, from the Natural Earth 1:50m land mesh (world-atlas). **Coastlines only, no borders**, so no disputed border is ever drawn. The close view is used only if it still contains coastline (open ocean otherwise). There are about 16 KB of paths per map, and only things with a map page carry `maps`. Coordinates are used only when Wikidata's globe is Earth. Current batch: 30 of 180 things have a map page.
- **Compare.** Hand-drawn bars for the topic's height next to up to two well-known references (Eiffel Tower, Burj Khalifa, Everest, Great Pyramid). Their heights are taken from each language's own Wikipedia article (`content/refs/`, `npm run content:refs`, and range values like "about 25–30 m" are skipped). The composer is deliberately strict:
  - only the architecture, landscapes and art domains;
  - a height word in the sentence and the topic's own head word;
  - no "highest point / summit / average" style wording;
  - references within a factor of 8.
  
  **The current batch has no qualifying day.** That is the honest result: the earlier false positives (Banff's Mount Forbes, Nauru's highest point, Bulgaria's average altitude) are now regression tests. The screenshots use a clearly marked handmade fixture (`e2e/fixtures/compare-thing.handmade.json`, date 2099-01-01, never shipped) composed by the real composer.
- **Closing.** The last sentence with a small red flourish under it.

Maps, compare sketches and photos are snapped to a whole number of rules (`src/player/ruleSnap.ts`), so the writing after them lands on the lines again.

## Margin note and END (`src/player/AppPages.tsx`)

- **Margin note (evenings only).** "A line for the margin?": one optional line of up to 90 characters, typed on a red pencil line over the rule. "keep it" saves and turns the page, "not today" just turns it. It is stored only in this browser (`localStorage`, `margin.notes.v1`, keyed `lang:date:slot`). Clearing the line and keeping it deletes the note. The Notebook (milestone f) will list the notes.
- **END.** "That was this morning." / "That was today." with a flourish, then when the next page opens (the evening at 17:00, the next morning at 05:00, in the reader's locale). On a morning whose evening is already open it links straight to the evening. "close the notebook" goes home.

## Pen-writing reveal (`src/player/writing.ts`)

- **Text in the DOM.** The text is real DOM from the first frame, so screen readers, find-in-page and copy work at once. Only its painting is clipped.
- **Line by line.** Each `[data-write]` block is uncovered line by line. The lines are measured once with `Range.getClientRects()`, and a pen edge moves along each line at about 540 px/s with slight easing. Finished lines keep their descenders. A small nib dot rides the edge.
- **How the wipe runs (since the Safari fix).** While the pen writes, the real element stays hidden behind a static clip, and an `aria-hidden` copy of each line is wiped in. The line's strip (`overflow: hidden`) slides right while the copy inside slides left by the same amount, so the words stand still and only the strip's edge moves. Each strip spans the band from just below the previous line's descenders to below its own (`lineBands`), so descenders are never cut.
  - Strips, copies, strokes (`stroke-dashoffset`) and the nib all run as Web Animations on one timeline, with **no JavaScript per frame**. Strips, copies and nib animate `transform`/`opacity` only.
  - The copies are plain `<div>`s with the element's computed text styles, so they never match a content selector.
  - When the page is written, the layer is removed and the real text is unclipped in the same frame.
- **Photos.** A page's photo is "glued in" (a short fade and settle) once the writing is done.
- **Going back.** Pages already written stay written when you return to them.

## Page turn (`src/player/turn.ts`)

- **Forward.** The current sheet peels away from its right edge along a slightly slanted fold, with the top corner leading, over about 560 ms. A soft shadow travels on the fold, and the next sheet lies underneath, still blank until the pen writes on it.
- **Back.** The previous sheet is laid down again, the same motion in reverse.
- **Performance.** Only `transform` and `opacity` are animated. The fold is a box (`.leaf-fold`, 10% wider than the page on the left, so its slant never cuts the page) that is skewed and slides left, clipping the sheet. The sheet inside gets the exact inverse transform about the same origin, so the page stands still while the fold's edge sweeps across it.
- **Duration** comes from `--dur-turn`, read with `cssTimeMs()`. The production CSS minifier turns `560ms` into `.56s`, and the old `parseFloat` read that as 0.56 ms, so built turns jumped instead of turning.

## Reduced motion

`prefers-reduced-motion` or the motion setting `off` switches every animation off:
- **No writing animation.** All text and all strokes (underlines, timeline, coastlines, bars, flourishes) are shown at once.
- **No map move.** The map is shown at its close view straight away.
- **No peel.** The writing on the page fades out, the identical sheets swap invisibly, and the new writing fades in, 200 ms in all. The rules never move, and two pages of text are never on screen together.

## Images

`scripts/images/build-images.ts`, see also `docs/licenses.md`:
- **Source.** Each image in `content/images/used.json` is downloaded once, from upload.wikimedia.org's `/thumb/` path at a standard width (1280), or as the original if that is 1280 px wide or less. **`thumb.wikimedia.org`, where the API's thumbnail URLs point, is blocked by this environment's egress policy. upload.wikimedia.org serves the same files.**
- **Output.** sharp re-encodes them to AVIF and WebP at 480/960/1280 px (never upscaled, EXIF-rotated, metadata stripped) into `public/img/{sha1-prefix}/`, with `manifest.json` holding sizes, a placeholder colour and the credit.
- **AVIF is AV1 Main profile, 4:2:0.** That is the AVIF *baseline* profile, the one Apple's decoder targets. sharp's default (4:4:4, AV1 High profile) is outside it. Manifest entries carry `encoding: 2`, and older entries are re-encoded from the cached download (`npm run images:build -- --cached-only` re-encodes without any network). The 46 encoded images went from 8.02 MB to 7.77 MB of AVIF (−3%). WebP is unchanged at 11.67 MB.
- **Decode fallback.** `<picture>` never falls back to the next `<source>` when the chosen file fails to decode. If the `<img>` reports an error on an AVIF, `Photo` re-renders the picture without the AVIF source, and the browser picks WebP. This is tested in `e2e/safari.spec.ts` with a deliberately broken AVIF.
- **Standard widths only.** Thumbnails are requested only at Wikimedia's standard widths (20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840; see mediawiki.org "Common thumbnail sizes"). Direct requests for other widths are rejected. The layout needs at most 1280 px (a 34 rem photo at 2× density), so the build asks for 1280. For an original that is narrower, it asks for the largest standard width below the original (TIFF), or for the original itself (JPEG/PNG ≤ 1280 px, no resize). An audit on 2026-10-06 over all 146 images found 94 thumbnails at 1280, one at 500 and 51 originals, with **no non-standard width**. So the throttling below is not caused by thumbnail sizes.
- **Rate limits.** From the shared cloud IP, upload.wikimedia.org answers with 429 and `Retry-After` of up to 600 s. The build honours it, works earliest days first, keeps the downloaded bytes in `.cache/images/`, and writes the manifest after every image, so it can be stopped and resumed at any time. While images are missing, the player shows a paper-coloured print with the credit instead of the photo.
- **Not committed.** Binaries are build output and are never committed (decision: images stay out of `main`). The deploy milestone (h) runs this step in CI with a cache.

## Safari / iPhone notes (2026-10-06)

Investigated with **WebKitGTK 2.52** (WebKitWebDriver + MiniBrowser on Xvfb). It has the same engine as Safari (WebCore, JavaScriptCore, CSS), but a different graphics backend and no AVIF decoder. Playwright's own WebKit build couldn't be downloaded here because the environment's network policy blocks its CDN, and there is no Xcode or iOS Simulator on Linux.

Work per frame was measured with Chromium (CPU throttled 4×, DevTools trace: paints, layouts, render time; `npm run perf:frames`). Frame times alone were 60 fps on this fast x86 machine either way, so they can't stand in for an iPhone.

- **Photos on the first page.** Each reading has exactly one photo, on its title page. Two causes:
  1. **Photos are build output.** `public/img/` is gitignored. A fresh clone shows the paper-coloured placeholder everywhere until `npm run images:build` runs on that machine.
  2. **The AVIF files were outside the baseline profile** (4:4:4, AV1 High). Safari picks the AVIF `<source>`, and a failed decode has no fallback.

  In WebKitGTK the photo is requested (200, `image/webp`; this build skips AVIF), decoded, laid out (246 × 318 px) and painted inside its tilted, taped print. The markup, lazy loading, transform and overflow are all fine.
- **Choppy text animations.** Dev mode doesn't explain it: dev and production costs were identical. The causes were:
  - The pen reveal rewrote a `clip-path` polygon from JavaScript every frame and read layout right after (forced layout each frame). WebKit can't composite clip-path, so the text and the multiply-blended paper grain under it were repainted every frame: about 168 paints and about 220–260 ms of render work in a 1.9 s reveal.
  - The page turn animated `clip-path` on the whole full-page leaf: about 75 paints in 39 frames.
  - After the fix: **reveal 9 paints and ~70–96 ms**, **turn 8 paints and ~63–77 ms**, same frame budget.
- **Production page turns were instant** (the `ms`→`s` minification above). Fixed.
- **Not changed:** the reduced-motion dip; the map's move closer (a 1.3 s `viewBox` animation after the writing, one small SVG); one frame of React work as a turn starts (the next page mounts; about 50 ms at 4× throttle, as before).
- **Side finding, not changed:** the `<img src>` default (960 px WebP) is fetched as well as the `<source>` the browser picks, because React sets `src` before the `<img>` is inside its `<picture>`. That's about 140 KB extra per photo. A candidate for the polish pass.

## What to check on Safari / iPhone

Only Chromium is available in the build environment, so these are unverified:
1. **The pen reveal.** Line strips moved by `transform` (Web Animations). The handwriting must sit on the rules, with descenders (g, p, y) intact while writing. The edge should glide smoothly, with no flicker when the page finishes and the real text takes over from the copies.
2. **The page turn.** A skewed fold box plus the inverse transform on the sheet, transforms only. The words must not wobble or shear while the fold sweeps. A swipe left/right on the page must not scroll sideways (`touch-action: pan-y`).
3. **AVIF.** Safari ≥ 16.4 picks the AVIF source (now 4:2:0, baseline), older versions the WebP. If an AVIF ever fails to decode, the photo re-selects WebP. Photos should look sharp, not doubled or stretched.
4. **`100dvh` and `round()`.** The page footer sits on the bottom rules with the URL bar shown and hidden (Safari ≥ 15.4 for `dvh`; `round()` needs Safari ≥ 15.4, otherwise the fallback leaves an uneven bottom gap).
5. **Reduced motion.** Settings → Accessibility → Motion → Reduce Motion: no writing animation, and the 200 ms fade between pages.
6. **Tap targets.** The ← → buttons and the pace switch are reachable with a thumb, and a tap on a credit link opens Commons without turning the page.
7. **Backdrop and blend.** The paper grain uses `mix-blend-mode`, and the tape a semi-transparent fill. Both should look the same as in Chrome.
8. **Drawn strokes (d).** `stroke-dashoffset` with `vector-effect: non-scaling-stroke` on the underline, timeline and coastlines. Lines should draw smoothly and end fully drawn, with no dashed remains. Also the map's `viewBox` move closer, which is set per frame.
9. **Margin note keyboard (d).** Tapping the line on an evening's last page should open the keyboard without zooming the page (the input is ≥ 16 px). "done" on the keyboard should keep the note, and the red line should sit on the rule while typing.
10. **Private browsing (d).** In a private tab, keeping a note must not crash (storage is guarded); the note simply isn't kept.
