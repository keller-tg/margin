import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Aside as AsideT, MapData, Page, Thing } from '../core/schema/thing';
import { inMetres } from '../core/numbers/units';
import { sketchBox, sketchDot, sketchEllipse, sketchFlourish, sketchLine } from '../ink/sketch';
import type { Manifest } from './data';
import { Photo } from './Photo';

type Props = { page: Page; thing: Thing; manifest: Manifest; seed: number };

/** A note in the margin (left of the margin line on wide screens, under the text on a phone). */
function Aside({ aside }: { aside: AsideT | undefined }) {
  if (!aside) return null;
  return (
    <p className="ink ink--small ink--note aside" data-write>
      {aside.text}
    </p>
  );
}

export function PageBody({ page, thing, manifest, seed }: Props) {
  switch (page.type) {
    case 'title': {
      const img = page.image ? thing.images[page.image] : undefined;
      return (
        <div className="page page--title">
          <h1 className="ink ink--title" data-write>
            {page.title}
          </h1>
          {page.line ? (
            <p className="ink title-line" data-write>
              {page.line}
            </p>
          ) : null}
          {img ? <Photo image={img} entry={manifest[img.file]} size="title" alt={img.alt} /> : null}
        </div>
      );
    }
    case 'sentence':
      return (
        <div className="page page--sentence">
          <p className="ink ink--page" data-write>
            {page.text}
          </p>
          <Aside aside={page.aside} />
        </div>
      );
    case 'image': {
      const img = thing.images[page.image];
      return (
        <div className="page page--image">
          {img ? <Photo image={img} entry={manifest[img.file]} size="page" alt={img.alt} /> : null}
          <p className="ink ink--note photo-caption" data-write>
            {page.caption}
          </p>
        </div>
      );
    }
    case 'bignumber':
      return (
        <div className="page page--bignumber">
          <div className="bignum">
            <p className="ink ink--huge" data-write>
              {page.display}
            </p>
            <svg className="bignum-underline" viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden="true" data-draw>
              <path d={`${sketchLine(4, 6, 296, 8, seed, 3)} ${sketchLine(30, 12, 280, 13, seed + 5, 2)}`} vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <p className="ink" data-write>
            {page.caption}
          </p>
          <Aside aside={page.aside} />
        </div>
      );
    case 'timeline':
      return (
        <div className="page page--timeline">
          <div className="timeline">
            <svg className="tl-line" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true" data-draw>
              <path d={sketchLine(5, 0, 5, 100, seed, 0.4)} vectorEffect="non-scaling-stroke" />
            </svg>
            <ol className="tl-events">
              {page.events.map((e, i) => (
                <li key={e.fact} className="tl-event">
                  <svg className="tl-dot" viewBox="0 0 12 12" aria-hidden="true" data-draw>
                    <path d={sketchDot(6, 6, seed + i)} />
                  </svg>
                  <p className="ink tl-year" data-write>
                    {String(thing.facts[e.fact]?.value ?? '')}
                  </p>
                  <p className="ink tl-label" data-write>
                    {e.label}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      );
    case 'map': {
      const data = thing.maps?.[page.map];
      return (
        <div className="page page--map">
          {data ? <MapSketch data={data} seed={seed} /> : null}
          <p className="ink map-label" data-write>
            {page.label}
          </p>
        </div>
      );
    }
    case 'compare':
      return <Compare page={page} thing={thing} seed={seed} />;
    case 'closing':
      return (
        <div className="page page--closing">
          <p className="ink ink--page" data-write>
            {page.text}
          </p>
          <svg className="closing-flourish" viewBox="0 0 120 16" aria-hidden="true" data-draw>
            <path d={sketchFlourish(4, 8, 112, seed)} />
          </svg>
        </div>
      );
  }
}

// ---------------------------------------------------------------- map

const parseBox = (s: string) => s.split(/\s+/).map(Number) as [number, number, number, number];

/**
 * Coastlines drawn like a quick sketch, a hand-drawn ring round the place, then (with motion) a slow move
 * closer. The ring is sized for the close view. Natural Earth (public domain) via world-atlas; projected at
 * build time, so only these few paths reach the browser.
 */
function MapSketch({ data, seed }: { data: MapData; seed: number }) {
  const svg = useRef<SVGSVGElement>(null);
  const wide = parseBox(data.viewBox);
  const close = parseBox(data.zoomBox);
  const zoom = wide[2] / close[2];
  const ring = useMemo(() => sketchEllipse(data.point[0], data.point[1], 15 / zoom, 12 / zoom, seed), [data.point, zoom, seed]);

  // before paint: an unwritten page starts wide and moves closer once drawn; otherwise it is already close
  useLayoutEffect(() => {
    const el = svg.current;
    const leaf = el?.closest('.leaf');
    if (!el || !leaf) return;
    const set = (b: number[]) => el.setAttribute('viewBox', b.map((n) => Math.round(n * 10) / 10).join(' '));
    if (!leaf.hasAttribute('data-unwritten') || zoom <= 1.01) {
      set(close);
      return;
    }
    set(wide);
    let raf = 0;
    const onWritten = () => {
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 1300);
        const e = 1 - Math.pow(1 - k, 3);
        set(wide.map((w, i) => w + (close[i]! - w) * e));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    leaf.addEventListener('margin:written', onWritten, { once: true });
    return () => {
      leaf.removeEventListener('margin:written', onWritten);
      cancelAnimationFrame(raf);
    };
  }, [data.viewBox, data.zoomBox, zoom]);

  return (
    <figure className="map">
      <svg ref={svg} className="map-svg" viewBox={data.zoomBox} aria-hidden="true">
        <g className="map-coast" data-draw="together">
          {data.paths.map((d, i) => (
            <path key={i} d={d} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
        <g className="map-mark" data-draw>
          <path className="map-ring" d={ring} vectorEffect="non-scaling-stroke" />
          <circle className="map-dot" cx={data.point[0]} cy={data.point[1]} r={2.4 / zoom} />
        </g>
      </svg>
      <figcaption className="map-credit">Natural Earth</figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- compare

const BAR_W = 46;
const BARS_H = 168; // drawing height of the tallest bar, in px

function Compare({ page, thing, seed }: { page: Extract<Page, { type: 'compare' }>; thing: Thing; seed: number }) {
  if (page.type !== 'compare') return null;
  const sized = page.items.map((it) => {
    const f = thing.facts[it.fact];
    return { ...it, surface: f?.surface ?? '', metres: f ? (inMetres(Number(f.value), f.unit) ?? 0) : 0 };
  });
  const max = Math.max(...sized.map((s) => s.metres), 1);
  const gap = 26;
  const width = sized.length * BAR_W + (sized.length - 1) * gap + 24;
  return (
    <div className="page page--compare">
      <div className="cmp" style={{ ['--cmp-w' as string]: `${width}px` }}>
        <svg className="cmp-bars" viewBox={`0 0 ${width} ${BARS_H + 8}`} aria-hidden="true">
          <g data-draw>
            <path d={sketchLine(0, BARS_H + 2, width, BARS_H + 3, seed, 0.6)} />
          </g>
          {sized.map((s, i) => {
            const h = Math.max(4, (s.metres / max) * BARS_H);
            const x = 12 + i * (BAR_W + gap);
            return (
              <g key={s.fact} data-draw className={s.fact.startsWith('ref_') ? 'cmp-ref' : 'cmp-topic'}>
                <path d={sketchBox(x, BARS_H + 2 - h, BAR_W, h, seed + 11 * (i + 1))} />
              </g>
            );
          })}
        </svg>
        <ol className="cmp-labels">
          {sized.map((s) => (
            <li key={s.fact} className="cmp-label">
              <span className="ink ink--small cmp-value" data-write>
                {s.surface}
              </span>
              <span className="ink ink--small cmp-name" data-write>
                {s.label}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <p className="ink" data-write>
        {page.caption}
      </p>
    </div>
  );
}
