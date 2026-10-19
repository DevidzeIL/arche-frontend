/**
 * Физическая география под историей: реки, озёра, подписи морей, хребтов
 * и пустынь (Natural Earth, общественное достояние; собирается скриптом
 * scripts/build-geography.mjs в public/geo).
 *
 * И подробная суша — 1:50m вместо 1:110m: вблизи грубый берег рубит
 * государства, которые к нему обрезаются. Грузится, только когда приблизили.
 */
import { geoBounds } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { Feature, FeatureCollection, LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson';

export type GeoLabelKind = 'ocean' | 'sea' | 'range' | 'desert' | 'lake';

export interface GeoLabel {
  kind: GeoLabelKind;
  name: string;
  lon: number;
  lat: number;
  /** 0 — самое крупное: океаны, Средиземное море, Альпы */
  rank: number;
}

export interface River {
  feature: Feature<LineString | MultiLineString>;
  /** 1 — Нил и Амазонка, 6 — Темза, 7 — Тибр и Майн (из подробного набора) */
  rank: number;
  /** Подпись — только у одного, самого длинного куска реки */
  name: string | null;
  bbox: [number, number, number, number];
}

export interface Lake {
  feature: Feature<Polygon | MultiPolygon>;
  rank: number;
  bbox: [number, number, number, number];
}

export interface Geography {
  rivers: River[];
  lakes: Lake[];
  labels: GeoLabel[];
}

const boundsOf = (f: Feature): [number, number, number, number] => {
  const [[w, s], [e, n]] = geoBounds(f);
  return [w, s, e, n];
};

let geographyPromise: Promise<Geography | null> | null = null;

export function loadGeography(): Promise<Geography | null> {
  geographyPromise ??= Promise.all([
    fetch('/geo/water.json').then((r) => (r.ok ? r.json() : null)),
    fetch('/geo/labels.json').then((r) => (r.ok ? r.json() : null)),
  ])
    .then(([water, labels]: [Topology | null, { fields: string[]; rows: unknown[][] } | null]) => {
      if (!water || !labels) return null;
      const rivers = (feature(water, water.objects.rivers) as unknown as FeatureCollection<LineString | MultiLineString>).features
        .filter((f) => f.geometry)
        .map((f) => ({
          feature: f,
          rank: Number(f.properties?.r ?? 9),
          name: (f.properties?.n as string | null) ?? null,
          bbox: boundsOf(f),
        }));
      const lakes = (feature(water, water.objects.lakes) as unknown as FeatureCollection<Polygon | MultiPolygon>).features
        .filter((f) => f.geometry)
        .map((f) => ({ feature: f, rank: Number(f.properties?.r ?? 9), bbox: boundsOf(f) }));
      const geoLabels = labels.rows.map(([kind, name, lon, lat, rank]) => ({
        kind: kind as GeoLabelKind,
        name: String(name),
        lon: Number(lon),
        lat: Number(lat),
        rank: Number(rank),
      }));
      return { rivers, lakes, labels: geoLabels };
    })
    .catch(() => null);
  return geographyPromise;
}

let detailedLand: Promise<FeatureCollection<MultiPolygon> | null> | null = null;

/** Суша 1:50m — отдельным куском сборки, только когда приблизили */
export function loadDetailedLand(): Promise<FeatureCollection<MultiPolygon> | null> {
  detailedLand ??= import('world-atlas/land-50m.json')
    .then((module): FeatureCollection<MultiPolygon> => {
      const world = (module.default ?? module) as unknown as Topology;
      const land = feature(world, world.objects.land) as unknown as FeatureCollection<MultiPolygon> | Feature<MultiPolygon>;
      return land.type === 'FeatureCollection' ? land : { type: 'FeatureCollection', features: [land] };
    })
    .catch(() => null);
  return detailedLand;
}
