/**
 * География: где происходило то, что описано в заметках.
 *
 * Устроено ровно как датировка (см. timeSpan.ts) и по той же причине.
 * Координаты живут ТОЛЬКО в заметках-местах, остальные заметки ссылаются
 * на место по названию. Дублировать широту и долготу в каждой персоне
 * значило бы завести второй источник истины, который немедленно разойдётся
 * с первым.
 *
 * Порядок источников, от надёжного к запасному:
 *   1. `place: [Афины, Париж]` во frontmatter — основной способ
 *   2. Строка шапки «**Страна / культура:** Кёнигсберг, Восточная Пруссия»
 *      или «**Место:** Европа — Польша, Италия» — фолбэк по названиям и синонимам
 *
 * Заметка без места на глобус не попадает, но остаётся везде остальном:
 * у мысли не всегда есть точка на карте, и притворяться, что есть, незачем.
 */

import type { ArcheNote, NoteGeo } from './types';
import { normalizeTitle } from './normalize';

export interface Place {
  id: string;
  title: string;
  note: ArcheNote;
  geo: NoteGeo;
}

export interface PlaceIndex {
  places: Place[];
  byId: Map<string, Place>;
  /** Нормализованное название или синоним → место */
  byName: Map<string, Place>;
  /** Синонимы, отсортированные от длинных к коротким: «Северная Италия» раньше «Италия» */
  names: string[];
}

/** Строки шапки, на которых в этом хранилище стоит география */
const PLACE_LINE = /^\s*\**\s*(?:Страна\s*\/\s*культура|Страна|Место(?:\s*действия)?|География)\s*:?\**\s*(.+)$/im;

export function buildPlaceIndex(notes: ArcheNote[]): PlaceIndex {
  const places: Place[] = [];
  const byId = new Map<string, Place>();
  const byName = new Map<string, Place>();

  for (const note of notes) {
    if (note.type !== 'place' || !note.geo) continue;
    const place: Place = { id: note.id, title: note.title, note, geo: note.geo };
    places.push(place);
    byId.set(place.id, place);

    for (const name of [note.title, ...note.geo.aliases]) {
      const key = normalizeTitle(name);
      // Первое объявление выигрывает: так синоним нельзя перехватить случайно
      if (key && !byName.has(key)) byName.set(key, place);
    }
  }

  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  return { places, byId, byName, names };
}

/** Кириллица и латиница: по краям названия не должно быть буквы */
function isLetter(char: string | undefined): boolean {
  return char !== undefined && /[a-zа-яё]/i.test(char);
}

/**
 * Падежные окончания русских топонимов.
 *
 * В шапках заметок место стоит в том падеже, которого требует фраза:
 * «преподавал в Париже», «жил в Афинах», «Италия — Пиза». Сравнение
 * названий целиком находило только именительный падеж и молча теряло
 * большую часть географии.
 */
const ENDINGS = [
  '', 'а', 'е', 'и', 'ы', 'у', 'ю', 'я', 'ой', 'ей', 'ом', 'ем',
  'ах', 'ях', 'ам', 'ям', 'ами', 'ями', 'ов', 'ев',
];

/** Основа названия: у слов от пяти букв отбрасываем конечную гласную */
export function stemOf(name: string): string {
  return name.length >= 5 && /[аяыиоеьй]$/.test(name) ? name.slice(0, -1) : name;
}

/**
 * Ищет названия мест в строке шапки.
 *
 * Идём от длинных названий к коротким и вычёркиваем найденное, иначе
 * «Римская Северная Африка» отдала бы «Рим», а «Великобритания» — «Британия».
 */
export function matchPlacesInText(text: string, index: PlaceIndex): Place[] {
  const haystack = normalizeTitle(text);
  const found: Place[] = [];
  const taken: Array<{ start: number; end: number }> = [];

  for (const name of index.names) {
    const stem = stemOf(name);
    let from = 0;

    for (;;) {
      const at = haystack.indexOf(stem, from);
      if (at < 0) break;
      from = at + stem.length;

      // Слева должно быть начало строки или не-буква: «Рим», но не «Кримск»
      if (isLetter(haystack[at - 1])) continue;

      // Справа — допустимое окончание и граница слова
      const tail = haystack.slice(at + stem.length);
      const ending = ENDINGS.find(
        (e) => tail.startsWith(e) && !isLetter(tail[e.length])
      );
      if (ending === undefined) continue;

      const end = at + stem.length + ending.length;
      if (taken.some((span) => at < span.end && span.start < end)) continue;

      taken.push({ start: at, end });
      const place = index.byName.get(name);
      if (place && !found.includes(place)) found.push(place);
      break;
    }
  }

  return found;
}

export interface ResolvedPlaces {
  places: Place[];
  /** Откуда взялось: явное поле или разбор шапки */
  source: 'frontmatter' | 'text';
}

export function resolvePlaces(note: ArcheNote, index: PlaceIndex): ResolvedPlaces | null {
  // Само место — это точка, а не то, что где-то произошло
  if (note.type === 'place') {
    const own = index.byId.get(note.id);
    return own ? { places: [own], source: 'frontmatter' } : null;
  }

  const explicit = note.places
    .map((name) => index.byName.get(normalizeTitle(name)))
    .filter((p): p is Place => p !== undefined);
  if (explicit.length > 0) return { places: explicit, source: 'frontmatter' };

  const line = note.body.match(PLACE_LINE);
  if (line) {
    const matched = matchPlacesInText(line[1], index);
    if (matched.length > 0) return { places: matched, source: 'text' };
  }

  return null;
}

/**
 * noteId → места, посчитанные один раз для всего хранилища.
 *
 * У работ своей строки с географией нет: «Левиафан» написан там, где жил
 * Гоббс. Поэтому работа без места наследует места автора — связь `автор`
 * в графе для этого и есть. Наследование одноуровневое и только для работ:
 * у понятия места нет вообще, и придумывать его нечестно.
 */
export function resolveAllPlaces(
  notes: ArcheNote[],
  index: PlaceIndex,
  authorsOf?: (noteId: string) => string[]
): Map<string, Place[]> {
  const map = new Map<string, Place[]>();

  for (const note of notes) {
    const resolved = resolvePlaces(note, index);
    if (resolved) map.set(note.id, resolved.places);
  }

  if (authorsOf) {
    for (const note of notes) {
      if (note.type !== 'work' || map.has(note.id)) continue;
      const inherited = authorsOf(note.id)
        .flatMap((authorId) => map.get(authorId) ?? [])
        .filter((place, i, all) => all.indexOf(place) === i);
      if (inherited.length > 0) map.set(note.id, inherited);
    }
  }

  return map;
}

/** Что произошло в этом месте: обратный индекс */
export function notesByPlace(
  placesOfNote: Map<string, Place[]>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [noteId, places] of placesOfNote) {
    for (const place of places) {
      const list = map.get(place.id);
      if (list) list.push(noteId);
      else map.set(place.id, [noteId]);
    }
  }
  return map;
}

/** Единичный вектор из широты и долготы — основа проекции и дуг */
export function toCartesian({ lat, lon }: { lat: number; lon: number }): [number, number, number] {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  return [cosPhi * Math.cos(lambda), cosPhi * Math.sin(lambda), Math.sin(phi)];
}
