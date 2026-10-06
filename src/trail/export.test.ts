import { describe, expect, it } from 'vitest';
import { trailText } from './export';

describe('trail as text', () => {
  it('lists the way with one line each and links every exact revision', () => {
    const text = trailText({
      lang: 'de',
      heading: 'Spur',
      date: '8. Okt.',
      from: { title: 'Falklandinseln', description: '', revid: 10 },
      stops: [{ title: 'Grosse Strasse', description: 'Strasse', revid: 11 }],
      credit: 'Text: Wikipedia, CC BY-SA 4.0',
    });
    expect(text.split('\n')).toEqual([
      'Spur · 8. Okt.',
      '',
      'Falklandinseln',
      '→ Grosse Strasse (Strasse)',
      '',
      'Text: Wikipedia, CC BY-SA 4.0',
      'Falklandinseln: https://de.wikipedia.org/w/index.php?title=Falklandinseln&oldid=10',
      'Grosse Strasse: https://de.wikipedia.org/w/index.php?title=Grosse_Strasse&oldid=11',
    ]);
  });
});
