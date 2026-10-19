/**
 * Города-ориентиры из Wikidata: название, координаты, год основания.
 *
 * Это не места хранилища (те — заметки, см. geo.ts), а фон, по которому
 * читается карта: где Кёнигсберг относительно Берлина и Варшавы. Собирается
 * скриптом scripts/build-cities.mjs, лежит в public/context/cities.json и
 * грузится вместе с глобусом.
 */

export interface City {
  id: string;
  /** Нынешнее название */
  name: string;
  lon: number;
  lat: number;
  /** Основан; null — в Wikidata не указано */
  from: number | null;
  /** Упразднён или разрушен */
  to: number | null;
  /** Известность: крупные Википедии, число статей, население (см. build-cities.mjs) */
  score: number;
  ru: string | null;
  en: string | null;
  /** 1 — год основания условный: известно лишь, что город был в античности */
  approx: 0 | 1;
}

/** [с какого года, до какого, название]; null — без границы */
export type Rename = [number | null, number | null, string];

export interface CitiesData {
  /** От известных к малоизвестным */
  cities: City[];
  byId: Map<string, City>;
  renames: Record<string, Rename[]>;
}

/**
 * Год, с которого показывать город без даты основания. Москва в Wikidata
 * без неё, и рисовать её в Древнем Риме — выдумка. Пропустить её в XII
 * веке — меньшая ошибка, чем показать в I-м
 */
export const UNDATED_FROM = 1500;

let promise: Promise<CitiesData | null> | null = null;

export function loadCities(): Promise<CitiesData | null> {
  promise ??= fetch('/context/cities.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((json: { fields: string[]; rows: unknown[][]; renames: Record<string, Rename[]> } | null) => {
      if (!json) return null;
      const cities = json.rows.map(
        (row) => Object.fromEntries(json.fields.map((field, i) => [field, row[i]])) as unknown as City
      );
      return { cities, byId: new Map(cities.map((c) => [c.id, c])), renames: json.renames };
    })
    .catch(() => null);
  return promise;
}

export function cityExistsAt(city: City, year: number): boolean {
  const from = city.from ?? UNDATED_FROM;
  return from <= year && (city.to === null || year <= city.to);
}

/** Прежнее название на этот год по элементу Wikidata; null — называется как сейчас */
export function renamedAt(data: CitiesData, id: string, year: number): string | null {
  const segment = data.renames[id]?.find(
    ([from, to]) => (from === null || from <= year) && (to === null || year < to)
  );
  return segment?.[2] ?? null;
}

/** Как город назывался в этот год: Константинополь в 1700-м, Стамбул в 1950-м */
export function cityNameAt(data: CitiesData, city: City, year: number): string {
  return renamedAt(data, city.id, year) ?? city.name;
}

/** Все названия города по порядку: «Византий → Константинополь → Стамбул» */
export function cityNames(data: CitiesData, city: City): Array<{ name: string; from: number | null; to: number | null }> {
  const segments = [...(data.renames[city.id] ?? [])].sort((a, b) => (a[0] ?? -Infinity) - (b[0] ?? -Infinity));
  if (segments.length === 0) return [];
  const result: Array<{ name: string; from: number | null; to: number | null }> = [];
  /** Где кончился предыдущий отрезок */
  let cursor: number | null = city.from;
  for (const [from, to, name] of segments) {
    // Промежуток между переименованиями — под нынешним названием: Санкт-Петербург до 1914-го
    if (from !== null && cursor !== null && cursor < from) result.push({ name: city.name, from: cursor, to: from });
    result.push({ name, from: from ?? city.from, to });
    cursor = to;
  }
  if (cursor !== null) result.push({ name: city.name, from: cursor, to: null });
  return result;
}
