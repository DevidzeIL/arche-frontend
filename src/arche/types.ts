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

