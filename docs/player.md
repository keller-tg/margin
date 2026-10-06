# The player (milestone c)

```
npm run images:build   # once per new batch: Commons → public/img/ (AVIF + WebP, credits in manifest.json)
npm run dev            # http://localhost:5173 → Begin
npm run shots          # landing/specimen screenshots
npx playwright test e2e/player.spec.ts   # player + pace screenshots → e2e/__shots__/player-*.png, pace-*.png
```

## Routes

- `/begin` opens today's open slot: the evening once it has opened, otherwise the morning. On the first visit it asks for a pace first.
- `/pace` is the calibration page. It shows the three paces with the fullest page of today's morning at each pace, plus one tick per page. The paces have equal status, no recommendation and no minutes.
- `/read/:lang/:date/:slot` plays one day's thing. `?pace=easy|medium|deep` sets the pace (used by the screenshots and for shareable links).

## Reading

- **Turning pages.** Tap or click the right two-thirds of a page, press → / Space / Enter / PageDown, or swipe left. Back works the same way with the left third, ← / PageUp, or a swipe right. Escape closes the notebook. While the pen is writing, the first tap finishes the writing and the next one turns the page.
- **Pace switch.** The title page has a pace switch. Changing the pace keeps the relative position (page 3 of 7 becomes page 2 of 4).
- **Last page.** "Next" closes the notebook. The END page comes in milestone (d).
- **Interim pages.** Big number, timeline, map, compare and closing pages are written as plain lines until milestone (d), so every day is readable from start to end.

## Pen-writing reveal (`src/player/writing.ts`)

- **Text in the DOM.** The text is real DOM from the first frame, so screen readers, find-in-page and copy work at once. Only its painting is clipped.
- **Line by line.** Each `[data-write]` block is uncovered line by line. The lines are measured with `Range.getClientRects()`, and the clip polygon follows a pen edge that moves at about 540 px/s with slight easing. Finished lines keep their descenders. A small nib dot rides the edge.
- **Photos.** A page's photo is "glued in" (a short fade and settle) once the writing is done.
- **Going back.** Pages already written stay written when you return to them.

## Page turn (`src/player/turn.ts`)

- **Forward.** The current sheet peels away from its right edge along a slightly slanted fold, with the top corner leading, over about 560 ms. A soft shadow travels on the fold, and the next sheet lies underneath, still blank until the pen writes on it.
- **Back.** The previous sheet is laid down again, the same motion in reverse.
- **Performance.** Only `clip-path`, `transform` and `opacity` are animated.

## Reduced motion

`prefers-reduced-motion` or the motion setting `off` switches every animation off:
- **No writing animation.** All text is shown at once.
- **No peel.** The writing on the page fades out, the identical sheets swap invisibly, and the new writing fades in, 200 ms in all. The rules never move, and two pages of text are never on screen together.

## Images

`scripts/images/build-images.ts`, see also `docs/licenses.md`:
- **Source.** Each image in `content/images/used.json` is downloaded once, from upload.wikimedia.org's `/thumb/` path at a standard width (1280), or as the original if that is 1280 px wide or less. **`thumb.wikimedia.org`, where the API's thumbnail URLs point, is blocked by this environment's egress policy. upload.wikimedia.org serves the same files.**
- **Output.** sharp re-encodes them to AVIF and WebP at 480/960/1280 px (never upscaled, EXIF-rotated, metadata stripped) into `public/img/{sha1-prefix}/`, with `manifest.json` holding sizes, a placeholder colour and the credit.
- **Standard widths only.** Thumbnails are requested only at Wikimedia's standard widths (20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840; see mediawiki.org "Common thumbnail sizes"). Direct requests for other widths are rejected. The layout needs at most 1280 px (a 34 rem photo at 2× density), so the build asks for 1280. For an original that is narrower, it asks for the largest standard width below the original (TIFF), or for the original itself (JPEG/PNG ≤ 1280 px, no resize). An audit on 2026-10-06 over all 146 images found 94 thumbnails at 1280, one at 500 and 51 originals, with **no non-standard width**. So the throttling below is not caused by thumbnail sizes.
- **Rate limits.** From the shared cloud IP, upload.wikimedia.org answers with 429 and `Retry-After` of up to 600 s. The build honours it, works earliest days first, keeps the downloaded bytes in `.cache/images/`, and writes the manifest after every image, so it can be stopped and resumed at any time. While images are missing, the player shows a paper-coloured print with the credit instead of the photo.
- **Not committed.** Binaries are build output and are never committed (decision: images stay out of `main`). The deploy milestone (h) runs this step in CI with a cache.

## What to check on Safari / iPhone

Only Chromium is available in the build environment, so these are unverified:
1. **The pen reveal.** `clip-path: polygon()` set per animation frame, and `Range.getClientRects()` line boxes. The handwriting must sit on the rules, with descenders (g, p, y) intact while writing.
2. **The page turn.** Web Animations on `clip-path` (Safari ≥ 16), and a swipe left/right on the page without scrolling sideways (`touch-action: pan-y`).
3. **AVIF.** Safari ≥ 16.4 picks the AVIF source, older versions the WebP. Photos should look sharp, not doubled or stretched.
4. **`100dvh` and `round()`.** The page footer sits on the bottom rules with the URL bar shown and hidden (Safari ≥ 15.4 for `dvh`; `round()` needs Safari ≥ 15.4, otherwise the fallback leaves an uneven bottom gap).
5. **Reduced motion.** Settings → Accessibility → Motion → Reduce Motion: no writing animation, and the 200 ms fade between pages.
6. **Tap targets.** The ← → buttons and the pace switch are reachable with a thumb, and a tap on a credit link opens Commons without turning the page.
7. **Backdrop and blend.** The paper grain uses `mix-blend-mode`, and the tape a semi-transparent fill. Both should look the same as in Chrome.
