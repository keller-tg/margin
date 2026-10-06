// Player screenshots for visual review (milestone c): 390 + 1440, light + dark, plus reduced motion.
// Shots land in e2e/__shots__/player-*.png. They also assert the basics: no page errors, real text in
// the DOM from the first frame, pages turn, the reduced-motion path does not animate.
import { expect, test, type Page } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;
const SCHEMES = ['light', 'dark'] as const;
const DAY = '/read/en/2026-10-06/morning?pace=medium';

async function setup(page: Page, opts: { scheme: 'light' | 'dark'; reduced?: boolean; lang?: string }) {
  await page.addInitScript((lang) => {
    localStorage.setItem('margin.prefs.v1', JSON.stringify({ lang, theme: 'system', ink: 'graphite', paper: 'lined', hand: 'caveat', motion: 'system', pace: 'medium', paceChosen: true }));
  }, opts.lang ?? 'en');
  await page.emulateMedia({ colorScheme: opts.scheme, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  await page.clock.setFixedTime(new Date(2026, 9, 6, 10, 0));
}
const settled = async (page: Page) => {
  await page.waitForFunction(() => !document.querySelector('[data-writing]') && !document.querySelector('.leaf[data-moving]'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.waitForTimeout(650); // the photo's glue-in fade
};

for (const vp of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    test(`player ${vp.name} ${scheme}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setup(page, { scheme });
      await page.goto(DAY);
      // the title is in the DOM (and accessible) before the pen has written it
      await expect(page.locator('h1.ink--title')).toHaveText('Caspar David Friedrich');
      await page.waitForTimeout(700);
      await page.screenshot({ path: `e2e/__shots__/player-writing-${vp.name}-${scheme}.png` });
      await settled(page);
      await page.screenshot({ path: `e2e/__shots__/player-1-title-${vp.name}-${scheme}.png`, fullPage: true });

      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(260);
      await page.screenshot({ path: `e2e/__shots__/player-turning-${vp.name}-${scheme}.png` });
      await settled(page);
      await page.screenshot({ path: `e2e/__shots__/player-2-sentence-${vp.name}-${scheme}.png`, fullPage: true });

      await page.keyboard.press('ArrowRight');
      await settled(page);
      await page.screenshot({ path: `e2e/__shots__/player-3-image-${vp.name}-${scheme}.png`, fullPage: true });
      await expect(page.locator('.leaf')).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  }
}

test('player reduced motion: no writing, crossfade only', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, { scheme: 'light', reduced: true });
  await page.goto(DAY);
  await expect(page.locator('h1.ink--title')).toBeVisible();
  expect(await page.locator('[data-writing], .leaf[data-unwritten]').count()).toBe(0);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'e2e/__shots__/player-reduced-crossfade-mobile-light.png' });
  await settled(page);
  await expect(page.locator('.leaf')).toHaveCount(1);
});

test('pace calibration', async ({ page }) => {
  for (const vp of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setup(page, { scheme });
      await page.goto('/pace');
      await expect(page.locator('.pace-sample').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `e2e/__shots__/pace-${vp.name}-${scheme}.png`, fullPage: true });
    }
  }
});

test('german and french days render', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [lang, path] of [['de', '/read/de/2026-10-06/evening?pace=easy'], ['fr', '/read/fr/2026-10-06/morning?pace=deep']] as const) {
    await setup(page, { scheme: 'light', reduced: true, lang });
    await page.goto(path);
    await settled(page);
    await page.screenshot({ path: `e2e/__shots__/player-${lang}-mobile-light.png`, fullPage: true });
  }
});
