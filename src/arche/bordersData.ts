/**
 * Исторические границы: общие типы и чистые функции.
 *
 * Модуль работает в двух местах: в браузере (глобус, страницы заметок)
 * и в плагине Vite, который при сборке считает, чьей землёй было каждое
 * место хранилища. Поэтому здесь нет алиасов `@/` и обращений к DOM.
 *
 * Откуда данные — см. scripts/build-borders.mjs: Cliopatria (государства,
 * CC BY 4.0) и historical-basemaps (народы и культуры фоном, GPL-3.0).
 */
import { geoArea, geoBounds, geoContains } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';

/** Государство из индекса Cliopatria (короткие ключи — индекс грузится целиком) */
export interface PolityEntry {
  /** Английское название из набора, без скобок объединения */
  n: string;
  /** Первый и последний год, когда государство есть на карте */
  f: number;
  t: number;
  /** Объединение поверх других государств: «Священная Римская империя» над княжествами */
  u?: 1;
  /** Русское название из Wikidata */
  ru?: string;
  /** Элемент Wikidata */
  q?: string;
  /** Статья английской Википедии */
  w?: string;
  /** Статья русской Википедии */
  rw?: string;
  /** Индекс объединения, в которое входит */
  m?: number;
}

export interface BordersIndex {
  /** Хэш содержимого: файлы веков запрашиваются с ним, чтобы кэш не смешивал сборки */
  version: string;
  sources: { cliopatria: string; historicalBasemaps: string };
  /** Шаг нарезки, лет */
  chunk: number;
  /** Начальные годы веков, для которых есть файл */
  chunks: number[];
  /** Годы срезов фона */
  bg: number[];
  polities: PolityEntry[];
}

/** Название на отрезке лет: «Королевство Великобритания» до 1800-го, дальше иначе */
export interface NameRange {
  from?: number;
  to?: number;
  ru: string;
  note?: string;
}

/** Поправки к названиям из arche-vault/_borders/names.json */
export type NameOverrides = Record<string, string | NameRange[]>;

/** Заплатка из arche-vault/_borders/patches.geojson: государство, которого нет в наборе */
export interface PatchProperties {
  name: string;
  ru: string;
  from: number;
  to: number;
  /**
   * Государство из Cliopatria, которому на самом деле принадлежит этот
   * кусок земли. Набор знает Швейцарию, но отдал Женеву Франции — заплатка
   * с `polity: "Swiss Confederation"` возвращает город Швейцарии, и на глобусе
   * клик по Швейцарии найдёт заметки про Женеву
   */
  polity?: string;
  /**
   * Объединение, в которое входила эта земля: `"(Holy Roman Empire)"`.
   * Без поля объединений у заплатки нет — набор ошибся именно здесь,
   * и его объединениям в этом месте тоже верить нельзя
   */
  within?: string;
  /**
   * false — только для ответа «чья это земля», на карте не рисуется.
   * Оккупированная Греция и так закрашена Германией; квадрат «Греция под
   * оккупацией» поверх неё был бы враньём о границах ради правды в тексте
   */
  draw?: boolean;
  wikidata?: string;
  wikipedia?: string;
  ruwiki?: string;
  note?: string;
}

export type Area = Feature<Polygon | MultiPolygon>;

/** Ключ государства: как в Cliopatria, со скобками у объединений */
export function polityKey(entry: PolityEntry): string {
  return entry.u ? `(${entry.n})` : entry.n;
}

export function patchKey(name: string): string {
  return `patch:${name}`;
}

/** Русское название на год с учётом ручных поправок */
export function nameAt(
  overrides: NameOverrides,
  name: string,
  year: number,
  fallback?: string
): string {
  const override = overrides[name];
  if (typeof override === 'string') return override;
  if (Array.isArray(override)) {
    const range = override.find(
      (r) => (r.from ?? -Infinity) <= year && year <= (r.to ?? Infinity)
    );
    if (range) return range.ru;
  }
  return fallback ?? name;
}

/** Годы, с которых меняется название: по ним режутся отрезки «чья это земля» */
export function renameBreaks(overrides: NameOverrides, name: string): number[] {
  const override = overrides[name];
  if (!Array.isArray(override)) return [];
  return override.flatMap((r) => [
    ...(r.from !== undefined ? [r.from] : []),
    ...(r.to !== undefined ? [r.to + 1] : []),
  ]);
}

/**
 * Порядок обхода колец.
 *
 * d3-geo работает на сфере: внешнее кольцо для него обходит область по
 * часовой стрелке, а кольцо в обратную сторону означает «весь шар, кроме
 * этого полигона». Наборы границ этого не соблюдают — в обоих встречаются
 * оба порядка, и вывернутое государство накрывает полмира, а точка
 * в Афинах оказывается внутри империи Цинь. Поэтому каждый полигон
 * проверяем по площади: больше полушария — значит вывернут.
 */
export function rewind<T extends Area>(area: T): T {
  const fix = (rings: Position[][]): Position[][] =>
    geoArea({ type: 'Polygon', coordinates: rings }) > 2 * Math.PI
      ? rings.map((ring) => [...ring].reverse())
      : rings;

  const geometry = area.geometry;
  if (geometry.type === 'Polygon') {
    geometry.coordinates = fix(geometry.coordinates);
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates = geometry.coordinates.map(fix);
  }
  return area;
}

