/**
 * Цвета политической карты, как в атласе: соседи не сливаются.
 *
 * Раньше цвет считался по названию — устойчиво, но Бранденбург, Саксония
 * и Богемия могли получить почти одинаковый пастельный оттенок, и карту
 * нельзя было прочесть без наведения. Теперь:
 *   — у каждого государства есть «свой» оттенок из палитры (по названию),
 *     так что Франция в 1600 и в 1700 году одного цвета;
 *   — если свой оттенок слишком близок к уже раскрашенному соседу, берётся
 *     тот, что от соседей дальше всего.
 * Крупные раскрашиваются первыми: у них свой цвет почти всегда сохраняется.
 *
 * Соседство — по пересечению рамок с запасом: настоящую смежность границ
 * считать на каждый год дорого, а лишний «сосед» стоит лишь чуть меньшей
 * свободы в выборе цвета.
 */

/** Двенадцать оттенков через 30°: приглушённые, различимые и на светлой, и на тёмной теме */
export const ATLAS_HUES = [12, 40, 62, 95, 140, 172, 198, 222, 252, 282, 315, 345];

/** Ближе этого соседи считаются слишком похожими */
const MIN_HUE_GAP = 45;
/** Запас к рамке, градусы: соседи через узкий пролив — тоже соседи */
const MARGIN = 0.6;

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface Shape {
  key: string;
  name: string;
  union: boolean;
  bbox: [number, number, number, number];
  size: number;
}

const overlaps = (a: Shape['bbox'], b: Shape['bbox']) => {
  // Рамка через антимеридиан (запад больше востока) — считаем соседом всех по долготе
  const wrapA = a[0] > a[2];
  const wrapB = b[0] > b[2];
  const lonOverlap = wrapA || wrapB || !(a[2] + MARGIN < b[0] || b[2] + MARGIN < a[0]);
  return lonOverlap && !(a[3] + MARGIN < b[1] || b[3] + MARGIN < a[1]);
};

export function atlasHues(states: Shape[]): Map<string, number> {
  const shapes = states.filter((s) => !s.union).sort((a, b) => b.size - a.size);
  const result = new Map<string, number>();
  const placed: Array<{ bbox: Shape['bbox']; hue: number }> = [];
  for (const shape of shapes) {
    const near = placed.filter((p) => overlaps(p.bbox, shape.bbox)).map((p) => p.hue);
    const spread = (hue: number) => (near.length === 0 ? 180 : Math.min(...near.map((n) => hueDistance(n, hue))));
    const own = ATLAS_HUES[hash(shape.name) % ATLAS_HUES.length];
    let hue = own;
    if (spread(own) < MIN_HUE_GAP) {
      for (const candidate of ATLAS_HUES) if (spread(candidate) > spread(hue)) hue = candidate;
    }
    result.set(shape.key, hue);
    placed.push({ bbox: shape.bbox, hue });
  }
  return result;
}
