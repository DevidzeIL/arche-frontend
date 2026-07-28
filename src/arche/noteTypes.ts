/**
 * Единый реестр типов заметок.
 *
 * Раньше подписи, цвета и порядок типов были продублированы в шести местах
 * (главная, NotePage, TypeBadge, фильтры, граф, таймлайн). Из-за этого
 * type: culture нигде не отображался — его просто забыли дописать.
 * Любой новый тип теперь добавляется здесь и подхватывается везде.
 */

export const NOTE_TYPES = [
  'hub',
  'time',
  'person',
  'work',
  'concept',
  'culture',
  'event',
  'place',
  'note',
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

export interface NoteTypeMeta {
  /** Подпись в единственном числе — для бейджа на карточке */
  label: string;
  /** Подпись во множественном — для секций, фильтров и строк таймлайна */
  pluralLabel: string;
  /** CSS-переменная акцентного цвета (определена в index.css для обеих тем) */
  colorVar: string;
  /** Цвет для canvas-графа: там нельзя использовать CSS-переменные */
  graphColor: string;
  /** Порядок вывода секций и строк, сверху вниз */
  order: number;
}

export const NOTE_TYPE_META: Record<NoteType, NoteTypeMeta> = {
  hub: {
    label: 'Хаб',
    pluralLabel: 'Хабы',
    colorVar: '--type-note',
    graphColor: '#c0caf5',
    order: 0,
  },
  time: {
    label: 'Эпоха',
    pluralLabel: 'Эпохи',
    colorVar: '--type-time',
    graphColor: '#e0af68',
    order: 1,
  },
  person: {
    label: 'Персона',
    pluralLabel: 'Персоны',
    colorVar: '--type-person',
    graphColor: '#7aa2f7',
    order: 2,
  },
  work: {
    label: 'Работа',
    pluralLabel: 'Работы',
    colorVar: '--type-work',
    graphColor: '#b48ead',
    order: 3,
  },
  concept: {
    label: 'Концепция',
    pluralLabel: 'Концепции',
    colorVar: '--type-concept',
    graphColor: '#7fc8a9',
    order: 4,
  },
  culture: {
    label: 'Течение',
    pluralLabel: 'Течения',
    colorVar: '--type-culture',
    graphColor: '#e08a7a',
    order: 5,
  },
  event: {
    label: 'Событие',
    pluralLabel: 'События',
    colorVar: '--type-note',
    graphColor: '#9aa5ce',
    order: 6,
  },
  place: {
    label: 'Место',
    pluralLabel: 'Места',
    colorVar: '--type-place',
    graphColor: '#d97777',
    order: 7,
  },
  note: {
    label: 'Заметка',
    pluralLabel: 'Заметки',
    colorVar: '--type-note',
    graphColor: '#6b7280',
    order: 8,
  },
};

/** Типы в порядке отображения */
export const NOTE_TYPES_ORDERED: NoteType[] = [...NOTE_TYPES].sort(
  (a, b) => NOTE_TYPE_META[a].order - NOTE_TYPE_META[b].order
);

export function isKnownNoteType(type?: string): type is NoteType {
  return type !== undefined && type in NOTE_TYPE_META;
}

/** Метаданные типа с фолбэком на «Заметку» для неизвестных значений */
export function noteTypeMeta(type?: string): NoteTypeMeta {
  return isKnownNoteType(type) ? NOTE_TYPE_META[type] : NOTE_TYPE_META.note;
}

export function noteTypeLabel(type?: string): string {
  return noteTypeMeta(type).label;
}

export function noteTypePluralLabel(type?: string): string {
  return noteTypeMeta(type).pluralLabel;
}
