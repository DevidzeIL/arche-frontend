/**
 * Явный временной интервал заметки, заданный во frontmatter.
 * Единственный надёжный источник дат — текст разбирается только как фолбэк.
 */
export interface NoteTimeSpan {
  startYear: number;
  endYear?: number;
  /** Год, в котором заметка стоит на таймлайне. Если не задан — выводится из типа. */
  displayYear?: number;
  precision?: 'exact' | 'approximate' | 'century';
}

/**
 * Точка на глобусе. Задаётся только в заметках-местах (type: place):
 * остальные заметки ссылаются на место по названию, а не носят координаты.
 */
export interface NoteGeo {
  lat: number;
  lon: number;
  /**
   * Страна или регион рисуется мягким пятном, город — точкой: у «Германии»
   * нет координат в том же смысле, что у Кёнигсберга, и делать вид, что есть,
   * значит врать масштабом.
   */
  scale: 'city' | 'region';
  /** Как место называют в текстах заметок: «Афины», «Аттика», «Англия» */
  aliases: string[];
}

export interface ArcheNote {
  id: string;
  path: string;
  title: string;
  type?: string;
  domain?: string[];
  status?: string;
  group?: string;
  created?: string | Date;
  updated?: string | Date;
  folder: string; // top-level folder (00_HUB, 01_Time, etc.)
  rawContent: string;
  body: string; // markdown без frontmatter
  plainText: string; // для поиска
  links: string[]; // все [[wikilinks]] из тела
  timeSpan?: NoteTimeSpan; // явные даты из frontmatter
  geo?: NoteGeo; // координаты; только у заметок-мест
  /** Явная привязка к местам: `place: [Афины, Париж]` во frontmatter */
  places: string[];
}

export interface NoteLink {
  source: string; // id заметки
  target: string; // id заметки (или null если не найдена)
  targetTitle: string; // название из ссылки
}

export interface Tab {
  id: string;
  noteId: string;
  title: string;
  pinned: boolean;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  tabs: Tab[];
  activeTabId: string | null;
}

