// The pen (plan §11). In document order, every [data-write] element (text) is uncovered line by line by a
// pen edge moving along the line, and every [data-draw] element (an SVG stroke, or a group of strokes drawn
// together) is drawn by its stroke-dashoffset. A small nib dot rides the edge.
//
// Text is real DOM from the first frame (screen readers and find-in-page see it at once). While the pen
// writes, the real element stays hidden behind a static clip and an aria-hidden copy of each of its lines is
// wiped in: the line's strip (overflow hidden) slides right while the copy inside slides left by the same
// amount, so the words stand still and only the strip's edge moves. Both are transforms run by the Web
// Animations API, so the compositor does the work: no JavaScript and no repaint per frame (Safari repainted
// the text, and the blended paper grain under it, on every frame of the old clip-path wipe). Durations
// scale with length, so long lines take longer.

export const WRITE_PX_PER_S = 540; // pen speed along a line of text
const DRAW_PX_PER_S = 900; // pen speed along a drawn stroke
const DRAW_MAX_MS = 1400; // a long stroke (a coastline) is sketched quickly, not traced for seconds
const LINE_PAUSE_MS = 70; // the pen lifts and moves to the next line
const BLOCK_PAUSE_MS = 220; // between paragraphs and drawings
const EASE_SAMPLES = 8; // keyframes per stroke that carry easeStroke (WAAPI easings are cubic only)

type Line = { left: number; right: number; top: number; bottom: number };

// A line's copy is a plain <div> (no tag or class of the real element, so it never matches a selector
// meant for the content) holding clones of the element's children, with the element's computed text
// styles: whatever it inherits from its context (centred labels, a softer colour) and its own.
const TEXT_STYLE = [
  'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-feature-settings', 'font-variation-settings',
  'letter-spacing', 'word-spacing', 'line-height', 'text-align', 'text-transform', 'text-indent', 'white-space', 'overflow-wrap',
  'word-break', 'hyphens', 'direction', 'opacity', 'text-decoration-line', 'text-decoration-color', 'text-decoration-thickness',
  'text-decoration-style', 'text-underline-offset', 'text-overflow', 'overflow', 'padding-left', 'padding-right', 'padding-top',
  'padding-bottom', 'box-sizing', 'text-shadow',
];

/** The visual lines of an element, relative to its own box, from the text's client rects. */
export function measureLines(el: HTMLElement): Line[] {
  const box = el.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
  const lines: Line[] = [];
  for (const r of rects) {
    const top = r.top - box.top;
    const same = lines.find((l) => Math.abs(l.top - top) < r.height / 2);
    if (same) {
      same.left = Math.min(same.left, r.left - box.left);
      same.right = Math.max(same.right, r.right - box.left);
      same.bottom = Math.max(same.bottom, r.bottom - box.top);
    } else lines.push({ left: r.left - box.left, right: r.right - box.left, top, bottom: r.bottom - box.top });
  }
  return lines.sort((a, b) => a.top - b.top);
}

/**
 * The horizontal band each line is wiped in, relative to the element. Bands never overlap, and a finished
 * line keeps its descenders: each band starts just below the previous line's descenders (bottom + pad),
 * not at its own line's top, so the next line's band never cuts them off.
 */
export function lineBands(lines: Line[], pad: number): { top: number; bottom: number }[] {
  return lines.map((l, i) => ({
    top: i === 0 ? Math.min(0, l.top) - pad * 3 : lines[i - 1]!.bottom + pad,
    bottom: l.bottom + pad,
  }));
}

export type Writer = { skip: () => void; done: Promise<void> };

function strokesOf(el: Element): SVGGeometryElement[] {
  if (el instanceof SVGGeometryElement) return [el];
  return [...el.querySelectorAll<SVGGeometryElement>('path, line, polyline, circle, ellipse, rect')];
}

/** Keyframe values along the pen's easing, from a to b. */
function eased(a: number, b: number, fmt: (v: number) => Keyframe): Keyframe[] {
  return Array.from({ length: EASE_SAMPLES + 1 }, (_, i) => {
    const k = i / EASE_SAMPLES;
    return { ...fmt(a + (b - a) * easeStroke(k)), offset: k };
  });
}

