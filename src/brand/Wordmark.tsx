import paths from './wordmark-paths.json';
import { BRAND } from './brand.config';

const PAD = 4; // viewBox units (font size 100) around the ink so strokes never clip

/**
 * The "margin" wordmark: Caveat outlines (no font loading needed), sitting on a rule.
 * `rules` is how many rules tall the line box is; the word's baseline lands on its last rule.
 * `withLine` draws the brand's single margin line beside the word (for standalone use).
 */
export function Wordmark({ rules = 3, size = 'calc(var(--rule) * 2)', withLine = false }: { rules?: number; size?: string; withLine?: boolean }) {
  const { x1, y1, x2, y2, d } = paths.word;
  const lineX = x1 - 16;
  const vx = (withLine ? lineX - 2 : x1) - PAD;
  const vy = y1 - PAD;
  const vw = x2 - vx + PAD;
  const vh = y2 - y1 + PAD * 2;
  const ascentEm = -vy / 100; // from the top of the viewBox to the baseline, in em of `size`
  return (
    <div
      className="wordmark"
      style={{ height: `calc(${rules} * var(--rule))`, ['--wm-size' as string]: size }}
    >
      <svg
        role="img"
        aria-label={BRAND.wordmarkText}
        viewBox={`${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`}
        style={{
          height: `calc(var(--wm-size) * ${(vh / 100).toFixed(4)})`,
          top: `calc(${rules - 1} * var(--rule) + var(--rule-offset) - var(--wm-size) * ${ascentEm.toFixed(4)})`,
          marginLeft: `calc(var(--wm-size) * ${((vx - x1) / 100).toFixed(4)})`,
        }}
      >
        <title>{BRAND.wordmarkText}</title>
        {withLine ? <line x1={lineX} x2={lineX} y1={vy} y2={vy + vh} className="wordmark-line" /> : null}
        <path d={d} fill="currentColor" />
      </svg>
    </div>
  );
}
