// The trail's END page: the way you came, doodled as a wandering pencil path with a sketchy ring at each
// stop (the titles are real text, written by the pen like everything else). Then: keep it in your notebook
// (on this device), copy it as text, save it as an image.
import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { usePrefs } from '../app/PrefsContext';
import { articleUrl, oneLine } from '../core/trail/trail';
import { normalizeTypography, type Lang } from '../core/typography/typography';
import { sketchEllipse, sketchFlourish, sketchPath } from '../ink/sketch';
import { seedFor } from '../player/Notebook';
import { copyText, saveImage, trailImage, trailText, type Stop } from './export';
import { keepTrail, loadTrail, trailKey } from './kept';

type Geo = { w: number; h: number; path: string; rings: string[] };

export function TrailEnd({ lang, date, from, stops }: { lang: Lang; date: string; from: Stop; stops: Stop[] }) {
  const { t } = usePrefs();
  const n = (s: string) => normalizeTypography(s, lang);
  const seed = seedFor(`${lang}:${date}:${stops.map((s) => s.title).join('|')}`, 0);
  const map = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [kept, setKept] = useState(() => {
    const k = loadTrail(trailKey(lang, date));
    return Boolean(k && k.stops.map((s) => s.title).join('|') === stops.map((s) => s.title).join('|'));
  });
  const [status, setStatus] = useState('');
  const all = [from, ...stops];
  // the kept copy carries the year: it may be read again long after this autumn
  const dateText = new Intl.DateTimeFormat(lang === 'de' ? 'de-CH' : lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`));

  // the path runs through the rings, which sit left of each title; measured, so it follows the real layout
  useLayoutEffect(() => {
    const box = map.current;
    if (!box) return;
    const draw = () => {
      const b = box.getBoundingClientRect();
      const pts = [...box.querySelectorAll<HTMLElement>('.trail-dot')].map((d) => {
        const r = d.getBoundingClientRect();
        return [r.left - b.left + r.width / 2, r.top - b.top + r.height / 2] as const;
      });
      if (pts.length < 2) return;
      setGeo({
        w: b.width,
        h: b.height,
        path: sketchPath(pts, seed, 26),
        rings: pts.map(([x, y], i) => sketchEllipse(x, y, 9, 8, seed + i)).concat(sketchEllipse(pts.at(-1)![0], pts.at(-1)![1], 15, 13, seed + 99)),
      });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(box);
    return () => ro.disconnect();
  }, [seed]);

  const exportArgs = { lang, heading: t('trail.heading'), date: dateText, from, stops, credit: t('trail.credit') };

  return (
    <div className="page page--trail-end">
      <p className="ink ink--title" data-write>
        {t('trail.end')}
      </p>
      <div ref={map} className="trail-map">
        {geo ? (
          <svg className="trail-doodle" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden="true">
            <g className="trail-path" data-draw>
              <path d={geo.path} />
            </g>
            <g className="trail-rings" data-draw="together">
              {geo.rings.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          </svg>
        ) : null}
        <ol className="trail-stops">
          {all.map((s, i) => (
            <li key={s.title} className="trail-stop" data-start={i === 0 || undefined} data-last={i === all.length - 1 || undefined}>
              <span className="trail-dot" aria-hidden="true" />
              <a className="ink trail-stop-title" href={articleUrl(lang, s.title, s.revid || undefined)} target="_blank" rel="noopener noreferrer" data-write>
                {n(s.title)}
              </a>
              <span className="ink ink--small trail-stop-desc" data-write>
                {s.description ? n(oneLine(s.description)) : '\u00a0'}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <svg className="end-flourish" viewBox="0 0 160 16" aria-hidden="true" data-draw>
        <path d={sketchFlourish(4, 8, 150, seed)} />
      </svg>
      <p className="ui-line trail-actions">
        <button
          type="button"
          className="note-btn note-btn--keep"
          aria-pressed={kept}
          onClick={() => {
            const ok = keepTrail({ lang, date, from: from.title, stops, keptAt: new Date().toISOString() });
            setKept(ok);
            setStatus(ok ? t('trail.kept') : t('trail.failed'));
          }}
        >
          {t('trail.keep')}
        </button>
        <button
          type="button"
          className="note-btn"
          onClick={async () => setStatus((await copyText(trailText(exportArgs))) ? t('trail.copied') : t('trail.failed'))}
        >
          {t('trail.copy')}
        </button>
        <button
          type="button"
          className="note-btn"
          onClick={async () => {
            try {
              const blob = await trailImage({ ...exportArgs, seed });
              const r = await saveImage(blob, `margin-trail-${lang}-${date}.png`, t('trail.heading'));
              setStatus(r === 'cancelled' ? '' : t('trail.saved'));
            } catch {
              setStatus(t('trail.failed'));
            }
          }}
        >
          {t('trail.save')}
        </button>
      </p>
      <p className="ui-line note-hint trail-status" aria-live="polite">
        {status || (kept ? t('trail.kept') : ' ')}
      </p>
      <p className="ink ink--small end-actions">
        <Link className="ink-link end-link" to="/">
          {t('end.close')}
        </Link>
      </p>
    </div>
  );
}
