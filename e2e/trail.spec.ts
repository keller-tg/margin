// Milestone (e): the Rabbit Trail. No live API calls: Wikipedia is either blocked (→ the pre-baked pool,
// real content baked from the committed cache) or answered from a RECORDED fixture of real responses
// (e2e/fixtures/trail-api.recorded.*.json, made by scripts/content/trail-fixture.ts from the cache).
import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 180_000 });

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;
const SCHEMES = ['light', 'dark'] as const;

async function setup(page: Page, scheme: 'light' | 'dark', o: { reduced?: boolean; pace?: string } = {}) {
  await page.addInitScript((pace) => {
    localStorage.setItem('margin.prefs.v1', JSON.stringify({ lang: 'en', theme: 'system', ink: 'graphite', paper: 'lined', hand: 'caveat', motion: 'system', pace, paceChosen: true }));
  }, o.pace ?? 'medium');
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: o.reduced ? 'reduce' : 'no-preference' });
  await page.clock.setFixedTime(new Date(2026, 9, 8, 10, 0));
}
const offline = (page: Page) => page.route(/wikipedia\.org/, (r) => r.abort('internetdisconnected'));
const settled = async (page: Page) => {
  await page.waitForFunction(
    () => !document.querySelector('[data-writing], .leaf[data-unwritten], .leaf[data-moving]') && document.querySelectorAll('.leaf').length === 1 && !document.querySelector('.trail-finding'),
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
};

test('offline: the trail runs on the pre-baked pool, five hops, then END', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 'light', { reduced: true });
  await offline(page);
  await page.goto('/trail/en/2026-10-08');
  for (let hop = 0; hop < 5; hop++) {
    const options = page.locator('.trail-option');
    await expect(options).toHaveCount(4);
    await expect(page.getByText('Paths from the notebook’s own pages.')).toBeVisible();
    await options.first().click();
    await expect(page.locator('.page--hop h1')).toBeVisible();
    // read the stop's pages to the next choice (or the END)
    for (let i = 0; i < 6 && (await page.locator('.page--hop').count()); i++) {
      await page.keyboard.press('ArrowRight');
      await settled(page);
    }
  }
  await expect(page.locator('.page--trail-end')).toBeVisible();
  await expect(page.locator('.trail-stop')).toHaveCount(6);
});

/** Read from the current page through to the next choice page (or the END), one landed turn at a time. */
async function readOn(page: Page) {
  await expect(page.locator('.page--hop')).toBeVisible(); // the turn after a choice has landed
  for (let i = 0; i < 6 && (await page.locator('.page--hop').count()); i++) {
    const before = await page.locator('.leaf').first().getAttribute('aria-label');
    await page.keyboard.press('ArrowRight');
    // a press during a turn or the writing is swallowed (it finishes the writing): press again until the page changes
    await expect(async () => {
      const now = await page.locator('.leaf').first().getAttribute('aria-label');
      if (now === before) await page.keyboard.press('ArrowRight');
      expect(now).not.toBe(before);
    }).toPass({ timeout: 15_000, intervals: [400, 800, 1200] });
    await settled(page);
  }
}

