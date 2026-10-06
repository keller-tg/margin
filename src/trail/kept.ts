// Trails the reader chose to keep: on this device only (localStorage), like margin notes. The Notebook
// (milestone f) lists them. Every read and write is guarded.
import type { Lang } from '../core/typography/typography';

export const TRAILS_KEY = 'margin.trails.v1';

export type KeptStop = { title: string; description: string; revid: number };
export type KeptTrail = { lang: Lang; date: string; from: string; stops: KeptStop[]; keptAt: string };

export const trailKey = (lang: string, date: string) => `${lang}:${date}`;

function readAll(): Record<string, KeptTrail> {
  try {
    const raw = localStorage.getItem(TRAILS_KEY);
    const data = raw ? (JSON.parse(raw) as unknown) : {};
    return data && typeof data === 'object' ? (data as Record<string, KeptTrail>) : {};
  } catch {
    return {};
  }
}

export function loadTrail(key: string): KeptTrail | undefined {
  const t = readAll()[key];
  return t && Array.isArray(t.stops) ? t : undefined;
}

/** Keep (or replace) the trail for this day. Returns false if storage is unavailable. */
export function keepTrail(trail: KeptTrail): boolean {
  try {
    const all = readAll();
    all[trailKey(trail.lang, trail.date)] = trail;
    localStorage.setItem(TRAILS_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}
