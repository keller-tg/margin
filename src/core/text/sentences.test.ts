import { describe, expect, it } from 'vitest';
import { countWords, splitSentences } from './sentences';

describe('countWords', () => {
  it('counts tokens with a letter or digit', () => {
    expect(countWords('l’œuvre de 1,024 pages – voilà')).toBe(5);
  });
});

describe('splitSentences', () => {
  it('en: abbreviations, initials, decimals', () => {
    expect(splitSentences('J. S. Bach was born in 1685. He wrote c. 1,100 works, e.g. the Mass. It is 3.5 m tall.', 'en')).toEqual([
      'J. S. Bach was born in 1685.', 'He wrote c. 1,100 works, e.g. the Mass.', 'It is 3.5 m tall.',
    ]);
  });
  it('de: ordinals and abbreviations', () => {
    expect(splitSentences('Er starb am 5. Mai 1821 in St. Helena. Das war im 19. Jahrhundert, z. B. Ende. Sie lebte ca. 80 Jahre.', 'de')).toEqual([
      'Er starb am 5. Mai 1821 in St. Helena.', 'Das war im 19. Jahrhundert, z. B. Ende.', 'Sie lebte ca. 80 Jahre.',
    ]);
  });
  it('fr: av. J.-C. and M.', () => {
    expect(splitSentences('Fondée vers 600 av. J.-C. par des Grecs. M. Dupont y vit. Elle compte env. 800 habitants.', 'fr')).toEqual([
      'Fondée vers 600 av. J.-C. par des Grecs.', 'M. Dupont y vit.', 'Elle compte env. 800 habitants.',
    ]);
  });
});
