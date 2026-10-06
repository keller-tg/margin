import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { PaperType } from '../theme/prefs';

/**
 * One sheet of notebook paper: grain, rules (aligned to the handwriting baseline), the margin line,
 * and a writing column right of the margin. Everything in Margin is written on one of these.
 */
export function Sheet({ paper, margin, fill = false, as = 'main', children }: { paper: PaperType; margin?: ReactNode; fill?: boolean; as?: 'main' | 'div'; children: ReactNode }) {
  const sheet = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);

  // Grid and dot papers align their columns to the margin line (its x depends on the viewport).
  useLayoutEffect(() => {
    const s = sheet.current;
    const l = line.current;
    if (!s || !l) return;
    const sync = () => s.style.setProperty('--phase-x', `${l.offsetLeft}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(s);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={sheet} className="sheet" data-paper={paper}>
      <div ref={line} className="margin-line" aria-hidden="true" />
      {margin ? <aside className="margin-notes">{margin}</aside> : null}
      {as === 'main' ? (
        <main className={fill ? 'column column--fill' : 'column'}>{children}</main>
      ) : (
        <div className={fill ? 'column column--fill' : 'column'}>{children}</div>
      )}
    </div>
  );
}
