// /trail/:lang/:date — the Rabbit Trail from that day's morning thing (milestone e). Loaded lazily, so
// none of this is in the main bundle. Five hops, each a choice of four stops and then 1–4 text pages
// depending on the pace, then the END page with the trail doodled as a path.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { usePrefs } from '../app/PrefsContext';
import type { PaceId, Thing } from '../core/schema/thing';
import { articleUrl, hopPages, HOPS, oneLine, type TrailPool, type TrailSeed } from '../core/trail/trail';
import { normalizeTypography, type Lang } from '../core/typography/typography';
import { formatMarginDate, isLang } from '../i18n/i18n';
import { Sheet } from '../paper/Sheet';
import { useThing } from '../player/data';
import { Notebook, Ticks, type Go, type Leaf } from '../player/Notebook';
import { browserApi } from './client';
import { nextOptions, type Source } from './engine';
import { TrailEnd } from './TrailEnd';
import './trail.css';

type Hop = { options: TrailSeed[] | null; source: Source; chosen: TrailSeed | null };
type PageRef = { kind: 'choose'; k: number } | { kind: 'hop'; k: number; j: number; text: string } | { kind: 'end' };

type PoolState = { status: 'loading' } | { status: 'ready'; pool: TrailPool | null };

function usePool(lang: Lang, date: string): PoolState {
  const [state, setState] = useState<PoolState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    fetch(`/trail/${lang}/${date}.json`)
      .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? (r.json() as Promise<TrailPool>) : null))
      .catch(() => null)
      .then((pool) => live && setState({ status: 'ready', pool }));
    return () => {
      live = false;
    };
  }, [lang, date]);
  return state;
}

export default function TrailRoute() {
  const { lang, date } = useParams();
  const { prefs, setPrefs, t } = usePrefs();
  const valid = isLang(lang) && /^\d{4}-\d{2}-\d{2}$/.test(date ?? '');
  const l: Lang = isLang(lang) ? lang : 'en';
  const thing = useThing(l, date ?? '', 'morning');
  const pool = usePool(l, date ?? '');
  useEffect(() => {
    if (isLang(lang) && lang !== prefs.lang) setPrefs({ lang });
  }, [lang, prefs.lang, setPrefs]);

  if (!valid) return <Navigate to="/" replace />;
  if (thing.status === 'ready' && pool.status === 'ready') return <Trail thing={thing.thing} pool={pool.pool} />;
  return (
    <Sheet paper={prefs.paper}>
      <p className="ink gap-2" aria-live="polite">
        {thing.status === 'missing' ? t('trail.missing') : t('player.loading')}
      </p>
    </Sheet>
  );
}

