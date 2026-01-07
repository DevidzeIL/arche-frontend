/**
 * rowTypes.ts - Маппинг типов заметок в семантические строки
 */

import { TimelineNote } from '../types';

export type RowKey = 'person' | 'work' | 'concept' | 'event' | 'place' | 'hub' | 'note';

export interface RowConfig {
  key: RowKey;
  label: string;
  height: number; // высота строки в пикселях
  order: number; // порядок отображения (сверху вниз)
}

/**
 * Порядок строк (сверху вниз)
 * КРИТИЧНО: 'note' временно скрыта из отображения
 */
export const ROW_ORDER: RowKey[] = [
  'hub',
  'person',
  'work',
  'concept',
  'event',
  'place',
  // 'note', // Скрыта из отображения
];

/**
 * Конфигурация строк
 */
export const ROW_CONFIGS: Record<RowKey, RowConfig> = {
  hub: {
    key: 'hub',
    label: 'Периоды',
    height: 220,
    order: 0,
  },
  person: {
    key: 'person',
    label: 'Персоны',
    height: 220,
    order: 1,
  },
  work: {
    key: 'work',
    label: 'Работы',
    height: 220,
    order: 2,
  },
  concept: {
    key: 'concept',
    label: 'Концепции',
    height: 220,
    order: 3,
  },
  event: {
    key: 'event',
    label: 'События',
    height: 220,
    order: 4,
  },
  place: {
    key: 'place',
    label: 'Места',
    height: 220,
    order: 5,
  },
  note: {
    key: 'note',
    label: 'Заметки',
    height: 220,
    order: 6,
  },
};

/**
 * Маппинг типа заметки в ключ строки
 */
export function getRowKeyForNote(note: TimelineNote): RowKey {
  const type = note.type || 'note';
  
  switch (type) {
    case 'person':
      return 'person';
    case 'work':
      return 'work';
    case 'concept':
      return 'concept';
    case 'event':
      return 'event';
    case 'place':
      return 'place';
    case 'hub':
    case 'time':
      return 'hub';
    default:
      return 'note';
  }
}

/**
 * Группировка заметок по строкам
 * КРИТИЧНО: Audit - проверяет что все заметки попали в группы
 */
export function groupNotesByRow(notes: TimelineNote[]): Record<RowKey, TimelineNote[]> {
  const grouped: Record<RowKey, TimelineNote[]> = {
    person: [],
    work: [],
    concept: [],
    event: [],
    place: [],
    hub: [],
    note: [],
  };
  
  const unmappedTypes = new Set<string>();
  
  notes.forEach(note => {
    const rowKey = getRowKeyForNote(note);
    if (grouped[rowKey]) {
      grouped[rowKey].push(note);
    } else {
      // Fallback: если тип не распознан, идем в 'note'
      grouped.note.push(note);
      if (note.type) {
        unmappedTypes.add(note.type);
      }
    }
  });
  
  // Сортируем каждую группу по году
  Object.keys(grouped).forEach(key => {
    grouped[key as RowKey].sort((a, b) => {
      const yearA = a.timeline?.displayYear ?? 0;
      const yearB = b.timeline?.displayYear ?? 0;
      return yearA - yearB;
    });
  });
  
  // Audit: проверяем что все заметки попали в группы
  const totalGrouped = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
  if (totalGrouped !== notes.length) {
    console.warn(
      `[Timeline] Grouping mismatch: ${totalGrouped} grouped vs ${notes.length} total notes`
    );
  }
  
  if (unmappedTypes.size > 0) {
    console.warn(
      `[Timeline] Unmapped note types: ${Array.from(unmappedTypes).join(', ')}. ` +
      `These notes were placed in 'note' row.`
    );
  }
  
  return grouped;
}

/**
 * Получить конфигурацию строки по ключу
 */
export function getRowConfig(rowKey: RowKey): RowConfig {
  return ROW_CONFIGS[rowKey];
}

