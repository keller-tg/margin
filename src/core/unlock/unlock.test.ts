import { describe, expect, it } from 'vitest';
import { dayState, localDateKey, msUntilNextChange } from './unlock';

const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m, 0, 0); // 6 Oct 2026, local time

describe('dayState', () => {
  it('nothing is open before 05:00', () => {
    const s = dayState(at(4, 59));
    expect(s.morning.open).toBe(false);
    expect(s.evening.open).toBe(false);
  });
  it('morning opens at 05:00 sharp', () => {
    expect(dayState(at(5, 0)).morning.open).toBe(true);
    expect(dayState(at(5, 0)).evening.open).toBe(false);
  });
  it('evening opens at 17:00 and both stay open until midnight', () => {
    expect(dayState(at(16, 59)).evening.open).toBe(false);
    const late = dayState(at(23, 59));
    expect(late.morning.open && late.evening.open).toBe(true);
    expect(late.date).toBe('2026-10-06');
  });
  it('a new day starts closed', () => {
    const s = dayState(new Date(2026, 9, 7, 0, 1));
    expect(s.date).toBe('2026-10-07');
    expect(s.morning.open).toBe(false);
  });
});

describe('localDateKey', () => {
  it('pads months and days', () => {
    expect(localDateKey(new Date(2026, 0, 3, 12))).toBe('2026-01-03');
  });
});

describe('msUntilNextChange', () => {
  it('counts to the next unlock or midnight', () => {
    expect(msUntilNextChange(at(4, 30))).toBe(30 * 60_000);
    expect(msUntilNextChange(at(16, 0))).toBe(60 * 60_000);
    expect(msUntilNextChange(at(23, 0))).toBe(60 * 60_000);
  });
});
