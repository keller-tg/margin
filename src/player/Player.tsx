import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router';
import { usePrefs } from '../app/PrefsContext';
import type { PaceId, Thing } from '../core/schema/thing';
import { normalizeTypography } from '../core/typography/typography';
import { formatMarginDate } from '../i18n/i18n';
import { Sheet } from '../paper/Sheet';
import type { PacePref } from '../theme/prefs';
import type { Manifest } from './data';
import { useReducedMotion } from './motion';
import { PageBody } from './pages';
import { turnPage, type TurnDirection } from './turn';
import { writePage, type Writer } from './writing';
import './player.css';

const PACES: PacePref[] = ['easy', 'medium', 'deep'];

/** Same relative position in a different pace: page 3 of 7 → page 2 of 4. */
export function mapIndex(index: number, fromLen: number, toLen: number): number {
  if (fromLen <= 1) return 0;
  return Math.round((index / (fromLen - 1)) * (toLen - 1));
}

type Turn = { from: number; to: number; dir: TurnDirection };

export function Player({ thing, manifest }: { thing: Thing; manifest: Manifest }) {
  const { prefs, setPrefs, t } = usePrefs();
  const navigate = useNavigate();
  const reduced = useReducedMotion(prefs.motion);
  const pace = prefs.pace as PaceId;
  const pages = thing.paces[pace];
  const [index, setIndex] = useState(0);
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

  const key = (i: number) => `${pace}:${i}`;
  const topicTitle = normalizeTypography(thing.topic.title, thing.lang); // Swiss "ss" for German, as on the pages
  const date = new Date(`${thing.date}T12:00:00`);

  // ---- turning pages
  const go = useCallback(
    (dir: TurnDirection) => {
      if (turn) return;
      if (writer.current && writing) {
        writer.current.skip(); // the first tap finishes the writing; the next one turns the page
        return;
      }
      const to = dir === 'forward' ? index + 1 : index - 1;
      if (to < 0) return;
      if (to >= pages.length) {
        navigate('/'); // the END page arrives with milestone (d)
        return;
      }
      setTurn({ from: index, to, dir });
    },
    [turn, writing, index, pages.length, navigate],
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
  }, [turn, reduced]);

  // ---- after a turn: scroll up, announce, focus, write
  useEffect(() => {
    if (turn) return;
    window.scrollTo({ top: 0 });
    if (live.current) live.current.textContent = t('player.pageOf', { n: String(index + 1), total: String(pages.length) });
    const leaf = leafRefs.current.get(index);
    leaf?.focus({ preventScroll: true });
    if (!leaf || reduced || written.current.has(key(index))) {
      written.current.add(key(index));
      return;
    }
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      const w = writePage(leaf, nibRefs.current.get(index) ?? null);
      writer.current = w;
      setWriting(true);
      w.done.then(() => {
        written.current.add(key(index));
        setWriting(false);
      });
    });
    return () => {
      cancelled = true;
      writer.current?.skip();
    };
  }, [turn, index, pace, reduced]);

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
      } else if (e.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, navigate]);

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
    if ((e.target as HTMLElement).closest('a, button')) return;
    if (window.getSelection()?.toString()) return; // selecting text is not turning a page
    const box = e.currentTarget.getBoundingClientRect();
    go(e.clientX - box.left > box.width * 0.33 ? 'forward' : 'back');
  };

  const changePace = (p: PacePref) => {
    if (p === pace) return;
    writer.current?.skip();
    setIndex(mapIndex(index, pages.length, thing.paces[p].length));
    setPrefs({ pace: p, paceChosen: true });
  };

  // ---- which leaves are on the table
  const shown: { i: number; z: number; moving: boolean }[] = turn
    ? turn.dir === 'forward'
      ? [{ i: turn.to, z: 1, moving: false }, { i: turn.from, z: 2, moving: true }]
      : [{ i: turn.from, z: 1, moving: false }, { i: turn.to, z: 2, moving: true }]
    : [{ i: index, z: 1, moving: false }];

  return (
    <main className="player" aria-roledescription="notebook" aria-label={topicTitle}>
      <p ref={live} className="visually-hidden" aria-live="polite" />
      <div className="leaves">
        {shown.map(({ i, z, moving }) => {
          const page = pages[i]!;
          const unwritten = !reduced && !written.current.has(key(i));
          return (
            <section
              key={`${pace}:${i}`}
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
              aria-label={t('player.pageOf', { n: String(i + 1), total: String(pages.length) })}
              aria-hidden={turn && i !== turn.to ? true : undefined}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onClick={onClick}
            >
              <Sheet
                as="div"
                paper={prefs.paper}
                fill
                margin={
                  <p className="ink ink--small ink--note margin-date">
                    {i === 0 ? `${formatMarginDate(thing.lang, date)} · ${t(thing.slot === 'morning' ? 'slot.morning' : 'slot.evening').toLowerCase()}` : `${i + 1}/${pages.length}`}
                  </p>
                }
              >
                <PageBody page={page} thing={thing} manifest={manifest} />
                <footer className="page-foot player-foot">
                  <Ticks n={pages.length} at={i} />
                  <nav className="ui-line player-nav" aria-label={t('player.pageOf', { n: String(i + 1), total: String(pages.length) })}>
                    <button type="button" className="nav-btn" onClick={() => go('back')} disabled={i === 0} aria-label={t('player.prev')}>
                      ←
                    </button>
                    {i === 0 ? (
                      <span className="pace-switch" role="group" aria-label={t('player.pace')}>
                        {PACES.map((p) => (
                          <button key={p} type="button" className="pace-btn" aria-pressed={p === pace} onClick={() => changePace(p)}>
                            {t(`pace.${p}`)}
                          </button>
                        ))}
                      </span>
                    ) : i === pages.length - 1 ? (
                      <span className="end-hint">{t('player.close')}</span>
                    ) : (
                      <span />
                    )}
                    <button type="button" className="nav-btn" onClick={() => go('forward')} aria-label={i === pages.length - 1 ? t('player.close') : t('player.next')}>
                      →
                    </button>
                  </nav>
                  <p className="ui-line attribution">
                    {t('player.text')} ·{' '}
                    <a href={thing.sources[0]?.url} target="_blank" rel="noopener noreferrer">
                      {topicTitle}
                    </a>{' '}
                    · <span className="nowrap">CC BY-SA 4.0</span>
                  </p>
                </footer>
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
function Ticks({ n, at }: { n: number; at: number }) {
  return (
    <svg className="ticks" viewBox={`0 0 ${n * 14} 12`} width={n * 14} height={12} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${i * 14 + 3 + ((i * 7) % 3) * 0.4} ${9 - ((i * 5) % 3) * 0.5} L${i * 14 + 9} ${3 + ((i * 3) % 2) * 0.6}`} data-on={i <= at || undefined} data-current={i === at || undefined} />
      ))}
    </svg>
  );
}
