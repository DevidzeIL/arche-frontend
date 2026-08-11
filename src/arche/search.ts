/**
 * Поиск и фильтрация заметок.
 * Общий код для главной страницы и палитры Cmd+K — чтобы результаты совпадали.
 */

import type { ArcheNote } from './types';

export interface NoteFilters {
  query: string;
  types: string[];
  domains: string[];
}

export const EMPTY_FILTERS: NoteFilters = {
  query: '',
  types: [],
  domains: [],
};

export function hasActiveFilters(filters: NoteFilters): boolean {
  return filters.query.trim().length > 0 || filters.types.length > 0 || filters.domains.length > 0;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').trim();
}

/**
 * Насколько заметка релевантна запросу. 0 — не подходит.
 * Точное совпадение названия важнее вхождения в текст, иначе короткие
 * концепции («Разум», «Метод») тонут среди заметок, которые их упоминают.
 */
export function scoreNote(note: ArcheNote, query: string): number {
  const q = normalize(query);
  if (!q) return 1;

  const title = normalize(note.title);

  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;

  const words = title.split(/[\s(),—-]+/).filter(Boolean);
  if (words.some((word) => word.startsWith(q))) return 50;

  if (note.domain?.some((domain) => normalize(domain).includes(q))) return 30;
  if (note.plainText && normalize(note.plainText).includes(q)) return 20;

  return 0;
}

/**
 * Кусок текста вокруг совпадения — чтобы было видно, ПОЧЕМУ заметка в выдаче.
 *
 * Совпадение в теле даёт низкий вес, и рядом показывалась обычная выжимка
 * из начала заметки: искомого слова в ней могло не быть вовсе, и результат
 * выглядел случайным.
 *
 * Возвращает null, если совпадение в названии — там и так всё видно.
 */
export function matchSnippet(
  note: ArcheNote,
  query: string,
  radius = 60
): { before: string; match: string; after: string } | null {
  const q = normalize(query);
  if (!q || !note.plainText) return null;
  if (normalize(note.title).includes(q)) return null;

  const at = normalize(note.plainText).indexOf(q);
  if (at < 0) return null;

  // Индексы normalize-строки совпадают с исходной: приведение регистра
  // и замена «ё» на «е» длину не меняют
  const text = note.plainText;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + q.length + radius);

  return {
    before: (start > 0 ? '…' : '') + text.slice(start, at),
    match: text.slice(at, at + q.length),
    after: text.slice(at + q.length, end) + (end < text.length ? '…' : ''),
  };
}

/** Поиск с ранжированием: только совпадения, лучшие сверху */
export function searchNotes(notes: ArcheNote[], query: string, limit?: number): ArcheNote[] {
  if (!query.trim()) {
    return limit ? notes.slice(0, limit) : notes;
  }

  const ranked = notes
    .map((note) => ({ note, score: scoreNote(note, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title, 'ru'))
    .map(({ note }) => note);

  return limit ? ranked.slice(0, limit) : ranked;
}

/** Полная фильтрация: текст + типы + домены */
export function applyNoteFilters(notes: ArcheNote[], filters: NoteFilters): ArcheNote[] {
  let result = notes;

  if (filters.types.length > 0) {
    result = result.filter((note) => note.type !== undefined && filters.types.includes(note.type));
  }

  if (filters.domains.length > 0) {
    result = result.filter((note) => note.domain?.some((domain) => filters.domains.includes(domain)) ?? false);
  }

  return searchNotes(result, filters.query);
}

/** Все типы, реально встречающиеся в vault'е */
export function collectTypes(notes: ArcheNote[]): string[] {
  const types = new Set<string>();
  notes.forEach((note) => {
    if (note.type) types.add(note.type);
  });
  return [...types];
}

/** Все домены, реально встречающиеся в vault'е */
export function collectDomains(notes: ArcheNote[]): string[] {
  const domains = new Set<string>();
  notes.forEach((note) => note.domain?.forEach((domain) => domains.add(domain)));
  return [...domains].sort((a, b) => a.localeCompare(b, 'ru'));
}
