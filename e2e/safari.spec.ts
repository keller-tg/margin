// Safari findings (docs/player.md "Safari / iPhone notes"). Chromium stands in for the browser here; the
// cases reproduce what Safari does differently, so the fixes stay fixed.
import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const HAVE_PHOTOS = existsSync('public/img/manifest.json'); // build output (npm run images:build), not in git

test('a photo whose AVIF cannot be decoded falls back to WebP (<picture> alone never does)', async ({ page }) => {
  test.skip(!HAVE_PHOTOS, 'no photos built (npm run images:build)');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // what Safari meets with an AVIF outside the baseline profile: the browser picked AVIF, the decode fails
  await page.route('**/*.avif', (r) => r.fulfill({ contentType: 'image/avif', body: Buffer.from('not an avif image') }));
  await page.goto('/read/en/2026-10-06/morning?pace=medium');
  const img = page.locator('.photo img');
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.currentSrc)).toMatch(/\.webp$/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.photo source[type="image/avif"]')).toHaveCount(0);
});

test('photos are AV1 Main profile 4:2:0 (the AVIF baseline Safari decodes)', async () => {
  test.skip(!HAVE_PHOTOS, 'no photos built (npm run images:build)');
  const { readdirSync, readFileSync } = await import('node:fs');
  for (const dir of readdirSync('public/img').filter((d) => !d.endsWith('.json'))) {
    for (const f of readdirSync(`public/img/${dir}`).filter((x) => x.endsWith('.avif'))) {
      const b = readFileSync(`public/img/${dir}/${f}`);
      const c = b.subarray(b.indexOf(Buffer.from('av1C')) + 4);
      expect(c[1]! >> 5, `${dir}/${f} seq_profile`).toBe(0); // Main
      expect([(c[2]! >> 3) & 1, (c[2]! >> 2) & 1], `${dir}/${f} chroma`).toEqual([1, 1]); // 4:2:0
    }
  }
});