/**
 * Write and draw everything inside `root`. `nib` is positioned (absolutely, inside `root`) on the pen's
 * edge while it writes text. Resolves when everything is written or skipped.
 */
export function writePage(root: HTMLElement, nib: HTMLElement | null): Writer {
  const els = [...root.querySelectorAll<HTMLElement | SVGElement>('[data-write], [data-draw]')];
  const rootBox = root.getBoundingClientRect();
  const texts: HTMLElement[] = [];
  const drawn: SVGGeometryElement[] = [];
  const anims: Animation[] = [];
  const nibFrames: { t: number; x: number; y: number; on: boolean }[] = [];
  // the copies live in one layer over the page; it is removed when the writing is done
  const layer = document.createElement('div');
  layer.className = 'pen-layer';
  layer.setAttribute('aria-hidden', 'true');

  // ---- plan: every line and stroke gets its slot on one timeline (all layout is read here, once)
  type Plan = () => void;
  const plans: Plan[] = [];
  let t = 120; // a breath before the pen touches the paper
  for (const el of els) {
    if (el.hasAttribute('data-draw')) {
      const paths = strokesOf(el).map((p) => ({ p, len: Math.max(1, p.getTotalLength()) }));
      if (!paths.length) continue;
      // a group draws its strokes together (a coastline is sketched, not traced); a single stroke takes its length
      const longest = Math.max(...paths.map((x) => x.len));
      const dur = Math.min(DRAW_MAX_MS, Math.max(260, ((el.getAttribute('data-draw') === 'together' ? longest : paths.reduce((a, x) => a + x.len, 0)) / DRAW_PX_PER_S) * 1000));
      const t0 = t;
      plans.push(() => {
        for (const { p, len } of paths) {
          p.style.strokeDasharray = `${len}`;
          drawn.push(p);
          anims.push(p.animate(eased(len, 0, (v) => ({ strokeDashoffset: `${v}` })), { delay: t0, duration: dur, fill: 'both' }));
        }
        (el as SVGElement).style.opacity = '1';
      });
      t += dur + BLOCK_PAUSE_MS / 2;
      continue;
    }
    const h = el as HTMLElement;
    const lines = measureLines(h);
    if (!lines.length) continue;
    const box = h.getBoundingClientRect();
    const width = box.width;
    const pad = parseFloat(getComputedStyle(h).fontSize) * 0.25; // room for ascenders/descenders beyond the font box
    const bands = lineBands(lines, pad);
    const x0 = box.left - rootBox.left;
    const y0 = box.top - rootBox.top;
    const timing = lines.map((l) => {
      const dur = ((l.right - l.left) / WRITE_PX_PER_S) * 1000;
      const slot = { t0: t, dur };
      t += dur + LINE_PAUSE_MS;
      return slot;
    });
    t += BLOCK_PAUSE_MS - LINE_PAUSE_MS;
    lines.forEach((l, i) => {
      const { t0, dur } = timing[i]!;
      nibFrames.push({ t: t0, x: x0 + l.left, y: y0 + l.bottom - pad * 0.55, on: true }, { t: t0 + dur, x: x0 + l.right, y: y0 + l.bottom - pad * 0.55, on: true });
    });
    const cs = getComputedStyle(h);
    const textStyle = TEXT_STYLE.map((k) => `${k}:${cs.getPropertyValue(k)}`).join(';');
    plans.push(() => {
      texts.push(h);
      h.style.clipPath = 'inset(0 0 100% 0)'; // the real text waits, still in the DOM, until the page is written
      const left = -pad; // a strip spans the element's width plus a little room for overhanging strokes
      const W = width + 2 * pad;
      lines.forEach((l, i) => {
        const { t0, dur } = timing[i]!;
        const band = bands[i]!;
        const strip = document.createElement('div');
        strip.className = 'pen-line';
        strip.style.cssText = `left:${x0 + left}px;top:${y0 + band.top}px;width:${W}px;height:${band.bottom - band.top}px`;
        const copy = document.createElement('div');
        copy.append(...[...h.childNodes].map((n) => n.cloneNode(true)));
        for (const n of copy.querySelectorAll('[data-write], [id]')) {
          n.removeAttribute('data-write');
          n.removeAttribute('id');
        }
        copy.style.cssText = `${textStyle};position:absolute;margin:0;left:${-left}px;top:${-band.top}px;width:${width}px`;
        strip.append(copy);
        layer.append(strip);
        // the strip's right edge follows the pen from the line's start to its end, then opens fully
        const edge = (x: number) => x - (left + W); // strip translation that puts its right edge at x
        const kf = eased(l.left, l.right, (x) => ({ transform: `translateX(${edge(x)}px)` }));
        kf[kf.length - 1] = { transform: 'translateX(0px)', offset: 1 };
        const inv = kf.map((f) => ({ ...f, transform: String(f.transform).replace(/translateX\((-?[\d.e-]+)px\)/, (_m, v: string) => `translateX(${-Number(v)}px)`) }));
        const opts: KeyframeAnimationOptions = { delay: t0, duration: dur, fill: 'both' };
        anims.push(strip.animate(kf, opts), copy.animate(inv, opts));
      });
    });
  }

  let finished = false;
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const finish = () => {
    if (finished) return;
    finished = true;
    for (const a of anims) a.cancel();
    for (const el of texts) el.style.clipPath = 'none'; // inline 'none' also beats the [data-unwritten] CSS until React re-renders
    for (const p of drawn) {
      p.style.strokeDasharray = 'none';
      p.style.strokeDashoffset = '0';
    }
    layer.remove();
    if (nib) nib.style.opacity = '0';
    root.removeAttribute('data-writing');
    resolve();
  };
  if (plans.length === 0) {
    finish();
    return { skip: finish, done };
  }

  // ---- go: create the copies and start every animation in the same frame
  root.setAttribute('data-writing', '');
  root.append(layer);
  for (const plan of plans) plan();
  if (nib && nibFrames.length) {
    // the nib rides each line and lifts (hidden) between lines and while strokes are drawn
    const frames: Keyframe[] = [{ opacity: 0, transform: `translate(${nibFrames[0]!.x}px, ${nibFrames[0]!.y}px)`, offset: 0 }];
    for (let i = 0; i < nibFrames.length; i += 2) {
      const a = nibFrames[i]!;
      const b = nibFrames[i + 1]!;
      const dur = Math.max(1, b.t - a.t);
      frames.push({ opacity: 0, transform: `translate(${a.x}px, ${a.y}px)`, offset: Math.max(0, a.t - 1) / t });
      for (const f of eased(a.x, b.x, (x) => ({ transform: `translate(${x}px, ${a.y}px)` }))) frames.push({ ...f, opacity: 1, offset: (a.t + Number(f.offset) * dur) / t });
      frames.push({ opacity: 0, transform: `translate(${b.x}px, ${b.y}px)`, offset: Math.min(t, b.t + 1) / t });
    }
    frames.push({ opacity: 0, transform: frames[frames.length - 1]!.transform, offset: 1 });
    // keyframe offsets must not decrease
    for (let i = 1; i < frames.length; i++) frames[i]!.offset = Math.max(Number(frames[i - 1]!.offset), Number(frames[i]!.offset));
    nib.style.opacity = '0';
    anims.push(nib.animate(frames, { duration: t, fill: 'forwards' }));
  }
  // one timer for the whole page, on the same clock as the animations
  const clock = new Animation(new KeyframeEffect(null, [], { duration: t }), document.timeline);
  clock.play();
  anims.push(clock);
  clock.finished.then(finish, () => undefined);
  return { skip: finish, done };
}

/** A pen does not move at constant speed: a little smoothstep blended into a steady stroke. */
export function easeStroke(k: number): number {
  return 0.3 * k * k * (3 - 2 * k) + 0.7 * k;
}

/** A CSS <time> as milliseconds: "560ms", ".56s" (what the minifier makes of 560ms) or a bare number. */
export function cssTimeMs(value: string, fallback: number): number {
  const m = /^\s*(-?[\d.]+)\s*(ms|s)?\s*$/i.exec(value);
  if (!m) return fallback;
  const n = parseFloat(m[1]!);
  if (!Number.isFinite(n)) return fallback;
  return m[2]?.toLowerCase() === 's' ? n * 1000 : n;
}
