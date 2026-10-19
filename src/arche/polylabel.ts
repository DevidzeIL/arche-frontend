/**
 * Полюс недоступности: точка внутри многоугольника, дальше всего от его краёв.
 *
 * Туда атласы и ставят название страны. Центр тяжести для этого не годится:
 * у вогнутой фигуры он оказывается снаружи — «Османская империя» вставала
 * посреди Средиземного моря, а подпись Чили — в Тихом океане.
 *
 * Алгоритм — перебор клеток с отсечением (как в mapbox/polylabel): делим
 * рамку на клетки, клетку дробим, только если в ней может найтись точка
 * дальше уже найденной. Долготы сжаты на косинус широты — иначе у северных
 * стран «дальше всего от краёв» считалось бы в искажённых градусах.
 */
import type { Position } from 'geojson';

interface Cell {
  x: number;
  y: number;
  /** Половина стороны клетки */
  h: number;
  /** Расстояние от центра до края фигуры (минус — снаружи) */
  d: number;
  /** Сколько максимум может быть внутри клетки */
  max: number;
}

function segmentDistance(px: number, py: number, a: number[], b: number[]): number {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

/** Со знаком: внутри фигуры — положительное расстояние до ближайшего края */
function pointToPolygon(x: number, y: number, rings: number[][][]): number {
  let inside = false;
  let min = Infinity;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      min = Math.min(min, segmentDistance(x, y, a, b));
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(min);
}

export function polylabel(polygon: Position[][], precisionRatio = 0.02): [number, number] {
  const outer = polygon[0];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of outer) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  // Сжимаем долготы на косинус средней широты: градус долготы у Белого моря вдвое короче
  const k = Math.max(0.2, Math.cos((((minY + maxY) / 2) * Math.PI) / 180));
  const rings = polygon.map((ring) => ring.map(([x, y]) => [x * k, y]));
  const left = minX * k;
  const width = (maxX - minX) * k;
  const height = maxY - minY;
  const size = Math.min(width, height);
  if (size === 0) return [minX, minY];
  const precision = Math.max(size * precisionRatio, 1e-4);

  const make = (x: number, y: number, h: number): Cell => {
    const d = pointToPolygon(x, y, rings);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };

  const queue: Cell[] = [];
  const push = (cell: Cell) => {
    // Очередь по убыванию max: короткая, вставка бинарным поиском
    let lo = 0;
    let hi = queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (queue[mid].max > cell.max) lo = mid + 1;
      else hi = mid;
    }
    queue.splice(lo, 0, cell);
  };

  const h = size / 2;
  for (let x = left; x < left + width; x += size) {
    for (let y = minY; y < maxY; y += size) push(make(x + h, y + h, h));
  }

  // Начальная догадка — центр рамки; лучшая клетка будет не хуже
  let best = make(left + width / 2, minY + height / 2, 0);
  let guard = 0;
  while (queue.length > 0 && guard++ < 4000) {
    const cell = queue.shift()!;
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    const half = cell.h / 2;
    push(make(cell.x - half, cell.y - half, half));
    push(make(cell.x + half, cell.y - half, half));
    push(make(cell.x - half, cell.y + half, half));
    push(make(cell.x + half, cell.y + half, half));
  }
  return [best.x / k, best.y];
}
