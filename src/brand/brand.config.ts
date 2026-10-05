// Single source for the product's name and voice. Renaming Margin should only touch this file
// (plus the generated wordmark outlines: re-run `npm run fonts:build` after changing `wordmarkText`).
import type { Lang } from '../core/typography/typography';

export const BRAND = {
  name: 'Margin',
  wordmarkText: 'margin',
  tagline: {
    en: 'Learn one real thing. Then close the notebook.',
    de: 'Eine echte Sache lernen. Dann das Heft zuklappen.',
    fr: 'Apprendre une vraie chose. Puis refermer le carnet.',
  } satisfies Record<Lang, string>,
  repoUrl: 'https://github.com/keller-tg/margin',
} as const;
