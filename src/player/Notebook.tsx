// The notebook's page machinery, shared by the daily Player and the Rabbit Trail: leaves stacked in one
// grid cell, the 2D page turn (or the reduced-motion dip), the pen writing each new page, keys, taps and
// swipes. What is written on each leaf is up to the caller.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { usePrefs } from '../app/PrefsContext';
import { Sheet } from '../paper/Sheet';
import { useReducedMotion } from './motion';
import { turnPage, type TurnDirection } from './turn';
import { writePage, type Writer } from './writing';
import './player.css';

type Turn = { from: number; to: number; dir: TurnDirection };

export type Leaf = { margin: ReactNode; body: ReactNode; foot: ReactNode };
/** Turn a page. `force` finishes any writing and turns at once (e.g. right after a trail choice). */
export type Go = (dir: TurnDirection, force?: boolean) => void;

export type NotebookProps = {
  label: string;
  count: number;
  index: number;
  setIndex: (i: number) => void;
  /** Identity of what is written on page i: the writing runs once per key, and a new key is a new leaf. */
  pageKey: (i: number) => string;
  leaf: (i: number, go: Go) => Leaf;
  /** False keeps the reader on page i going forward (e.g. a trail choice not yet made). */
  canForward?: (i: number) => boolean;
  /** Forward on the last page. */
  onPastEnd: () => void;
  onEscape: () => void;
};

/** A stable small number per page, so its hand-drawn strokes look the same on every visit. */
export function seedFor(id: string, i: number): number {
  let h = 2166136261;
  for (const c of `${id}:${i}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 100000;
}

export function Notebook({ label, count, index, setIndex, pageKey, leaf, canForward, onPastEnd, onEscape }: NotebookProps) {
  const { prefs, t } = usePrefs();
  const reduced = useReducedMotion(prefs.motion);
  const [turn, setTurn] = useState<Turn | null>(null);
  const written = useRef(new Set<string>());
  const writer = useRef<Writer | null>(null);
  const [writing, setWriting] = useState(false);
  const leafRefs = useRef(new Map<number, HTMLElement>());
  const nibRefs = useRef(new Map<number, HTMLElement>());
  const shadow = useRef<HTMLDivElement>(null);
  const live = useRef<HTMLParagraphElement>(null);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressClick = useRef(false);
  const currentKey = pageKey(index);

  // ---- turning pages
  const go = useCallback(
    (dir: TurnDirection, force = false) => {
      if (turn) return;
      if (writer.current && writing) {
        writer.current.skip(); // the first tap finishes the writing; the next one turns the page
        if (!force) return;
      }
      if (dir === 'forward' && canForward && !canForward(index)) return;
      const to = dir === 'forward' ? index + 1 : index - 1;
      if (to < 0) return;
      if (to >= count) {
        onPastEnd(); // past the END page: the notebook closes
        return;
      }
      setTurn({ from: index, to, dir });
    },
    [turn, writing, index, count, canForward, onPastEnd],
  );

  useLayoutEffect(() => {
    if (!turn) return;
    const moving = leafRefs.current.get(turn.dir === 'forward' ? turn.from : turn.to);
    const under = leafRefs.current.get(turn.dir === 'forward' ? turn.to : turn.from) ?? null;
    if (!moving) return;
    const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-turn')) || 560;
    turnPage({ moving, under, shadow: shadow.current, direction: turn.dir, reduced, durationMs: duration }).then(() => {
      setIndex(turn.to);
      setTurn(null);
    });
  }, [turn, reduced, setIndex]);

  // ---- after a turn: scroll up, announce, focus, write
  useEffect(() => {
    if (turn) return;
    window.scrollTo({ top: 0 });
    if (live.current) live.current.textContent = t('player.pageOf', { n: String(index + 1), total: String(count) });
    const el = leafRefs.current.get(index);
    el?.focus({ preventScroll: true });
    if (!el || reduced || written.current.has(currentKey)) {
      written.current.add(currentKey);
      return;
    }
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      const w = writePage(el, nibRefs.current.get(index) ?? null);
      writer.current = w;
      setWriting(true);
      w.done.then(() => {
        written.current.add(currentKey);
        setWriting(false);
        el.dispatchEvent(new Event('margin:written')); // e.g. the map moves closer once it is drawn
      });
    });
    return () => {
      cancelled = true;
      writer.current?.skip();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- count only feeds the announcement
  }, [turn, index, currentKey, reduced]);

  // ---- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.target as HTMLElement | null)?.closest('a, button, input, select, textarea')) return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        go('forward');
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        go('back');
      } else if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onEscape]);

  // ---- tap and swipe
  const onPointerDown = (e: ReactPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      suppressClick.current = true;
      go(dx < 0 ? 'forward' : 'back');
    }
  };
  const onClick = (e: React.MouseEvent<HTMLElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if ((e.target as HTMLElement).closest('a, button, input, label, form')) return;
    if (window.getSelection()?.toString()) return; // selecting text is not turning a page
    const box = e.currentTarget.getBoundingClientRect();
    go(e.clientX - box.left > box.width * 0.33 ? 'forward' : 'back');
  };

  // ---- which leaves are on the table
  const shown: { i: number; z: number; moving: boolean }[] = turn
    ? turn.dir === 'forward'
      ? [{ i: turn.to, z: 1, moving: false }, { i: turn.from, z: 2, moving: true }]
      : [{ i: turn.from, z: 1, moving: false }, { i: turn.to, z: 2, moving: true }]
    : [{ i: index, z: 1, moving: false }];

  return (
    <main className="player" aria-roledescription="notebook" aria-label={label}>
      <p ref={live} className="visually-hidden" aria-live="polite" />
      <div className="leaves">
        {shown.map(({ i, z, moving }) => {
          const k = pageKey(i);
          const unwritten = !reduced && !written.current.has(k);
          const { margin, body, foot } = leaf(i, go);
          return (
            <section
              key={k}
              ref={(el) => {
                if (el) leafRefs.current.set(i, el);
                else leafRefs.current.delete(i);
              }}
              className="leaf"
              style={{ zIndex: z }}
              data-moving={moving || undefined}
              data-entering={turn && moving && turn.dir === 'back' && !reduced ? '' : undefined}
              data-unwritten={unwritten || undefined}
              tabIndex={-1}
              aria-label={t('player.pageOf', { n: String(i + 1), total: String(count) })}
              aria-hidden={turn && i !== turn.to ? true : undefined}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onClick={onClick}
            >
              <Sheet as="div" paper={prefs.paper} fill margin={margin}>
                {body}
                {foot}
              </Sheet>
              <span
                className="nib"
                aria-hidden="true"
                ref={(el) => {
                  if (el) nibRefs.current.set(i, el);
                  else nibRefs.current.delete(i);
                }}
              />
            </section>
          );
        })}
        <div ref={shadow} className="fold-shadow" aria-hidden="true" />
      </div>
    </main>
  );
}

/** Progress: one small pen tick per page, the current one written darker. */
export function Ticks({ n, at }: { n: number; at: number }) {
  return (
    <svg className="ticks" viewBox={`0 0 ${n * 14} 12`} width={n * 14} height={12} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${i * 14 + 3 + ((i * 7) % 3) * 0.4} ${9 - ((i * 5) % 3) * 0.5} L${i * 14 + 9} ${3 + ((i * 3) % 2) * 0.6}`} data-on={i <= at || undefined} data-current={i === at || undefined} />
      ))}
    </svg>
  );
}
