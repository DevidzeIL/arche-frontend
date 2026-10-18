/**
 * Границы в браузере: века подгружаются по требованию, выборка — на год.
 *
 * Весь набор — 2 МБ в gzip, а смотрят обычно на одну эпоху. Поэтому
 * границы нарезаны по векам (public/borders/c/<век>.json), и глобус тянет
 * только тот век, на который выставлен ползунок, плюс следующий — чтобы
 * при проигрывании истории граница не мигала на смене столетия.
 *
 * Как устроены данные и откуда они — см. bordersData.ts и
 * scripts/build-borders.mjs. Чья земля была у каждого города — считается
 * при сборке (vite/borders.ts) и лежит в `sovereignty`.
 */
import { useEffect, useMemo, useState } from 'react';
import { feature } from 'topojson-client';
import { geoArea, geoCentroid, geoContains } from 'd3-geo';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { names, patches } from 'virtual:arche-borders';
import {
  bboxOf,
  coarsen,
  hueOf,
  nameAt,
  patchKey,
  polityKey,
  rewind,
  type Area,
  type BordersIndex,
  type PatchProperties,
  type PolityEntry,
} from './bordersData';

export { polityOfPlace, sovereigntyTimeline, wikipediaUrl } from './sovereignty';

const BASE = '/borders';

/**
 * Допуск грубой копии, градусы: ~13 км. На шаре во весь экран это меньше
 * пикселя, а точек втрое меньше, чем в исходной геометрии
 */
export const COARSE_TOLERANCE = 0.12;
/** Для движения: пока шар крутится, деталей всё равно не разглядеть */
export const MOTION_TOLERANCE = 0.25;

/** Полигон государства на отрезке лет */
export interface StateShape {
  key: string;
  /** Английское название: по нему ищутся поправки в names.json */
  name: string;
  /** Русское название из Wikidata или заплатки — до поправок */
  baseRu?: string;
  union: boolean;
  from: number;
  to: number;
  area: Area;
  /** Та же область, упрощённая для общего вида — см. coarsen */
  coarse: Area;
  /** Ещё грубее — пока шар вращается */
  motion: Area;
  bbox: [number, number, number, number];
  /** Площадь в стерадианах: подпись помещается, только если государство крупное */
  size: number;
  /** Куда ставить подпись: центр самого большого куска, а не всего государства */
  label: [number, number];
  hue: number;
  source: 'clio' | 'patch';
  polity?: PolityEntry;
  patch?: PatchProperties;
}

/** Народ или культура из фона: там, где государств ещё нет */
export interface BackgroundShape {
  name: string;
  ru?: string;
  area: Area;
  coarse: Area;
  motion: Area;
  bbox: [number, number, number, number];
  size: number;
  label: [number, number];
}

function labelPoint(area: Area): [number, number] {
  if (area.geometry.type === 'Polygon') return geoCentroid(area) as [number, number];
  // У Османской империи центр всей фигуры может оказаться в море,
  // а у Британской — вовсе посреди океана
  let best: Position[][] = area.geometry.coordinates[0];
  let bestArea = -1;
  for (const polygon of area.geometry.coordinates) {
    const size = geoArea({ type: 'Polygon', coordinates: polygon });
    if (size > bestArea) {
      bestArea = size;
      best = polygon;
    }
  }
  return geoCentroid({ type: 'Polygon', coordinates: best }) as [number, number];
}

function readAreas(topology: Topology): Area[] {
  const object = Object.values(topology.objects)[0] as GeometryCollection;
  const collection = feature(topology, object) as unknown as FeatureCollection<
    Polygon | MultiPolygon
  >;
  return collection.features.filter((f) => f.geometry).map((f) => rewind(f));
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json() as Promise<T>;
}

let indexPromise: Promise<BordersIndex | null> | null = null;

/** Индекс государств; null — границы не собраны (pnpm borders) */
export function loadBordersIndex(): Promise<BordersIndex | null> {
  indexPromise ??= fetchJson<BordersIndex>(`${BASE}/index.json`).catch(() => null);
  return indexPromise;
}

const centuries = new Map<number, Promise<StateShape[]>>();

export function loadCentury(from: number): Promise<StateShape[]> {
  let promise = centuries.get(from);
  if (!promise) {
    promise = loadBordersIndex()
      .then(async (index) => ({
        index,
        topology: await fetchJson<Topology>(`${BASE}/c/${from}.json?v=${index?.version ?? ''}`),
      }))
      .then(({ index, topology }) =>
        readAreas(topology).map((area) => {
          const { p, f, t } = area.properties as { p: number; f: number; t: number };
          const polity = index?.polities[p];
          return {
            key: polity ? polityKey(polity) : String(p),
            name: polity?.n ?? String(p),
            baseRu: polity?.ru,
            union: polity?.u === 1,
            from: f,
            to: t,
            area,
            coarse: coarsen(area, COARSE_TOLERANCE),
            motion: coarsen(area, MOTION_TOLERANCE),
            bbox: bboxOf(area),
            size: geoArea(area),
            label: labelPoint(area),
            hue: hueOf(polity?.n ?? String(p)),
            source: 'clio' as const,
            polity,
          };
        })
      )
      .catch((error) => {
        // Неудачную загрузку не запоминаем: следующая попытка пойдёт в сеть
        centuries.delete(from);
        throw error;
      });
    centuries.set(from, promise);
  }
  return promise;
}

let patchShapes: StateShape[] | null = null;

