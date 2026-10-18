/**
 * Сведения о государствах из Wikidata (CC0): столица, форма правления,
 * языки, религия, флаг, предшественники и правители.
 *
 * Собираются скриптом scripts/build-context.mjs. Сведения о столицах
 * нужны глобусу сразу — столицы рисуются на карте, — а правители только
 * в панели государства, поэтому это два файла и второй грузится позже.
 */

/** [название, долгота, широта, с какого года, по какой год] */
export type CapitalEntry = [string, number, number, number | null, number | null];
/** [файл Commons, с какого года, по какой год] */
export type FlagEntry = [string, number | null, number | null];
/** [имя, начало правления, конец правления, элемент Wikidata] */
export type Ruler = [string, number, number | null, string];

export interface PolityFacts {
  /** Описание из Wikidata: «королевство в Европе, существовавшее в 1701—1918 годах» */
  d?: string;
  cap?: CapitalEntry[];
  gov?: string[];
  lang?: string[];
  rel?: string[];
  /** rel — официальная религия государства, а не перечень вер подданных */
  ro?: 1;
  /** Год основания и упразднения */
  inc?: number;
  dis?: number;
  flag?: FlagEntry[];
  arms?: string;
  /** [элемент Wikidata, название] */
  prev?: [string, string][];
  next?: [string, string][];
}

let factsPromise: Promise<Record<string, PolityFacts> | null> | null = null;
let rulersPromise: Promise<Record<string, Ruler[]> | null> | null = null;

const fetchOrNull = <T>(url: string): Promise<T | null> =>
  fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);

export function loadPolityFacts(): Promise<Record<string, PolityFacts> | null> {
  factsPromise ??= fetchOrNull('/context/polities.json');
  return factsPromise;
}

export function loadRulers(): Promise<Record<string, Ruler[]> | null> {
  rulersPromise ??= fetchOrNull('/context/rulers.json');
  return rulersPromise;
}

/**
 * Запись, действующая в этот год. Отрезки с датами важнее записей без
 * дат: у Пруссии «Берлин» без дат и «Кёнигсберг» с 1701 по 1701 — в 1701
 * году ответ «Кёнигсберг», в остальные — «Берлин».
 */
function atYear<T extends [unknown, ...unknown[]]>(
  entries: T[] | undefined,
  year: number,
  from: (e: T) => number | null,
  to: (e: T) => number | null
): T | null {
  if (!entries || entries.length === 0) return null;
  const dated = entries.filter((e) => from(e) !== null || to(e) !== null);
  const hit = dated.find(
    (e) => (from(e) ?? -Infinity) <= year && year <= (to(e) ?? Infinity)
  );
  if (hit) return hit;
  return entries.find((e) => from(e) === null && to(e) === null) ?? null;
}

export function capitalAt(facts: PolityFacts | undefined, year: number) {
  const entry = atYear(facts?.cap, year, (e) => e[3], (e) => e[4]);
  return entry ? { name: entry[0], lon: entry[1], lat: entry[2] } : null;
}

export function flagAt(facts: PolityFacts | undefined, year: number): string | null {
  return atYear(facts?.flag, year, (e) => e[1], (e) => e[2])?.[0] ?? null;
}

export function isRulingAt(ruler: Ruler, year: number): boolean {
  return ruler[1] <= year && year <= (ruler[2] ?? ruler[1]);
}

/** Картинка Commons нужной ширины: Special:FilePath сам перенаправит на миниатюру */
export function commonsThumb(file: string, width: number): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
}

/** Страница файла — там автор и лицензия изображения */
export function commonsPage(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;
}
