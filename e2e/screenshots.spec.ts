// Screenshot matrix for visual review: mobile (390) + desktop (1440), light + dark.
// Not a pixel-diff test — the shots land in e2e/__shots__/ to be looked at.
import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;
const SCHEMES = ['light', 'dark'] as const;
const PAGES = [
  { name: 'landing', path: '/' },
  { name: 'specimen', path: '/specimen' },
  { name: 'not-yet', path: '/begin' },
] as const;

for (const vp of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    for (const p of PAGES) {
      test(`${p.name} ${vp.name} ${scheme}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({ colorScheme: scheme });
        // Fixed clock (10:00) so the landing shows the morning open and the evening closed.
        await page.clock.setFixedTime(new Date(2026, 9, 6, 10, 0));
        await page.goto(p.path);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('main')).toBeVisible();
        await page.screenshot({ path: `e2e/__shots__/${p.name}-${vp.name}-${scheme}.png`, fullPage: true });
      });
    }
  }
}

// Paper and handwriting variants of the specimen, to check rule/grid/dot alignment.
const VARIANTS = [
  { paper: 'grid', hand: 'caveat' },
  { paper: 'dotted', hand: 'playpen' },
  { paper: 'lined', hand: 'playpen' },
] as const;
for (const v of VARIANTS) {
  test(`specimen ${v.paper} ${v.hand}`, async ({ page }) => {
    await page.addInitScript((prefs) => localStorage.setItem('margin.prefs.v1', JSON.stringify(prefs)), {
      lang: 'en', theme: 'system', ink: 'blueblack', paper: v.paper, hand: v.hand, motion: 'system',
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/specimen');
    await expect(page.locator('main h1')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `e2e/__shots__/specimen-${v.paper}-${v.hand}.png`, fullPage: true });
  });
}
