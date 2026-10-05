import { describe, expect, it } from 'vitest';
import { findNumbers, findPeriods, romanToInt } from './numbers';

describe('findNumbers', () => {
  it('reads local formats', () => {
    expect(findNumbers('It is 8,849 metres high.', 'en')[0]).toMatchObject({ value: 8849, unit: 'metres', isYear: false });
    expect(findNumbers('Er ist 4.478 m hoch.', 'de')[0]).toMatchObject({ value: 4478, unit: 'm' });
    expect(findNumbers('Höhe 4’478 m', 'de')[0]?.value).toBe(4478);
    expect(findNumbers('une tour de 330 m et 7 300 tonnes', 'fr').map((h) => h.value)).toEqual([330, 7300]);
    expect(findNumbers('Es wiegt 2,5 kg.', 'de')[0]?.value).toBe(2.5);
  });
  it('applies scale words', () => {
    expect(findNumbers('about 8.1 billion people', 'en')[0]?.value).toBe(8.1e9);
    expect(findNumbers('rund 83 Millionen Einwohner', 'de')[0]?.value).toBe(83e6);
  });
  it('flags years', () => {
    expect(findNumbers('Built in 1889.', 'en')[0]?.isYear).toBe(true);
    expect(findNumbers('It has 1889 rooms.', 'en')[0]?.isYear).toBe(true); // ambiguous on purpose: treated as a year
    expect(findNumbers('1,889 m', 'en')[0]?.isYear).toBe(false);
  });
  it('offers every locale reading to the verifier', () => {
    expect(findNumbers('1.234', 'en')[0]?.readings).toEqual(expect.arrayContaining([1.234, 1234]));
  });
});

describe('periods', () => {
  it('finds centuries and decades in all three languages', () => {
    expect(findPeriods('in the 19th century').map((p) => p.value)).toEqual([19]);
    expect(findPeriods('im 19. Jahrhundert').map((p) => p.value)).toEqual([19]);
    expect(findPeriods('au XIXe siècle').map((p) => p.value)).toEqual([19]);
    expect(findPeriods('the 1870s, die 1870er, les années 1870').map((p) => p.value)).toEqual([1870, 1870, 1870]);
    expect(romanToInt('XIV')).toBe(14);
  });
});