for (const vp of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    test(`trail ${vp.name} ${scheme}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setup(page, scheme);
      await offline(page);
      const shot = (name: string) => page.screenshot({ path: `e2e/__shots__/e-${name}-${vp.name}-${scheme}.png`, fullPage: true });
      await page.goto('/trail/en/2026-10-08');
      await settled(page);
      await shot('choose-first');
      await page.locator('.trail-option').nth(1).click();
      await settled(page);
      await shot('hop-first');
      await page.keyboard.press('ArrowRight');
      await settled(page);
      await shot('hop-next');
      await readOn(page);
      for (let hop = 1; hop < 5; hop++) {
        if (hop === 2) await shot('choose-later');
        await page.locator('.trail-option').first().click();
        await settled(page);
        await readOn(page);
      }
      await page.waitForTimeout(800);
      await shot('end');
      expect(errors).toEqual([]);
    });
  }
}

test('looking for paths: the choice page while Wikipedia is still answering', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 'light');
  await page.route(/wikipedia\.org/, () => new Promise(() => undefined)); // never answers (the 6 s timeout is not reached here)
  await page.goto('/trail/en/2026-10-08');
  await expect(page.locator('.trail-finding')).toHaveText('Looking for paths…'); // the real line, not the pen's transient copy
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/__shots__/e-finding-mobile-light.png', fullPage: true });
});

// ---------------------------------------------------------------- live, from a RECORDED fixture

type Recorded = { lang: string; date: string; pace: string; path: { offered: string[]; chose: string }[]; responses: Record<string, unknown> };
const TRANSPORT = new Set(['format', 'formatversion', 'origin', 'maxlag']);
const keyOf = (u: URL) =>
  [...u.searchParams.entries()]
    .filter(([k]) => !TRANSPORT.has(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

async function recordedWikipedia(page: Page, file: string) {
  const rec = JSON.parse(readFileSync(file, 'utf8')) as Recorded;
  const requests: { url: URL; headers: Record<string, string> }[] = [];
  await page.route(/wikipedia\.org/, async (route) => {
    const url = new URL(route.request().url());
    requests.push({ url, headers: route.request().headers() });
    const body = rec.responses[keyOf(url)];
    if (!body) return route.fulfill({ status: 404, body: 'not in the recorded fixture' });
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  return { rec, requests };
}

test('live: a whole trail from Wikipedia (recorded), politely, then END', async ({ page }) => {
  const file = 'e2e/fixtures/trail-api.recorded.en-2026-10-08.json';
  test.skip(!existsSync(file), 'recorded fixture not made yet (npm run content:trail-fixture)');
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 'light', { reduced: true });
  const { rec, requests } = await recordedWikipedia(page, file);
  await page.goto('/trail/en/2026-10-08');
  for (const [hop, step] of rec.path.entries()) {
    await expect(page.locator('.trail-option')).toHaveCount(4);
    await expect(page.getByText('Paths found on Wikipedia just now.')).toBeVisible();
    await expect(page.locator('.trail-opt-title')).toHaveText(step.offered);
    if (hop === 0) await page.screenshot({ path: 'e2e/__shots__/e-live-choose-mobile-light.png', fullPage: true });
    await page.locator('.trail-option', { hasText: step.chose }).first().click();
    await expect(page.locator('.page--hop h1')).toBeVisible();
    await readOn(page);
  }
  await expect(page.locator('.page--trail-end')).toBeVisible();
  await expect(page.locator('.trail-stop-title')).toHaveText(['Falkland Islands', ...rec.path.map((s) => s.chose)]);
  // polite: anonymous CORS, an Api-User-Agent, only the three editions, about three requests a hop
  expect(requests.length).toBeLessThanOrEqual(rec.path.length * 4);
  for (const r of requests) {
    expect(r.url.hostname).toBe('en.wikipedia.org');
    expect(r.url.searchParams.get('origin')).toBe('*');
    expect(r.headers['api-user-agent']).toMatch(/^Margin\//);
  }
  await page.screenshot({ path: 'e2e/__shots__/e-live-end-mobile-light.png', fullPage: true });
});

test('keep, copy and save on the END page', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page, 'light', { reduced: true });
  await offline(page);
  await page.goto('/trail/en/2026-10-08');
  for (let hop = 0; hop < 5; hop++) {
    await page.locator('.trail-option').first().click();
    await readOn(page);
  }
  await page.getByRole('button', { name: 'keep in my notebook' }).click();
  await expect(page.getByText('Kept in your notebook, on this device.')).toBeVisible();
  const kept = JSON.parse((await page.evaluate(() => localStorage.getItem('margin.trails.v1')))!);
  expect(kept['en:2026-10-08'].stops).toHaveLength(5);

  await page.getByRole('button', { name: 'copy as text' }).click();
  await expect(page.getByText('Copied.')).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toMatch(/^Rabbit trail · /);
  expect(text).toContain('Falkland Islands');
  expect(text).toContain('oldid=');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'save as image' }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('margin-trail-en-2026-10-08.png');
  await d.saveAs('e2e/__shots__/e-trail-image-light.png');
});

test('reduced motion: the END page is complete at once, no pen, no path animation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 'dark', { reduced: true });
  await offline(page);
  await page.goto('/trail/en/2026-10-08');
  for (let hop = 0; hop < 5; hop++) {
    await page.locator('.trail-option').first().click();
    await readOn(page);
  }
  expect(await page.locator('[data-writing], .leaf[data-unwritten]').count()).toBe(0);
  await expect(page.locator('.trail-path path')).toBeVisible();
  await page.screenshot({ path: 'e2e/__shots__/e-end-reduced-mobile-dark.png', fullPage: true });
});

test('the morning END page offers the trail', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 'light', { reduced: true });
  await offline(page);
  await page.goto('/read/en/2026-10-08/morning?pace=easy&page=5');
  await page.getByRole('link', { name: 'follow a rabbit trail' }).click();
  await expect(page).toHaveURL(/\/trail\/en\/2026-10-08$/);
  await expect(page.locator('.trail-option')).toHaveCount(4);
});
