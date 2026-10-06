// The pen (plan §11). In document order, every [data-write] element (text) is uncovered line by line by
// a clip-path that follows a moving pen edge, and every [data-draw] element (an SVG stroke, or a group of
// strokes drawn together) is drawn by animating its stroke-dashoffset. A small nib dot rides the edge.
// Text is real DOM from the first frame (screen readers and find-in-page see it at once); only its
// painting is clipped. Durations scale with length, so long lines take longer.

export const WRITE_PX_PER_S = 540; // pen speed along a line of text
const DRAW_PX_PER_S = 900; // pen speed along a drawn stroke
const DRAW_MAX_MS = 1400; // a long stroke (a coastline) is sketched quickly, not traced for seconds
const LINE_PAUSE_MS = 70; // the pen lifts and moves to the next line
const BLOCK_PAUSE_MS = 220; // between paragraphs and drawings

type Line = { left: number; right: number; top: number; bottom: number };
type TextSeg = { kind: 'text'; el: HTMLElement; lines: Line[]; line: number; t0: number; t1: number; pad: number };
type DrawSeg = { kind: 'draw'; el: Element; paths: { p: SVGGeometryElement; len: number }[]; t0: number; t1: number };
type Segment = TextSeg | DrawSeg;

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

/** The clip polygon for an element whose line `i` is written up to x (earlier lines complete). */
export function clipFor(lines: Line[], i: number, x: number, width: number, pad: number): string {
  const l = lines[i]!;
  // finished lines keep their descenders: the full-width band reaches below the previous line
  const prevBottom = i > 0 ? lines[i - 1]!.bottom + pad : 0;
  const top = Math.max(0, l.top - pad, prevBottom);
  const bottom = l.bottom + pad;
  const px = (n: number) => `${Math.round(n * 10) / 10}px`;
  // everything above this line is visible across the full width; this line up to the pen
  return `polygon(${px(-pad)} ${px(-pad * 3)}, ${px(width + pad)} ${px(-pad * 3)}, ${px(width + pad)} ${px(top)}, ${px(x)} ${px(top)}, ${px(x)} ${px(bottom)}, ${px(-pad)} ${px(bottom)})`;
}

export type Writer = { skip: () => void; done: Promise<void> };

function strokesOf(el: Element): SVGGeometryElement[] {
  if (el instanceof SVGGeometryElement) return [el];
  return [...el.querySelectorAll<SVGGeometryElement>('path, line, polyline, circle, ellipse, rect')];
}

/**
 * Write and draw everything inside `root`. `nib` is positioned (absolutely, inside `root`) on the pen's
 * edge while it writes text. Resolves when everything is written or skipped.
 */
export function writePage(root: HTMLElement, nib: HTMLElement | null): Writer {
  const els = [...root.querySelectorAll<HTMLElement | SVGElement>('[data-write], [data-draw]')];
  const segments: Segment[] = [];
  const texts: HTMLElement[] = [];
  const drawn: SVGGeometryElement[] = [];
  let t = 120; // a breath before the pen touches the paper
  for (const el of els) {
    if (el.hasAttribute('data-draw')) {
      const paths = strokesOf(el).map((p) => ({ p, len: Math.max(1, p.getTotalLength()) }));
      if (!paths.length) continue;
      // a group draws its strokes together (a coastline is sketched, not traced); a single stroke takes its length
      const longest = Math.max(...paths.map((x) => x.len));
      const dur = Math.min(DRAW_MAX_MS, Math.max(260, ((el.getAttribute('data-draw') === 'together' ? longest : paths.reduce((a, x) => a + x.len, 0)) / DRAW_PX_PER_S) * 1000));
      segments.push({ kind: 'draw', el, paths, t0: t, t1: t + dur });
      t += dur + BLOCK_PAUSE_MS / 2;
      for (const { p, len } of paths) {
        p.style.strokeDasharray = `${len}`;
        p.style.strokeDashoffset = `${len}`;
        drawn.push(p);
      }
      (el as SVGElement).style.opacity = '1';
      continue;
    }
    const h = el as HTMLElement;
    const lines = measureLines(h);
    const pad = parseFloat(getComputedStyle(h).fontSize) * 0.25; // room for ascenders/descenders beyond the font box
    lines.forEach((l, i) => {
      const dur = ((l.right - l.left) / WRITE_PX_PER_S) * 1000;
      segments.push({ kind: 'text', el: h, lines, line: i, t0: t, t1: t + dur, pad });
      t += dur + LINE_PAUSE_MS;
    });
    t += BLOCK_PAUSE_MS - LINE_PAUSE_MS;
    h.style.clipPath = 'inset(0 0 100% 0)';
    texts.push(h);
  }

  let finished = false;
  let raf = 0;
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    for (const el of texts) el.style.clipPath = 'none'; // inline 'none' also beats the [data-unwritten] CSS until React re-renders
    for (const p of drawn) {
      p.style.strokeDasharray = 'none';
      p.style.strokeDashoffset = '0';
    }
    if (nib) nib.style.opacity = '0';
    root.removeAttribute('data-writing');
    resolve();
  };
  if (segments.length === 0) {
    finish();
    return { skip: finish, done };
  }

  root.setAttribute('data-writing', '');
  const start = performance.now();
  const frame = (now: number) => {
    const el = now - start;
    let nibAt: { x: number; y: number } | null = null;
    // text: the element being written is clipped to the pen; earlier ones are complete
    let current: TextSeg | null = null;
    for (const s of segments) if (s.kind === 'text' && el >= s.t0) current = s;
    for (const e of texts) {
      const seg = current && current.el === e ? current : null;
      if (seg) {
        const k = Math.min(1, Math.max(0, (el - seg.t0) / Math.max(1, seg.t1 - seg.t0)));
        const line = seg.lines[seg.line]!;
        const x = line.left + (line.right - line.left) * easeStroke(k);
        e.style.clipPath = clipFor(seg.lines, seg.line, x, e.offsetWidth, seg.pad);
        if (k < 1) {
          const box = e.getBoundingClientRect();
          const rootBox = root.getBoundingClientRect();
          nibAt = { x: box.left - rootBox.left + x, y: box.top - rootBox.top + line.bottom - seg.pad * 0.55 };
        }
      } else if (segments.some((s) => s.kind === 'text' && s.el === e && s.t1 <= el)) {
        e.style.clipPath = 'none';
      }
    }
    // strokes
    for (const s of segments) {
      if (s.kind !== 'draw') continue;
      const k = Math.min(1, Math.max(0, (el - s.t0) / Math.max(1, s.t1 - s.t0)));
      for (const { p, len } of s.paths) p.style.strokeDashoffset = `${len * (1 - easeStroke(k))}`;
    }
    if (nib) {
      nib.style.opacity = nibAt ? '1' : '0';
      if (nibAt) nib.style.transform = `translate(${nibAt.x}px, ${nibAt.y}px)`;
    }
    if (el >= t) finish();
    else raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { skip: finish, done };
}

/** A pen does not move at constant speed: a little smoothstep blended into a steady stroke. */
export function easeStroke(k: number): number {
  return 0.3 * k * k * (3 - 2 * k) + 0.7 * k;
}
