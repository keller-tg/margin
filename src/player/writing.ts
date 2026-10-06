// The pen-writing reveal (plan §11). Every [data-write] element in a page is uncovered line by line,
// in document order, by a clip-path that follows a moving pen edge; a small nib dot rides that edge.
// The text is real DOM from the first frame (screen readers and find-in-page see it at once); only its
// painting is clipped. The duration of a line scales with its length, so long lines take longer.

export const WRITE_PX_PER_S = 540; // pen speed along a line
const LINE_PAUSE_MS = 70; // the pen lifts and moves to the next line
const BLOCK_PAUSE_MS = 220; // between paragraphs

type Line = { left: number; right: number; top: number; bottom: number };
type Segment = { el: HTMLElement; lines: Line[]; line: number; t0: number; t1: number; pad: number };

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

/**
 * Write every [data-write] element inside `root`. `nib` is positioned (absolutely, inside `root`) on the
 * pen's edge while writing. Resolves when all text is written or skipped.
 */
export function writePage(root: HTMLElement, nib: HTMLElement | null): Writer {
  const els = [...root.querySelectorAll<HTMLElement>('[data-write]')];
  const segments: Segment[] = [];
  let t = 120; // a breath before the pen touches the paper
  for (const el of els) {
    const lines = measureLines(el);
    const pad = parseFloat(getComputedStyle(el).fontSize) * 0.25; // room for ascenders/descenders beyond the font box
    lines.forEach((l, i) => {
      const dur = ((l.right - l.left) / WRITE_PX_PER_S) * 1000;
      segments.push({ el, lines, line: i, t0: t, t1: t + dur, pad });
      t += dur + LINE_PAUSE_MS;
    });
    t += BLOCK_PAUSE_MS - LINE_PAUSE_MS;
    el.style.clipPath = 'inset(0 0 100% 0)';
  }

  let finished = false;
  let raf = 0;
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    for (const el of els) el.style.clipPath = 'none'; // inline 'none' also beats the [data-unwritten] CSS until React re-renders
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
    let current: Segment | null = null;
    for (const s of segments) {
      if (el < s.t0) break;
      current = s;
    }
    // elements entirely before the current one are complete; after it, still hidden
    let seenCurrent = false;
    for (const e of els) {
      if (current && e === current.el) {
        seenCurrent = true;
        const s = current;
        const k = Math.min(1, Math.max(0, (el - s.t0) / Math.max(1, s.t1 - s.t0)));
        const line = s.lines[s.line]!;
        const x = line.left + (line.right - line.left) * easeStroke(k);
        e.style.clipPath = clipFor(s.lines, s.line, x, e.offsetWidth, s.pad);
        if (nib) {
          const box = e.getBoundingClientRect();
          const rootBox = root.getBoundingClientRect();
          nib.style.opacity = k < 1 ? '1' : '0';
          nib.style.transform = `translate(${box.left - rootBox.left + x}px, ${box.top - rootBox.top + line.bottom - s.pad * 0.55}px)`;
        }
      } else if (!seenCurrent && current) {
        e.style.clipPath = 'none';
      }
    }
    if (el >= t) finish();
    else raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { skip: finish, done };
}

/** A pen does not move at constant speed: it starts a touch slower and eases at the end of a line. */
export function easeStroke(k: number): number {
  return 0.3 * k * k * (3 - 2 * k) + 0.7 * k; // a little smoothstep blended into a steady stroke
}
