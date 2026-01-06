import { ArcheNote } from '@/arche/types';
import { TimelineNote, TimelineMetadata } from '../types';

/**
 * Обогащает заметку временными метаданными
 */
export function enrichNoteWithTimeline(note: ArcheNote): TimelineNote | null {
  const timeline = extractTimelineFromNote(note);
  
  if (!timeline) {
    return null;
  }
  
  return {
    ...note,
    timeline,
  };
}

/**
 * Извлекает временные данные из заметки
 */
function extractTimelineFromNote(note: ArcheNote): TimelineMetadata | undefined {
  // 1. Проверяем наличие явных временных полей в frontmatter
  // (если добавите в будущем)
  
  // 2. Извлекаем годы из body
  const years = extractYearsFromContent(note.rawContent + ' ' + note.body);
  
  if (years.length === 0) {
    // 3. Пытаемся определить по типу и названию
    return guessTimelineFromContext(note);
  }
  
  // 4. Вычисляем важность
  const importance = calculateImportance(note);
  
  return {
    startYear: Math.min(...years),
    endYear: years.length > 1 ? Math.max(...years) : undefined,
    displayYear: years[0],
    importance,
    precision: 'approximate',
  };
}

/**
 * Извлекает годы из текста
 */
function extractYearsFromContent(content: string): number[] {
  const years: number[] = [];
  
  // Паттерны для поиска дат
  const patterns = [
    // "384-322 до н.э." или "384–322 до н.э."
    /(\d{3,4})\s*[-–—]\s*(\d{3,4})\s*до\s*н\.?\s*э\.?/gi,
    // "1596-1650" или "1900–1950"
    /(\d{4})\s*[-–—]\s*(\d{4})(?!\s*до\s*н)/g,
    // "384 до н.э."
    /(\d{3,4})\s*до\s*н\.?\s*э\.?/gi,
    // Просто год (но не номер страницы и т.п.)
    /\b(1[0-9]{3}|2[0-9]{3})\b/g,
  ];
  
  patterns.forEach(pattern => {
    const matches = [...content.matchAll(pattern)];
    matches.forEach(match => {
      // Первое число
      if (match[1]) {
        let year = parseInt(match[1], 10);
        if (match[0].includes('до н.э')) {
          year = -Math.abs(year);
        }
        if (year >= -1000 && year <= 2100) {
          years.push(year);
        }
      }
      // Второе число (в диапазоне)
      if (match[2]) {
        let year = parseInt(match[2], 10);
        if (match[0].includes('до н.э')) {
          year = -Math.abs(year);
        }
        if (year >= -1000 && year <= 2100) {
          years.push(year);
        }
      }
    });
  });
  
  // Удаляем дубликаты и сортируем
  return [...new Set(years)].sort((a, b) => a - b);
}

/**
 * Угадывает временной период по контексту
 */
function guessTimelineFromContext(note: ArcheNote): TimelineMetadata | undefined {
  const title = note.title.toLowerCase();
  
  // Эпохи
  if (note.type === 'time' || note.folder === '01_Time') {
    if (title.includes('античност')) return { startYear: -800, endYear: 500, displayYear: -300, importance: 0.9, precision: 'century' };
    if (title.includes('средневеков') || title.includes('средние века')) return { startYear: 500, endYear: 1400, displayYear: 950, importance: 0.9, precision: 'century' };
    if (title.includes('возрожден')) return { startYear: 1400, endYear: 1600, displayYear: 1500, importance: 0.9, precision: 'century' };
    if (title.includes('новое время')) return { startYear: 1600, endYear: 1800, displayYear: 1700, importance: 0.9, precision: 'century' };
    if (title.includes('предмодерн')) return { startYear: 1800, endYear: 1900, displayYear: 1850, importance: 0.9, precision: 'century' };
    if (title.includes('модерн') && !title.includes('пост')) return { startYear: 1900, endYear: 1950, displayYear: 1925, importance: 0.9, precision: 'century' };
    if (title.includes('постмодерн')) return { startYear: 1950, endYear: 2025, displayYear: 1990, importance: 0.9, precision: 'century' };
  }
  
  return undefined;
}

/**
 * Вычисляет важность заметки для LOD
 */
export function calculateImportance(note: ArcheNote): number {
  let score = 0.5; // базовая важность
  
  // Тип увеличивает важность
  if (note.type === 'hub') score += 0.3;
  if (note.type === 'time') score += 0.3;
  if (note.type === 'concept') score += 0.2;
  if (note.type === 'person') score += 0.1;
  
  // Количество связей
  if (note.links && note.links.length > 0) {
    score += Math.min(0.2, note.links.length * 0.01);
  }
  
  // Статус
  if (note.status === 'mature' || note.status === 'evergreen') {
    score += 0.1;
  }
  
  // Наличие domain
  if (note.domain && note.domain.length > 0) {
    score += 0.05;
  }
  
  return Math.min(1, score);
}

/**
 * Форматирует год для отображения
 */
export function formatYear(year: number, precision: 'exact' | 'approximate' | 'century' = 'exact'): string {
  if (year < 0) {
    const absYear = Math.abs(year);
    if (precision === 'century') {
      const century = Math.ceil(absYear / 100);
      return `${century} век до н.э.`;
    }
    return `${absYear} до н.э.`;
  }
  
  if (precision === 'century') {
    const century = Math.ceil(year / 100);
    return `${century} век`;
  }
  
  return year.toString();
}

/**
 * Пакетное обогащение всех заметок
 */
export function enrichAllNotes(notes: ArcheNote[]): TimelineNote[] {
  return notes
    .map(enrichNoteWithTimeline)
    .filter((note): note is TimelineNote => note !== null);
}

