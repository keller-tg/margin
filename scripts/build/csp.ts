// The Content Security Policy, added to the built index.html as a <meta> tag (plan decision 12).
// The only foreign hosts the page may talk to are the three Wikipedia editions the Rabbit Trail reads;
// everything else (scripts, styles, fonts, images) comes from Margin's own origin. The one inline script
// (stored preferences applied before first paint) is allowed by its hash. Build only: the dev server
// injects its own inline scripts. Headers that a <meta> cannot carry (frame-ancestors) come with the
// deploy config in milestone (h).
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/** The Wikipedia editions the Rabbit Trail reads (kept equal to src/trail/client.ts TRAIL_HOSTS by a test). */
export const TRAIL_HOSTS = ['en.wikipedia.org', 'de.wikipedia.org', 'fr.wikipedia.org'] as const;

export function contentSecurityPolicy(scriptHashes: readonly string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.map((h) => `'${h}'`).join(' ')}`.trim(),
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${TRAIL_HOSTS.map((h) => `https://${h}`).join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

const sha256 = (s: string) => `sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}`;

export function cspPlugin(): Plugin {
  return {
    name: 'margin-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => sha256(m[1]!));
        const meta = `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(hashes)}" />`;
        return html.replace(/<meta charset="UTF-8" \/>/i, (m) => `${m}\n    ${meta}`);
      },
    },
  };
}
