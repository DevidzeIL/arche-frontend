/**
 * binarySearch.ts - Бинарный поиск для навигации по заметкам
 */

import { TimelineNote } from '../types';

/**
 * Находит индекс первого элемента >= targetYear (lower bound)
 */
export function lowerBound(
  notes: TimelineNote[],
  targetYear: number
): number {
  let left = 0;
  let right = notes.length;
  
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const midYear = notes[mid].timeline?.displayYear ?? 0;
    
    if (midYear < targetYear) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  
  return left;
}

/**
 * Находит ближайшую заметку слева (раньше по времени) от targetYear
 */
export function findPreviousNote(
  notes: TimelineNote[],
  targetYear: number
): TimelineNote | null {
  const index = lowerBound(notes, targetYear);
  
  if (index === 0) return null;
  
  return notes[index - 1];
}

/**
 * Находит ближайшую заметку справа (позже по времени) от targetYear
 */
export function findNextNote(
  notes: TimelineNote[],
  targetYear: number
): TimelineNote | null {
  const index = lowerBound(notes, targetYear);
  
  if (index >= notes.length) return null;
  
  // Если текущая позиция точно на заметке, берем следующую
  const currentYear = notes[index].timeline?.displayYear ?? 0;
  if (currentYear === targetYear && index + 1 < notes.length) {
    return notes[index + 1];
  }
  
  // Иначе берем текущую (если она после targetYear)
  if (currentYear > targetYear) {
    return notes[index];
  }
  
  // Или следующую
  if (index + 1 < notes.length) {
    return notes[index + 1];
  }
  
  return null;
}

