// Margin notes: one line a reader may write at the end of an evening. Stored on this device only
// (localStorage); the Notebook (milestone f) shows them. Every read/write is guarded.
export const NOTES_KEY = 'margin.notes.v1';
export const NOTE_MAX = 90;

export type Note = { text: string; topic: string; savedAt: string };
type Notes = Record<string, Note>;

export const noteKey = (lang: string, date: string, slot: string) => `${lang}:${date}:${slot}`;

function readAll(): Notes {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    const data = raw ? (JSON.parse(raw) as unknown) : {};
    return data && typeof data === 'object' ? (data as Notes) : {};
  } catch {
    return {};
  }
}

export function loadNote(key: string): Note | undefined {
  const n = readAll()[key];
  return n && typeof n.text === 'string' ? n : undefined;
}

/** Save (or, with empty text, remove) a note. Returns false if storage is unavailable. */
export function saveNote(key: string, text: string, topic: string): boolean {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
  try {
    const all = readAll();
    if (clean) all[key] = { text: clean, topic, savedAt: new Date().toISOString() };
    else delete all[key];
    localStorage.setItem(NOTES_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}
