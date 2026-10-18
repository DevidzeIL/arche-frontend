/**
 * Чья это была земля: ответы, посчитанные при сборке (vite/borders.ts).
 *
 * Отдельно от borders.ts намеренно: странице заметки нужна одна строка
 * «Кёнигсберг · Королевство Пруссия», и тянуть ради неё d3-geo и загрузку
 * границ незачем. Здесь только готовые отрезки лет.
 */
import { sovereignty } from 'virtual:arche-borders';
import { segmentAt, type SovereigntySegment } from './bordersData';

/** Кому принадлежало место в этот год; null — город не размечен или данных нет */
export function polityOfPlace(placeId: string, year: number): SovereigntySegment | null {
  const segment = segmentAt(sovereignty[placeId], Math.round(year));
  return segment?.k ? segment : null;
}

/** Размечено ли место вообще: у регионов отрезков нет — и это честно */
export function hasSovereignty(placeId: string): boolean {
  return (sovereignty[placeId]?.length ?? 0) > 0;
}

/**
 * Отрезки «чья это земля» с подряд идущими одинаковыми названиями,
 * склеенными в один: Веймарская республика, ставшая в 1933-м Нацистской
 * Германией, и сама Нацистская Германия — для читателя одно и то же.
 */
export function sovereigntyTimeline(placeId: string): SovereigntySegment[] {
  const out: SovereigntySegment[] = [];
  for (const segment of sovereignty[placeId] ?? []) {
    const last = out[out.length - 1];
    if (last && last.ru === segment.ru && last.u?.ru === segment.u?.ru && last.src === segment.src) {
      last.t = segment.t;
    } else {
      out.push({ ...segment });
    }
  }
  return out;
}

export function wikipediaUrl(article: { ru?: string | null; en?: string | null }): string | null {
  if (article.ru) return `https://ru.wikipedia.org/wiki/${encodeURIComponent(article.ru.replace(/ /g, '_'))}`;
  if (article.en) return `https://en.wikipedia.org/wiki/${encodeURIComponent(article.en.replace(/ /g, '_'))}`;
  return null;
}
