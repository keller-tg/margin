// Milestone (d) screenshots: big number, timeline, map, compare, closing, margin note, END — at 390 + 1440,
// light + dark, plus mid-drawing frames and the reduced-motion path. Shots land in e2e/__shots__/d-*.png.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 180_000 });

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;
const SCHEMES = ['light', 'dark'] as const;

// HANDMADE fixture for the compare page (no real day in the current batch qualifies; see docs/player.md)
const compareThing = readFileSync('e2e/fixtures/compare-thing.handmade.json', 'utf8');

async function setup(page: Page, scheme: 'light' | 'dark', reduced = false) {
  await page.addInitScript(() => {
    localStorage.setItem('margin.prefs.v1', JSON.stringify({ lang: 'en', theme: 'system', ink: 'graphite', paper: 'lined', hand: 'caveat', motion: 'system', pace: 'deep', paceChosen: true }));
  });
  await page.route('**/daily/en/2099-01-01.morning.json', (r) => r.fulfill({ contentType: 'application/json', body: compareThing }));
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.clock.setFixedTime(new Date(2026, 9, 8, 10, 0)); // 8 Oct, 10:00: the morning is open, the evening not yet
}
const settled = async (page: Page) => {
  await page.waitForFunction(() => !document.querySelector('[data-writing]') && !document.querySelector('.leaf[data-moving]'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500); // the map's move closer, the photo's glue-in
};

const SHOTS = [
  { name: 'bignumber', url: '/read/en/2026-10-08/morning?pace=deep&page=4' },
  { name: 'timeline', url: '/read/en/2026-10-08/morning?pace=deep&page=5' },
  { name: 'map', url: '/read/en/2026-10-08/morning?pace=deep&page=6' },
  { name: 'compare', url: '/read/en/2099-01-01/morning?pace=deep&page=4' },
  { name: 'closing', url: '/read/en/2026-10-08/morning?pace=deep&page=12' },
  { name: 'end-morning', url: '/read/en/2026-10-08/morning?pace=deep&page=13' },
  { name: 'note', url: '/read/en/2026-10-06/evening?pace=easy&page=3' },
  { name: 'end-evening', url: '/read/en/2026-10-06/evening?pace=easy&page=4' },
] as const;

for (const vp of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    test(`pages (d) ${vp.name} ${scheme}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setup(page, scheme);
      for (const s of SHOTS) {
        await page.goto(s.url);
        await expect(page.locator('.leaf')).toHaveCount(1);
        if (s.name === 'map' && vp.name === 'desktop' && scheme === 'light') {
          await page.waitForTimeout(500);
          await page.screenshot({ path: 'e2e/__shots__/d-map-drawing-desktop-light.png' });
        }
        await settled(page);
        await page.screenshot({ path: `e2e/__shots__/d-${s.name}-${vp.name}-${scheme}.png`, fullPage: true });
      }
      expect(errors).toEqual([]);
    });
  }
}

test('margin note is kept on this device', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 'light', true);
  await page.goto('/read/en/2026-10-06/evening?pace=easy&page=3');
  await page.getByRole('textbox').fill('Eels can make electricity.');
  await page.getByRole('button', { name: 'keep it' }).click();
  await expect(page.locator('.page--end')).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem('margin.notes.v1'));
  expect(JSON.parse(saved!)['en:2026-10-06:evening'].text).toBe('Eels can make electricity.');
  await page.goto('/read/en/2026-10-06/evening?pace=easy&page=3');
  await expect(page.getByRole('textbox')).toHaveValue('Eels can make electricity.');
});

test('reduced motion: drawn pages are static and complete at once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 'light', true);
  await page.goto('/read/en/2026-10-08/morning?pace=deep&page=6');
  await expect(page.locator('.map-svg')).toBeVisible();
  expect(await page.locator('[data-writing], .leaf[data-unwritten]').count()).toBe(0);
  // the map is shown at its close view straight away
  const vb = await page.locator('.map-svg').getAttribute('viewBox');
  const thing = await (await page.request.get('/daily/en/2026-10-08.morning.json')).json();
  expect(vb).toBe(thing.maps.m1.zoomBox);
  await page.screenshot({ path: 'e2e/__shots__/d-map-reduced-mobile-light.png', fullPage: true });
});

test('every page of a deep morning reads to the END page and closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 'light', true);
  await page.goto('/read/en/2026-10-08/morning?pace=deep');
  await expect(page.locator('.leaf')).toHaveCount(1);
  for (let n = 2; n <= 13; n++) {
    await page.keyboard.press('ArrowRight');
    // a press during a turn is ignored, so wait for each turn to land on the next page
    await expect(page.getByRole('region', { name: `Page ${n} of 13` })).toBeVisible();
    await expect(page.locator('.leaf')).toHaveCount(1);
  }
  await expect(page.locator('.page--end')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/$/);
});
