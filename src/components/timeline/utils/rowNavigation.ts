/**
 * rowNavigation.ts - Навигация по заметкам с учетом активной строки
 */

import { TimelineNote } from '../types';
import { RowKey, groupNotesByRow } from './rowTypes';
import { findPreviousNote, findNextNote } from './binarySearch';

/**
 * Находит предыдущую заметку с учетом активной строки
 */
export function findPreviousNoteInRow(
  notes: TimelineNote[],
  scrollYear: number,
  activeRowKey: RowKey | null
): TimelineNote | null {
  if (activeRowKey) {
    // Навигация внутри активной строки
    const notesByRow = groupNotesByRow(notes);
    const rowNotes = notesByRow[activeRowKey];
    return findPreviousNote(rowNotes, scrollYear);
  } else {
    // Навигация по всем заметкам
    return findPreviousNote(notes, scrollYear);
  }
}

/**
 * Находит следующую заметку с учетом активной строки
 */
export function findNextNoteInRow(
  notes: TimelineNote[],
  scrollYear: number,
  activeRowKey: RowKey | null
): TimelineNote | null {
  if (activeRowKey) {
    // Навигация внутри активной строки
    const notesByRow = groupNotesByRow(notes);
    const rowNotes = notesByRow[activeRowKey];
    return findNextNote(rowNotes, scrollYear);
  } else {
    // Навигация по всем заметкам
    return findNextNote(notes, scrollYear);
  }
}

