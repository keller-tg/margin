// A finished trail as plain text (copy) and as a picture drawn on a canvas (save). Both run entirely in
// the browser: no library, no upload, nothing leaves the device unless the reader shares it.
import { articleUrl, oneLine } from '../core/trail/trail';
import { normalizeTypography, type Lang } from '../core/typography/typography';
import { sketchEllipse, sketchPath } from '../ink/sketch';

export type Stop = { title: string; description: string; revid: number };

export function trailText(o: { lang: Lang; heading: string; date: string; from: Stop; stops: Stop[]; credit: string }): string {
  const n = (s: string) => normalizeTypography(s, o.lang);
  const lines = [`${o.heading} · ${o.date}`, '', n(o.from.title)];
  for (const s of o.stops) lines.push(`→ ${n(s.title)}${s.description ? ` (${n(oneLine(s.description))})` : ''}`);
  lines.push('', o.credit);
  for (const s of [o.from, ...o.stops]) lines.push(`${n(s.title)}: ${articleUrl(o.lang, s.title, s.revid || undefined)}`);
  return lines.join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older Safari / insecure context: the select-and-copy fallback
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const W = 1080;
const H = 1350;

/** The trail on a sheet of the reader's own paper, in their ink and hand. */
export async function trailImage(o: { lang: Lang; heading: string; date: string; from: Stop; stops: Stop[]; credit: string; seed: number }): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const paper = v('--paper', '#f7f2e8');
  const rule = v('--rule-color', '#d9d4cb');
  const margin = v('--margin-color', '#c8553d');
  const ink = v('--ink', '#2b2a28');
  const soft = v('--ink-soft', '#6b665f');
  const hand = v('--hand', 'Caveat, cursive');
  const sans = v('--sans', 'system-ui, sans-serif');
  await Promise.all([document.fonts.load(`600 64px ${hand}`), document.fonts.load(`28px ${sans}`)]).catch(() => undefined);

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('no canvas');
  const n = (s: string) => normalizeTypography(s, o.lang);

  // paper, rules, margin line
  g.fillStyle = paper;
  g.fillRect(0, 0, W, H);
  const step = 60;
  g.fillStyle = rule;
  for (let y = 150; y < H; y += step) g.fillRect(0, y, W, 2);
  g.fillStyle = margin;
  g.globalAlpha = 0.8;
  g.fillRect(118, 0, 2.5, H);
  g.globalAlpha = 1;

  // heading
  g.fillStyle = ink;
  g.font = `600 72px ${hand}`;
  g.textBaseline = 'alphabetic';
  g.fillText(o.heading, 160, 140);
  g.fillStyle = soft;
  g.font = `34px ${hand}`;
  g.fillText(o.date, 160, 200);

  // the path and its stops
  const all = [o.from, ...o.stops];
  const top = 330;
  const gap = (H - top - 200) / (all.length - 1);
  const pts = all.map((_, i) => [196 + (i % 2 ? 36 : 0) + ((o.seed >> i) % 7), top + i * gap] as const);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = soft;
  g.lineWidth = 3;
  g.stroke(new Path2D(sketchPath(pts, o.seed, 40)));
  g.strokeStyle = margin;
  g.lineWidth = 3.5;
  pts.forEach(([x, y], i) => {
    g.fillStyle = paper;
    g.beginPath();
    g.arc(x, y, 13, 0, Math.PI * 2);
    g.fill();
    g.stroke(new Path2D(sketchEllipse(x, y, 15, 13, o.seed + i)));
    if (i === pts.length - 1) g.stroke(new Path2D(sketchEllipse(x, y, 24, 21, o.seed + 99)));
  });

  // titles and one line each
  const fit = (text: string, font: string, max: number) => {
    g.font = font;
    if (g.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  };
  all.forEach((s, i) => {
    const [, y] = pts[i]!;
    g.fillStyle = i === 0 ? soft : ink;
    g.fillText(fit(n(s.title), `600 52px ${hand}`, W - 330), 300, y + 14);
    if (s.description) {
      g.fillStyle = soft;
      g.fillText(fit(n(oneLine(s.description)), `32px ${hand}`, W - 330), 300, y + 58);
    }
  });

  // credit
  g.fillStyle = soft;
  g.font = `24px ${sans}`;
  g.fillText(`Margin · ${o.credit}`, 160, H - 60);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
}

/** Phones get the share sheet (Save Image, Photos…); desktops a plain download. */
export async function saveImage(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' });
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
