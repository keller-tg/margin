// Ruled-line baseline math. Mirrors the calc() expressions in tokens.css (kept in sync by baseline.test.ts).
//
// In CSS, a line box of height L holding text of font size S whose (used) ascent/descent are A/D (in em)
// places the baseline at:   half-leading + A·S  =  L/2 + (A − D)·S/2   from the top of the line box.
//
// Paper rules repeat every R px. A block of "ink" with line-height n·R should sit with each line's
// baseline on the LAST rule of its line box, so a two-rule title writes on the same lines as body text.

import metrics from './font-metrics.json';

export type FontMetrics = { ascent: number; descent: number };

/** Baseline position measured from the top of a line box. */
export function baselineInLineBox(lineHeight: number, fontSize: number, m: FontMetrics): number {
  return lineHeight / 2 + ((m.ascent - m.descent) * fontSize) / 2;
}

/** Where the rule sits inside each rule band (from the band's top): the baseline of one-rule body text. */
export function ruleOffset(rule: number, bodySize: number, m: FontMetrics): number {
  return baselineInLineBox(rule, bodySize, m);
}

/**
 * Vertical shift to apply to a block with line-height = n rules and font size `size`
 * so its baselines land on rules, given rules sit at `ruleOffset` inside each band.
 */
export function inkShift(rule: number, n: number, size: number, bodySize: number, m: FontMetrics): number {
  const target = (n - 1) * rule + ruleOffset(rule, bodySize, m);
  return target - baselineInLineBox(n * rule, size, m);
}

export const HAND_METRICS = {
  caveat: metrics.Caveat,
  playpen: metrics['Playpen Sans'],
} satisfies Record<string, FontMetrics>;
