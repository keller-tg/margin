// Pre-projected map sketches (plan §3): Natural Earth coastlines (public domain, via world-atlas, ISC)
// projected at build time with d3-geo. The browser gets a few SVG path strings and draws them like pen
// strokes; no map library ships to visitors.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoAzimuthalEqualArea, geoPath } from 'd3-geo';
import { mesh } from 'topojson-client';
import type { MapData } from '../../../src/core/schema/thing';

export const MAP_W = 600;
export const MAP_H = 420;

const require = createRequire(import.meta.url);
let coast: GeoJSON.MultiLineString | null = null;
function coastline(): GeoJSON.MultiLineString {
  if (!coast) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topo = JSON.parse(readFileSync(require.resolve('world-atlas/land-50m.json'), 'utf8')) as any;
    coast = mesh(topo, topo.objects.land) as GeoJSON.MultiLineString;
  }
  return coast;
}

/**
 * A map around a point. `radiusKm` is the half-height of the wide view; `zoom` how much closer the final
 * view (zoomBox) is. Coastlines are lines, not filled shapes, so clipping never draws a frame edge.
 * No country borders on purpose: many are disputed, and a calm notebook should not take sides by drawing them.
 */
export function projectMap(lat: number, lon: number, radiusKm: number, zoom: number): MapData {
  const d = radiusKm / 6371; // angular radius
  const scale = MAP_H / 2 / (2 * Math.sin(d / 2)); // azimuthal equal-area: r = 2·R·sin(d/2)
  const projection = geoAzimuthalEqualArea()
    .rotate([-lon, -lat])
    .scale(scale)
    .translate([MAP_W / 2, MAP_H / 2])
    .clipExtent([[-2, -2], [MAP_W + 2, MAP_H + 2]])
    .precision(0.6);
  const path = geoPath(projection).digits(0);
  const raw = path(coastline()) ?? '';
  // split into strokes, drop crumbs smaller than a few pixels, drop repeated points
  const strokes = raw
    .split(/(?=M)/)
    .map((s) => dedupe(s))
    .filter((s) => strokeSize(s) >= 6);
  const [px, py] = projection([lon, lat])!;
  const zw = MAP_W / zoom;
  const zh = MAP_H / zoom;
  const zx = clamp(px - zw / 2, 0, MAP_W - zw);
  const zy = clamp(py - zh / 2, 0, MAP_H - zh);
  // zoom in only if the closer view has coastline in it (inland places and tiny islands would be an empty box)
  const inside = strokes.reduce((n, st) => n + points(st).filter(([x, y]) => x >= zx && x <= zx + zw && y >= zy && y <= zy + zh).length, 0);
  const zoomBox = inside >= 12 ? `${round(zx)} ${round(zy)} ${round(zw)} ${round(zh)}` : `0 0 ${MAP_W} ${MAP_H}`;
  return {
    viewBox: `0 0 ${MAP_W} ${MAP_H}`,
    zoomBox,
    paths: strokes,
    point: [round(px), round(py)],
  };
}

const round = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function points(s: string): [number, number][] {
  return [...s.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}
function strokeSize(s: string): number {
  const pts = points(s);
  if (pts.length < 2) return 0;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}
function dedupe(s: string): string {
  const pts = points(s);
  const out: [number, number][] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  const closed = /Z\s*$/.test(s);
  return out.length ? `M${out.map((p) => `${p[0]},${p[1]}`).join('L')}${closed ? 'Z' : ''}` : '';
}

/** How wide a view suits a topic: countries and seas need more room than a city or a building. */
export function mapScale(domain: string): { radiusKm: number; zoom: number } {
  if (domain === 'places' || domain === 'water') return { radiusKm: 2600, zoom: 1.6 };
  if (domain === 'islands') return { radiusKm: 1500, zoom: 2.4 };
  return { radiusKm: 1300, zoom: 3 }; // cities, buildings, landscapes, people's places
}
