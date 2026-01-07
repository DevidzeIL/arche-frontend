/**
 * bucketLayout.ts - Алгоритм bucket stacking для размещения карточек в строках
 */

import { TimelineNote } from '../types';
import { ZoomLevel } from '../types';

export interface BucketLayoutItem {
  noteId: string;
  year: number;
  bucketIndex: number;
  stackIndex: number; // 0..(maxStack-1) внутри bucket
  isOverflow: boolean; // true если карточка не поместилась (показать "+N")
}

export interface BucketLayout {
  items: BucketLayoutItem[];
  overflowCounts: Map<number, number>; // bucketIndex -> количество переполненных карточек
}

/**
 * Размер bucket в годах в зависимости от уровня зума
 */
export function getBucketSizeYears(zoomLevel: ZoomLevel): number {
  switch (zoomLevel) {
    case 'in':
      return 1; // близкий зум - по годам
    case 'mid':
      return 5; // средний зум - по 5 лет
    case 'out':
      return 25; // дальний зум - по 25 лет
    default:
      return 5;
  }
}

/**
 * Вычисление bucket index для года
 */
export function computeBucketKey(year: number, bucketSizeYears: number): number {
  return Math.floor(year / bucketSizeYears);
}

/**
 * Bucket stacking layout для заметок в строке
 * 
 * Алгоритм:
 * 1. Группируем заметки по bucket (временные интервалы)
 * 2. Внутри каждого bucket размещаем карточки вертикально (stack)
 * 3. Если карточек больше maxStack - остальные помечаем как overflow
 * 
 * @param expandedBuckets - Set bucketIndex которые должны показывать все карточки (без ограничения maxStack)
 */
export function computeBucketLayout(
  notes: TimelineNote[],
  zoomLevel: ZoomLevel,
  maxStackPerBucket: number = 3,
  expandedBuckets?: Set<number>
): BucketLayout {
  const bucketSizeYears = getBucketSizeYears(zoomLevel);
  const buckets = new Map<number, TimelineNote[]>();
  const overflowCounts = new Map<number, number>();
  
  // Группируем заметки по bucket
  notes.forEach(note => {
    const year = note.timeline?.displayYear ?? 0;
    const bucketIndex = computeBucketKey(year, bucketSizeYears);
    
    if (!buckets.has(bucketIndex)) {
      buckets.set(bucketIndex, []);
    }
    buckets.get(bucketIndex)!.push(note);
  });
  
  // Сортируем заметки внутри каждого bucket по приоритету, затем по году
  buckets.forEach((bucketNotes) => {
    bucketNotes.sort((a, b) => {
      const priorityA = getTypePriority(a.type);
      const priorityB = getTypePriority(b.type);
      if (priorityA !== priorityB) {
        return priorityB - priorityA; // выше приоритет = выше в stack
      }
      
      const yearA = a.timeline?.displayYear ?? 0;
      const yearB = b.timeline?.displayYear ?? 0;
      if (yearA !== yearB) {
        return yearA - yearB;
      }
      
      // Стабильная сортировка по id
      return a.id.localeCompare(b.id);
    });
  });
  
  // Создаем layout items
  const items: BucketLayoutItem[] = [];
  
  buckets.forEach((bucketNotes, bucketIndex) => {
    // Если bucket расширен - показываем все карточки
    const isExpanded = expandedBuckets?.has(bucketIndex) ?? false;
    const visibleCount = isExpanded 
      ? bucketNotes.length 
      : Math.min(bucketNotes.length, maxStackPerBucket);
    const overflowCount = isExpanded 
      ? 0 
      : Math.max(0, bucketNotes.length - maxStackPerBucket);
    
    if (overflowCount > 0) {
      overflowCounts.set(bucketIndex, overflowCount);
    }
    
    // Размещаем видимые карточки
    bucketNotes.slice(0, visibleCount).forEach((note, index) => {
      const year = note.timeline?.displayYear ?? 0;
      items.push({
        noteId: note.id,
        year,
        bucketIndex,
        stackIndex: index,
        isOverflow: false,
      });
    });
  });
  
  return {
    items,
    overflowCounts,
  };
}

/**
 * Приоритет типов (для сортировки внутри bucket)
 */
function getTypePriority(type?: string): number {
  const priorities: Record<string, number> = {
    hub: 10,
    time: 9,
    concept: 7,
    person: 5,
    work: 3,
    event: 3,
    place: 3,
    note: 1,
  };
  return priorities[type || 'note'] || 1;
}

