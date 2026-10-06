// npm run perf:frames (with ORIGIN=http://127.0.0.1:5173 LABEL=dev): frame times, paints, layouts and render work
// of the pen reveal and a page turn in Chromium with the CPU throttled 4x (a phone-ish budget). Not a test.
import { chromium } from '@playwright/test';
const [origin, label] = [process.env.ORIGIN!, process.env.LABEL!];
const executablePath = '/opt/pw-browsers/chromium';
const stats = (d: number[]) => {
  if (!d.length) return { frames: 0 };
  const s = [...d].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
  const sum = d.reduce((a, b) => a + b, 0);
  return { frames: d.length, fps: +((1000 * d.length) / sum).toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s.at(-1)!.toFixed(1), over33: d.filter((x) => x > 33.4).length };
};
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const out: Record<string, unknown> = {};
for (const run of [0, 1, 2]) {
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('margin.prefs.v1', JSON.stringify({ lang: 'en', theme: 'light', ink: 'graphite', paper: 'lined', hand: 'caveat', motion: 'on', pace: 'deep', paceChosen: true })));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const events: any[] = [];
  cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
  const traced = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReportEvents' });
  await page.goto(origin + '/read/en/2026-10-08/morning?pace=deep');
  const res = (await page.evaluate(`new Promise((done) => {
    const out = { reveal: [], turn: [] };
    let phase = 'wait', last = 0;
    const t0 = performance.now();
    const writing = () => !!document.querySelector('[data-writing]');
    const moving = () => !!document.querySelector('.leaf[data-moving]');
    const tick = (now) => {
      if (last && (phase === 'reveal' || phase === 'turn')) out[phase].push(now - last);
      last = now;
      if (phase === 'wait' && writing()) { phase = 'reveal'; performance.mark('reveal-start'); }
      else if (phase === 'reveal' && !writing()) {
        performance.mark('reveal-end'); phase = 'pause';
        setTimeout(() => { phase = 'turn'; performance.mark('turn-start'); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); }, 500);
      } else if (phase === 'turn' && out.turn.length > 3 && !moving()) { performance.mark('turn-end'); return done(out); }
      if (performance.now() - t0 > 60000) return done(out);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })`)) as Record<string, number[]>;
  await cdp.send('Tracing.end');
  await traced;
  const mark = (n: string) => events.find((e) => e.name === n && e.cat.includes('blink.user_timing'))?.ts;
  const within = (a: string, b: string, names: string[]) => {
    const [s, e] = [mark(a), mark(b)];
    return events.filter((ev) => names.includes(ev.name) && ev.ph !== 'E' && ev.ts >= s && ev.ts <= e);
  };
  const cost = (a: string, b: string) => {
    const paints = within(a, b, ['Paint']).length;
    const layouts = within(a, b, ['Layout']).length;
    const styles = within(a, b, ['UpdateLayoutTree']).length;
    const paintMs = within(a, b, ['Paint', 'RasterTask', 'Layout', 'UpdateLayoutTree', 'PrePaint', 'Layerize']).reduce((x, ev) => x + (ev.dur ?? 0), 0) / 1000;
    return { paints, layouts, styles, renderMs: +paintMs.toFixed(0) };
  };
  out[`run${run}`] = { reveal: { ...stats(res.reveal!), ...cost('reveal-start', 'reveal-end') }, turn: { ...stats(res.turn!), ...cost('turn-start', 'turn-end') } };
  await page.close();
}
console.log(label, JSON.stringify(out));
await browser.close();
