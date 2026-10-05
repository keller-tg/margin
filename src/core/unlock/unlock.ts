// When the day's pages open. Pure functions of the device's local wall-clock time.
// No server clock, no accounts: this is a ritual, not access control.

export const MORNING_OPENS_HOUR = 5;
export const EVENING_OPENS_HOUR = 17;

export type Slot = 'morning' | 'evening';

/** yyyy-mm-dd for the local calendar day of `now`. */
export function localDateKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type SlotState = { slot: Slot; open: boolean; opensAtHour: number };

export type DayState = {
  date: string;
  morning: SlotState;
  evening: SlotState;
};

export function dayState(now: Date): DayState {
  const h = now.getHours();
  return {
    date: localDateKey(now),
    morning: { slot: 'morning', open: h >= MORNING_OPENS_HOUR, opensAtHour: MORNING_OPENS_HOUR },
    evening: { slot: 'evening', open: h >= EVENING_OPENS_HOUR, opensAtHour: EVENING_OPENS_HOUR },
  };
}

/** Milliseconds until the next moment the day state changes (next unlock or midnight). */
export function msUntilNextChange(now: Date): number {
  const next = new Date(now);
  const h = now.getHours();
  if (h < MORNING_OPENS_HOUR) next.setHours(MORNING_OPENS_HOUR, 0, 0, 0);
  else if (h < EVENING_OPENS_HOUR) next.setHours(EVENING_OPENS_HOUR, 0, 0, 0);
  else next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}
