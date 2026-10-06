// The key under which a recorded Action API response is stored for the e2e tests: the request's own
// parameters, sorted, without the transport ones (format, origin, maxlag) that differ between the
// pipeline client and the browser.
const TRANSPORT = new Set(['format', 'formatversion', 'origin', 'maxlag']);

export function fixtureKey(params: Record<string, string | number> | URLSearchParams): string {
  const entries = params instanceof URLSearchParams ? [...params.entries()] : Object.entries(params).map(([k, v]) => [k, String(v)] as const);
  return entries
    .filter(([k]) => !TRANSPORT.has(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}
