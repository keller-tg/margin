import { describe, expect, it } from 'vitest';
import { actionApi, batches, cacheKey } from './wiki';

describe('wiki client', () => {
  it('cache key ignores maxlag and parameter order', () => {
    expect(cacheKey(new URL('https://en.wikipedia.org/w/api.php?b=2&a=1&maxlag=5'))).toBe(cacheKey(new URL('https://en.wikipedia.org/w/api.php?a=1&b=2')));
  });
  it('batches at most 50 titles', () => {
    expect(batches(Array.from({ length: 120 }, (_, i) => i)).map((b) => b.length)).toEqual([50, 50, 20]);
  });
  it('refuses live network calls under tests', async () => {
    await expect(actionApi('en', { titles: 'A page that is surely not cached ' + Math.random() })).rejects.toThrow(/live network call attempted under tests/);
  });
});
