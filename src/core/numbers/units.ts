// Length units, for comparing sizes on compare pages. Used only to scale the drawing:
// the text always shows each value in its own source's words ("Text never converts units", plan §6).

const TO_METRES: Record<string, number> = {
  mm: 0.001, millimetres: 0.001, millimeters: 0.001,
  cm: 0.01, centimetres: 0.01, centimeters: 0.01, 'centimètres': 0.01,
  m: 1, metre: 1, metres: 1, meter: 1, meters: 1, 'mètre': 1, 'mètres': 1,
  km: 1000, kilometre: 1000, kilometres: 1000, kilometer: 1000, kilometers: 1000, 'kilomètre': 1000, 'kilomètres': 1000,
};

/** Metres per unit, or null if the unit is not a metric length. */
export function metresPer(unit: string | undefined): number | null {
  return unit ? (TO_METRES[unit.toLowerCase()] ?? null) : null;
}

export function inMetres(value: number, unit: string | undefined): number | null {
  const k = metresPer(unit);
  return k === null ? null : value * k;
}
