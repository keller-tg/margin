// Loading a day's thing and the image manifest. Both are static files on Margin's own origin.
import { useEffect, useState } from 'react';
import type { Credit } from '../core/license/license';
import type { Slot, Thing } from '../core/schema/thing';
import type { Lang } from '../core/typography/typography';

export type ManifestEntry = {
  id: string;
  file: string;
  width: number;
  height: number;
  widths: number[];
  formats: ('avif' | 'webp')[];
  color: string;
  credit: Credit;
};
export type Manifest = Record<string, ManifestEntry>;

let manifestPromise: Promise<Manifest> | null = null;
/** /img/manifest.json, loaded once. An empty manifest (images not built) degrades to text-only photos. */
export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch('/img/manifest.json')
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : {}))
    .catch(() => ({}));
  return manifestPromise;
}

export type ThingState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; thing: Thing; manifest: Manifest };

const thingCache = new Map<string, Promise<Thing | null>>();
export function loadThing(lang: Lang, date: string, slot: Slot): Promise<Thing | null> {
  const key = `${lang}/${date}.${slot}`;
  if (!thingCache.has(key)) {
    thingCache.set(
      key,
      fetch(`/daily/${key}.json`)
        .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? (r.json() as Promise<Thing>) : null))
        .catch(() => null),
    );
  }
  return thingCache.get(key)!;
}

export function useThing(lang: Lang, date: string, slot: Slot): ThingState {
  const [state, setState] = useState<ThingState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    Promise.all([loadThing(lang, date, slot), loadManifest()]).then(([thing, manifest]) => {
      if (!live) return;
      setState(thing ? { status: 'ready', thing, manifest } : { status: 'missing' });
    });
    return () => {
      live = false;
    };
  }, [lang, date, slot]);
  return state;
}