/** Дуглас — Пекер для одного кольца, в градусах */
function simplifyRing(ring: Position[], tolerance: number): Position[] {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, ring.length - 1]];
  const sq = tolerance * tolerance;

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    const [ax, ay] = ring[first];
    const [bx, by] = ring[last];
    const dx = bx - ax;
    const dy = by - ay;
    const length = dx * dx + dy * dy;
    let worst = -1;
    let worstAt = -1;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = ring[i];
      let t = length > 0 ? ((px - ax) * dx + (py - ay) * dy) / length : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > worst) {
        worst = d;
        worstAt = i;
      }
    }
    if (worst > sq) {
      keep[worstAt] = 1;
      stack.push([first, worstAt], [worstAt, last]);
    }
  }

  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}

/**
 * Грубая копия области для общего вида.
 *
 * На шаре во весь экран пиксель — это полтора десятка километров, а границы
 * упрощены до пяти: две трети точек проецируются впустую, и вращение
 * дёргается. Грубая копия считается один раз при загрузке века; острова
 * меньше допуска выбрасываются, но самый большой кусок остаётся всегда.
 */
export function coarsen(area: Area, tolerance: number): Area {
  const fixPolygon = (rings: Position[][]) => rings.map((ring) => simplifyRing(ring, tolerance));
  const extent = (ring: Position[]) => {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [x, y] of ring) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
    return Math.max(e - w, n - s);
  };

  const geometry = area.geometry;
  if (geometry.type === 'Polygon') {
    return { ...area, geometry: { type: 'Polygon', coordinates: fixPolygon(geometry.coordinates) } };
  }
  const polygons = geometry.coordinates;
  const sizes = polygons.map((p) => extent(p[0]));
  const largest = sizes.indexOf(Math.max(...sizes));
  const kept = polygons
    .filter((_, i) => i === largest || sizes[i] > tolerance * 2)
    .map(fixPolygon);
  return { ...area, geometry: { type: 'MultiPolygon', coordinates: kept } };
}

/** Охват [запад, юг, восток, север]; через антимеридиан — на всю долготу */
export function bboxOf(area: Area): [number, number, number, number] {
  const [[west, south], [east, north]] = geoBounds(area);
  return west > east ? [-180, south, 180, north] : [west, south, east, north];
}

const KM_PER_DEGREE = 111.2;

function segmentDistanceKm(
  [px, py]: [number, number],
  [ax, ay]: Position,
  [bx, by]: Position,
  scaleX: number
): number {
  // Плоское приближение с поправкой долготы на широту: на десятках
  // километров ошибка меньше, чем у самой упрощённой границы
  const x1 = (ax - px) * scaleX;
  const y1 = ay - py;
  const x2 = (bx - px) * scaleX;
  const y2 = by - py;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / length)) : 0;
  return Math.hypot(x1 + t * dx, y1 + t * dy) * KM_PER_DEGREE;
}

/**
 * Расстояние от точки до области, км; ноль — точка внутри.
 *
 * Нужно для побережья: упрощение срезает береговую линию на километры,
 * и портовый город оказывается в море — Гиппон без этого не принадлежал
 * бы никому.
 */
export function distanceKm(area: Area, point: [number, number]): number {
  if (geoContains(area, point)) return 0;

  const scaleX = Math.cos((point[1] * Math.PI) / 180);
  const polygons =
    area.geometry.type === 'Polygon' ? [area.geometry.coordinates] : area.geometry.coordinates;

  let best = Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        best = Math.min(best, segmentDistanceKm(point, ring[i - 1], ring[i], scaleX));
      }
    }
  }
  return best;
}

/** Устойчивый цвет государства: один и тот же во все века и на всех экранах */
export function hueOf(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}

/** Отрезок лет, когда место принадлежало одному государству */
export interface SovereigntySegment {
  f: number;
  t: number;
  /** Ключ государства (см. polityKey, patchKey); null — данных нет */
  k: string | null;
  /** Английское название */
  n?: string;
  ru?: string;
  /**
   * Откуда ответ: набор государств, ручная заплатка или фон с народами
   * и культурами — последний честнее называть «здесь жили», а не «здесь правили»
   */
  src?: 'clio' | 'patch' | 'bg';
  /** Объединение поверх: Священная Римская империя над курфюршеством */
  u?: { k: string; ru: string };
  /** Точка не внутри полигона, а рядом с ним — берег упрощённой границы */
  near?: 1;
  /** Заплатка без полигона на карте (draw: false): выбрать на глобусе нечего */
  nomap?: 1;
}

/** id места → отрезки «чья это земля», по возрастанию лет */
export type Sovereignty = Record<string, SovereigntySegment[]>;

export function segmentAt(
  segments: SovereigntySegment[] | undefined,
  year: number
): SovereigntySegment | null {
  if (!segments) return null;
  return segments.find((s) => s.f <= year && year <= s.t) ?? null;
}
