import { useLayoutEffect, useRef, useState } from 'react';
import { creditLine } from '../core/license/license';
import type { ThingImage } from '../core/schema/thing';
import { usePrefs } from '../app/PrefsContext';
import type { ManifestEntry } from './data';

/** A small, stable tilt per photo, so two photos are never glued in at the same angle. */
function tilt(seed: string, max: number): number {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (((h % 1000) / 1000) * 2 - 1) * max;
}

/**
 * A photo glued into the notebook with two strips of tape. Served from Margin's own origin
 * (/img/{id}/{w}.avif|webp, built by npm run images:build); the credit sits under it in small type.
 * Its slot is a whole number of rules tall, so the writing after it lands on the lines again.
 */
export function Photo({ image, entry, size, alt }: { image: ThingImage; entry: ManifestEntry | undefined; size: 'title' | 'page'; alt: string }) {
  const { t } = usePrefs();
  const slot = useRef<HTMLDivElement>(null);
  // A browser that claims AVIF but can't decode a file (Safari picks the AVIF <source>, and <picture>
  // never falls back on a decode error) gets the picture again without the AVIF source: WebP then.
  const [avifFailed, setAvifFailed] = useState(false);
  const credit = creditLine(entry?.credit ?? image.credit);
  const ratio = entry ? entry.height / entry.width : image.h / image.w;
  const rotation = tilt(image.file, size === 'title' ? 2.2 : 1.1);

  useLayoutEffect(() => {
    const el = slot.current;
    if (!el) return;
    const snap = () => {
      const rule = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rule')) || 36;
      el.style.minHeight = '';
      const h = el.getBoundingClientRect().height;
      el.style.minHeight = `${Math.ceil(h / rule) * rule}px`;
    };
    snap();
    const ro = new ResizeObserver(() => requestAnimationFrame(snap));
    ro.observe(el.firstElementChild as Element);
    return () => ro.disconnect();
  }, []);

  const srcset = (fmt: string) => entry?.widths.map((w) => `/img/${entry.id}/${w}.${fmt} ${w}w`).join(', ');
  const sizes = size === 'title' ? '(min-width: 768px) 20rem, 70vw' : '(min-width: 768px) 34rem, 88vw';

  return (
    <div ref={slot} className={`photo-slot photo-slot--${size}`} style={{ maxWidth: `calc(${size === 'title' ? 42 : 58}dvh / ${ratio.toFixed(3)})` }}>
      <figure className="photo" style={{ ['--tilt' as string]: `${rotation}deg` }}>
        <div className="photo-print">
          <div className="photo-img" style={{ aspectRatio: `1 / ${ratio}`, background: entry?.color ?? 'var(--photo-blank)' }}>
            {entry ? (
              <picture key={avifFailed ? 'webp' : 'avif'}>
                {avifFailed ? null : <source type="image/avif" srcSet={srcset('avif')} sizes={sizes} />}
                <source type="image/webp" srcSet={srcset('webp')} sizes={sizes} />
                <img
                  src={`/img/${entry.id}/${entry.widths.includes(960) ? 960 : entry.widths[entry.widths.length - 1]}.webp`}
                  alt={alt}
                  width={entry.width}
                  height={entry.height}
                  decoding="async"
                  onError={(e) => {
                    if (!avifFailed && e.currentTarget.currentSrc.endsWith('.avif')) setAvifFailed(true);
                  }}
                />
              </picture>
            ) : (
              <span className="photo-missing" role="img" aria-label={alt} />
            )}
          </div>
          <span className="tape tape--a" aria-hidden="true" />
          <span className="tape tape--b" aria-hidden="true" />
        </div>
        <figcaption className="photo-credit">
          {t('player.photo')}: {credit.who} ·{' '}
          {credit.licenseUrl ? (
            <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer license">
              {credit.license}
            </a>
          ) : (
            credit.license
          )}{' '}
          ·{' '}
          <a href={credit.fileUrl} target="_blank" rel="noopener noreferrer">
            {t('player.source')}
          </a>
        </figcaption>
      </figure>
    </div>
  );
}