function Trail({ thing, pool }: { thing: Thing; pool: TrailPool | null }) {
  const { prefs, t } = usePrefs();
  const navigate = useNavigate();
  const lang = thing.lang;
  const pace = prefs.pace as PaceId;
  const api = useMemo(() => browserApi(lang), [lang]);
  const n = useCallback((s: string) => normalizeTypography(s, lang), [lang]);
  const from = thing.topic.title;
  const fromRevid = pool?.from.revid ?? thing.topic.revid;
  const [hops, setHops] = useState<Hop[]>([]);
  const [index, setIndex] = useState(0);
  const offline = useRef(false);
  const goRef = useRef<Go | null>(null);
  const pendingForward = useRef(false);
  const close = useCallback(() => navigate('/'), [navigate]);

  const load = useCallback(
    (k: number, at: string, visited: string[]) => {
      setHops((h) => {
        const next = h.slice(0, k);
        next[k] = { options: null, source: 'live', chosen: null };
        return next;
      });
      nextOptions({ lang, date: thing.date, pace, from: at, visited, pool, stayOffline: offline.current, api, online: navigator.onLine }).then((o) => {
        if (o.offline) offline.current = true;
        setHops((h) => (h[k] && h[k]!.options === null ? h.map((x, i) => (i === k ? { options: o.options, source: o.source, chosen: null } : x)) : h));
      });
    },
    [lang, thing.date, pace, pool, api],
  );

  useEffect(() => {
    load(0, from, [from]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the first choice is asked for once
  }, []);

  const choose = (k: number, seed: TrailSeed) => {
    if (hops[k]?.chosen) return;
    const visited = [from, ...hops.slice(0, k).map((h) => h.chosen!.title), seed.title];
    setHops((h) => h.map((x, i) => (i === k ? { ...x, chosen: seed } : x)));
    if (k + 1 < HOPS) load(k + 1, seed.title, visited); // look for the next paths while the reader reads
    pendingForward.current = true;
  };
  useEffect(() => {
    if (!pendingForward.current) return;
    pendingForward.current = false;
    goRef.current?.('forward', true);
  }, [hops]);

  // ---- the pages so far: choose, the chosen stop's pages, choose, … END
  const pages: PageRef[] = [];
  hops.forEach((h, k) => {
    pages.push({ kind: 'choose', k });
    if (h.options && h.options.length === 0) pages.push({ kind: 'end' });
    if (!h.chosen) return;
    hopPages(h.chosen, lang, pace).forEach((text, j) => pages.push({ kind: 'hop', k, j, text }));
    if (k === HOPS - 1) pages.push({ kind: 'end' });
  });
  if (pages.length === 0) pages.push({ kind: 'choose', k: 0 });
  const count = pages.length;
  const chosen = hops.map((h) => h.chosen).filter((c): c is TrailSeed => Boolean(c));

  const pageKey = (i: number) => {
    const p = pages[i]!;
    if (p.kind === 'choose') return `${pace}:choose:${p.k}:${hops[p.k]?.options ? 'ready' : 'finding'}`;
    if (p.kind === 'hop') return `${pace}:hop:${p.k}:${p.j}:${hops[p.k]?.chosen?.title}`;
    return `${pace}:end`;
  };
  const canForward = (i: number) => {
    const p = pages[i];
    return !(p?.kind === 'choose' && !hops[p.k]?.chosen && hops[p.k]?.options?.length !== 0);
  };

  const leaf = (i: number, go: Go): Leaf => {
    goRef.current = go;
    const p = pages[i]!;
    const k = p.kind === 'end' ? HOPS - 1 : p.k;
    const hop = hops[k];
    const date = new Date(`${thing.date}T12:00:00`);
    const margin = (
      <p className="ink ink--small ink--note margin-date">
        {i === 0 ? `${formatMarginDate(lang, date)} · ${t('trail.margin')}` : p.kind === 'end' ? '' : `${k + 1}/${HOPS}`}
      </p>
    );
    let body;
    let credit;
    if (p.kind === 'choose') {
      body = <ChoosePage k={p.k} hop={hop} from={n(from)} onChoose={(s) => choose(p.k, s)} onEnd={() => go('forward')} n={n} />;
      credit = hop?.options ? <p className="ui-line attribution">{t(hop.source === 'live' ? 'trail.live' : 'trail.pool')} · Wikipedia · <span className="nowrap">CC BY-SA 4.0</span></p> : null;
    } else if (p.kind === 'hop') {
      const s = hop!.chosen!;
      body = (
        <div className="page page--hop">
          {p.j === 0 ? (
            <>
              <h1 className="ink ink--title" data-write>
                {n(s.title)}
              </h1>
              <p className="ink title-line" data-write>
                {n(oneLine(s.description))}
              </p>
            </>
          ) : null}
          <p className={p.j === 0 ? 'ink' : 'ink ink--page'} data-write>
            {n(p.text)}
          </p>
        </div>
      );
      credit = (
        <p className="ui-line attribution">
          {t('player.text')} ·{' '}
          <a href={articleUrl(lang, s.title, s.revid || undefined)} target="_blank" rel="noopener noreferrer">
            {n(s.title)}
          </a>{' '}
          · <span className="nowrap">CC BY-SA 4.0</span>
        </p>
      );
    } else {
      body = (
        <TrailEnd
          lang={lang}
          date={thing.date}
          from={{ title: from, description: thing.topic.teaser, revid: fromRevid }}
          stops={chosen.map((c) => ({ title: c.title, description: c.description, revid: c.revid }))}
        />
      );
      credit = <p className="ui-line attribution">{t('trail.credit')}</p>;
    }
    return {
      margin,
      body,
      foot: (
        <footer className="page-foot player-foot">
          <Ticks n={HOPS} at={p.kind === 'choose' && !hop?.chosen ? k - 1 : k} />
          <nav className="ui-line player-nav" aria-label={t('player.pageOf', { n: String(i + 1), total: String(count) })}>
            <button type="button" className="nav-btn" onClick={() => go('back')} disabled={i === 0} aria-label={t('player.prev')}>
              ←
            </button>
            <span />
            <button
              type="button"
              className="nav-btn"
              onClick={() => go('forward')}
              disabled={!canForward(i)}
              aria-label={i === count - 1 && p.kind === 'end' ? t('player.close') : t('player.next')}
            >
              →
            </button>
          </nav>
          {credit}
        </footer>
      ),
    };
  };

  return (
    <Notebook
      label={t('trail.label', { topic: n(from) })}
      count={count}
      index={Math.min(index, count - 1)}
      setIndex={setIndex}
      pageKey={pageKey}
      leaf={leaf}
      canForward={canForward}
      onPastEnd={close}
      onEscape={close}
    />
  );
}

function ChoosePage({ k, hop, from, onChoose, onEnd, n }: { k: number; hop: Hop | undefined; from: string; onChoose: (s: TrailSeed) => void; onEnd: () => void; n: (s: string) => string }) {
  const { t } = usePrefs();
  const options = hop?.options ?? null;
  return (
    <div className="page page--choose">
      <p className="ink ink--title trail-q" data-write>
        {k === 0 ? t('trail.from', { topic: from }) : t('trail.next')}
      </p>
      {k === 0 ? (
        <p className="ink ink--small ink--note trail-privacy" data-write>
          {t('trail.privacy')}
        </p>
      ) : null}
      {options === null ? (
        <p className="ink trail-finding" data-write aria-live="polite">
          {t('trail.finding')}
        </p>
      ) : options.length === 0 ? (
        <>
          <p className="ink" data-write>
            {t('trail.none')}
          </p>
          <p className="ink ink--small">
            <button type="button" className="trail-link" onClick={onEnd}>
              {t('trail.toEnd')}
            </button>
          </p>
        </>
      ) : (
        <ol className="trail-options" aria-label={t('trail.choose')}>
          {options.map((o) => {
            const picked = hop?.chosen?.title === o.title;
            return (
              <li key={o.title}>
                <button
                  type="button"
                  className="trail-option"
                  data-picked={picked || undefined}
                  data-other={(hop?.chosen && !picked) || undefined}
                  disabled={Boolean(hop?.chosen)}
                  aria-pressed={picked}
                  onClick={() => onChoose(o)}
                >
                  <span className="ink trail-opt-title" data-write>
                    {n(o.title)}
                  </span>
                  <span className="ink ink--small trail-opt-desc" data-write>
                    {n(oneLine(o.description))}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
