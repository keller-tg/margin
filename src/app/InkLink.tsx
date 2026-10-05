import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { arrowPath, underlinePath } from '../ink/handLine';

/** A link written in ink, with a hand-drawn underline (optionally ending in an arrow). */
export function InkLink({ to, children, arrow = false, seed = 2, width = 100 }: { to: string; children: ReactNode; arrow?: boolean; seed?: number; width?: number }) {
  const d = useMemo(() => (arrow ? arrowPath(width, seed) : underlinePath(width, seed)), [arrow, seed, width]);
  return (
    <Link to={to} className="ink-link ink-link--underlined">
      {children}
      <svg className="ink-underline" viewBox={`-6 -10 ${width + 16} 20`} preserveAspectRatio="none" aria-hidden="true">
        <path d={d} vectorEffect="non-scaling-stroke" />
      </svg>
    </Link>
  );
}
