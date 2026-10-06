// The Content Security Policy of the built site (scripts/build/csp.ts): nothing on the daily pages or the
// trail violates it, and the page cannot talk to any host but its own and the three Wikipedia editions.
import { expect, test } from '@playwright/test';

const BUILT = 'http://localhost:5198';

test('the built site runs under its CSP without violations, and blocks other hosts', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { violations: string[] }).violations = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { violations: string[] }).violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date(2026, 9, 8, 10, 0));
  await page.route(/wikipedia\.org/, (r) => r.abort('internetdisconnected')); // offline trail: the pool
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  for (const path of ['/', '/read/en/2026-10-08/morning?pace=deep&page=6', '/trail/en/2026-10-08']) {
    await page.goto(BUILT + path);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations), path).toEqual([]);
  }
  await expect(page.locator('.trail-option')).toHaveCount(4);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain('connect-src');

  const blocked = await page.evaluate(() => fetch('https://example.org/').then(() => 'reached', () => 'blocked'));
  expect(blocked).toBe('blocked');
  expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations.some((v) => v.startsWith('connect-src')))).toBe(true);
  expect(errors).toEqual([]);
});
