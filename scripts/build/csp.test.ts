import { describe, expect, it } from 'vitest';
import { TRAIL_HOSTS as CLIENT_HOSTS } from '../../src/trail/client';
import { contentSecurityPolicy, TRAIL_HOSTS } from './csp';

describe('content security policy', () => {
  it('lets the page talk only to its own origin and the three Wikipedia editions', () => {
    const csp = contentSecurityPolicy(['sha256-abc']);
    expect(csp).toContain("connect-src 'self' https://en.wikipedia.org https://de.wikipedia.org https://fr.wikipedia.org;");
    expect(csp).toContain("script-src 'self' 'sha256-abc'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(csp).not.toMatch(/wikimedia|wikidata/); // no images or data from Wikimedia at runtime
  });
  it('allows exactly the hosts the trail client talks to', () => {
    expect([...TRAIL_HOSTS]).toEqual([...CLIENT_HOSTS]);
  });
});