/** Заплатки из хранилища: государства, которых в наборе нет или которые он путает */
function loadPatches(): StateShape[] {
  patchShapes ??= patches.features
    // draw: false — заплатка только для текста «чья это земля»
    .filter((f) => f.geometry && f.properties.draw !== false)
    .map((f) => {
      const area = rewind(structuredClone(f) as Area);
      const key = f.properties.polity ?? patchKey(f.properties.name);
      return {
        key,
        name: f.properties.name,
        baseRu: f.properties.ru,
        union: false,
        from: f.properties.from,
        to: f.properties.to,
        area,
        // Заплатки и так грубые — упрощать их нечего
        coarse: area,
        motion: area,
        bbox: bboxOf(area),
        size: geoArea(area),
        label: labelPoint(area),
        // Женева в Швейцарии — цвета Швейцарии, а не своего
        hue: hueOf(f.properties.polity?.replace(/^\((.*)\)$/, '$1') ?? f.properties.name),
        source: 'patch' as const,
        patch: f.properties,
      };
    });
  return patchShapes;
}

const backgrounds = new Map<number, Promise<BackgroundShape[]>>();

export function loadBackground(year: number): Promise<BackgroundShape[]> {
  let promise = backgrounds.get(year);
  if (!promise) {
    promise = loadBordersIndex()
      .then((index) => fetchJson<Topology>(`${BASE}/bg/${year}.json?v=${index?.version ?? ''}`))
      .then((topology) =>
        readAreas(topology).map((area) => {
          const { n, r } = area.properties as { n: string; r?: string };
          return {
            name: n,
            ru: r,
            area,
            coarse: coarsen(area, COARSE_TOLERANCE * 1.5),
            motion: coarsen(area, MOTION_TOLERANCE * 1.5),
            bbox: bboxOf(area),
            size: geoArea(area),
            label: labelPoint(area),
          };
        })
      )
      .catch((error) => {
        backgrounds.delete(year);
        throw error;
      });
    backgrounds.set(year, promise);
  }
  return promise;
}

export function centuryOf(year: number, step = 100): number {
  return Math.floor(year / step) * step;
}

/** Срез фона, действующий в этот год: последний не позже него */
export function backgroundYearFor(index: BordersIndex, year: number): number | null {
  let found: number | null = null;
  for (const snapshot of index.bg) {
    if (snapshot <= year) found = snapshot;
    else break;
  }
  return found;
}

/** Название на год с поправками из arche-vault/_borders/names.json */
export function stateName(shape: Pick<StateShape, 'name' | 'baseRu'>, year: number): string {
  return nameAt(names, shape.name, year, shape.baseRu);
}

/** Государство в точке: сначала заплатки, из подходящих — самое маленькое */
export function stateAt(
  states: StateShape[],
  point: [number, number]
): StateShape | null {
  let best: StateShape | null = null;
  for (const shape of states) {
    if (shape.union) continue;
    const [w, s, e, n] = shape.bbox;
    if (point[0] < w || point[0] > e || point[1] < s || point[1] > n) continue;
    if (!geoContains(shape.area, point)) continue;
    if (
      !best ||
      (shape.source === 'patch' && best.source !== 'patch') ||
      (shape.source === best.source && shape.size < best.size)
    ) {
      best = shape;
    }
  }
  return best;
}

export interface BordersAt {
  /** Государства, у которых строка набора действует в этот год */
  states: StateShape[];
  background: BackgroundShape[];
  index: BordersIndex | null;
  /** Данные ещё грузятся или границы не собраны */
  ready: boolean;
}

/**
 * Границы на год. Пока грузится новый век, показываются границы прошлого:
 * мигнуть пустой картой на каждой смене столетия хуже, чем на полсекунды
 * показать устаревшие.
 */
export function useBordersAt(
  year: number,
  { states: wantStates = true, background: wantBackground = true } = {}
): BordersAt {
  const [index, setIndex] = useState<BordersIndex | null>(null);
  const [century, setCentury] = useState<{ from: number; shapes: StateShape[] } | null>(null);
  const [background, setBackground] = useState<BackgroundShape[]>([]);

  const rounded = Math.round(year);
  const centuryFrom = centuryOf(rounded, index?.chunk);

  useEffect(() => {
    let alive = true;
    loadBordersIndex().then((loaded) => alive && setIndex(loaded));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!index || !wantStates) return;
    if (!index.chunks.includes(centuryFrom)) {
      setCentury({ from: centuryFrom, shapes: [] });
      return;
    }
    let alive = true;
    loadCentury(centuryFrom)
      .then((shapes) => alive && setCentury({ from: centuryFrom, shapes }))
      .catch(() => alive && setCentury({ from: centuryFrom, shapes: [] }));
    // Следующий век — заранее: проигрывание истории дойдёт до него через секунды
    const next = centuryFrom + index.chunk;
    if (index.chunks.includes(next)) loadCentury(next).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [index, centuryFrom, wantStates]);

  const backgroundYear = index ? backgroundYearFor(index, rounded) : null;
  useEffect(() => {
    if (!wantBackground || backgroundYear === null) {
      setBackground([]);
      return;
    }
    let alive = true;
    loadBackground(backgroundYear)
      .then((shapes) => alive && setBackground(shapes))
      .catch(() => alive && setBackground([]));
    return () => {
      alive = false;
    };
  }, [backgroundYear, wantBackground]);

  const states = useMemo(() => {
    if (!century || !wantStates) return [];
    const all = [...century.shapes, ...loadPatches()];
    return all.filter((shape) => shape.from <= rounded && rounded <= shape.to);
  }, [century, rounded, wantStates]);

  return { states, background, index, ready: index !== null && century !== null };
}
