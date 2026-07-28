import { ArcheNote } from '@/arche/types';
import { TimelineNote, TimelineMetadata } from '../types';

type Precision = TimelineMetadata['precision'];

interface ParsedSpan {
  startYear: number;
  endYear?: number;
  precision: Precision;
}

/**
 * Обогащает заметку временными метаданными.
 * Возвращает null, если у заметки нет датировки — такие заметки на таймлайн не попадают.
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
 * Источники датировки, в порядке убывания доверия:
 *   1. Явные поля frontmatter (start_year / end_year) — единственный точный источник
 *   2. Датировка из тела заметки ("**Годы жизни:** 384–322 до н.э.")
 *   3. Догадка по типу и названию (для эпох)
 *
 * КРИТИЧНО: разбирается только body. rawContent содержит frontmatter,
 * из которого регексп раньше выхватывал год из `created:` и ставил
 * все недатированные заметки в текущий год.
 */
function extractTimelineFromNote(note: ArcheNote): TimelineMetadata | undefined {
  const importance = calculateImportance(note);

  const span =
    fromFrontmatter(note) ?? extractSpanFromText(note.body) ?? guessSpanFromContext(note);

  if (!span) {
    return undefined;
  }

  return {
    startYear: span.startYear,
    endYear: span.endYear,
    displayYear: note.timeSpan?.displayYear ?? defaultDisplayYear(span, note.type),
    importance,
    precision: span.precision,
  };
}

function fromFrontmatter(note: ArcheNote): ParsedSpan | undefined {
  if (!note.timeSpan) return undefined;

  return {
    startYear: note.timeSpan.startYear,
    endYear: note.timeSpan.endYear,
    precision: note.timeSpan.precision ?? 'exact',
  };
}

/**
 * Год, в котором заметка стоит на шкале.
 * Персоны и работы якорятся началом (год рождения / год создания),
 * эпохи, концепции и культурные течения — серединой своего интервала.
 */
function defaultDisplayYear(span: ParsedSpan, type?: string): number {
  if (span.endYear === undefined) return span.startYear;
  if (type === 'person' || type === 'work') return span.startYear;
  return Math.round((span.startYear + span.endYear) / 2);
}

const ROMAN_DIGITS: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};

function romanToInt(roman: string): number | null {
  const chars = roman.toUpperCase().split('');
  let total = 0;

  for (let i = 0; i < chars.length; i++) {
    const value = ROMAN_DIGITS[chars[i]];
    if (value === undefined) return null;
    const next = ROMAN_DIGITS[chars[i + 1]];
    total += next !== undefined && next > value ? -value : value;
  }

  return total > 0 && total <= 21 ? total : null;
}

/** N-й век → интервал лет. До н.э. счёт идёт в обратную сторону. */
function centuryToSpan(century: number, isBC: boolean): { startYear: number; endYear: number } {
  return isBC
    ? { startYear: -century * 100, endYear: -(century - 1) * 100 }
    : { startYear: (century - 1) * 100, endYear: century * 100 };
}

const BC_MARKER = /до\s*н\.?\s*э/i;

/**
 * Строки, на которых в этом vault обычно стоит датировка.
 * Ищем их первыми — год из заголовочного блока надёжнее случайного числа в тексте.
 */
const DATE_LINE = /^\s*\**\s*(?:Годы жизни|Годы|Год|Дата|Период|Датировка)\s*:?\**\s*(.+)$/im;

export function extractSpanFromText(text: string): ParsedSpan | undefined {
  const labeled = text.match(DATE_LINE);
  if (labeled) {
    const fromLabel = parseSpanFragment(labeled[1]);
    if (fromLabel) return fromLabel;
  }

  // Иначе смотрим только вводную часть — дальше по тексту числа уже не про датировку
  return parseSpanFragment(text.slice(0, 600));
}

function parseSpanFragment(fragment: string): ParsedSpan | undefined {
  return (
    matchRomanCenturyRange(fragment) ??
    matchRomanCentury(fragment) ??
    matchBCRange(fragment) ??
    matchBCYear(fragment) ??
    matchYearRange(fragment) ??
    matchSingleYear(fragment)
  );
}

/** "VIII век до н.э. — V век н.э.", "XIV–XVI века" */
function matchRomanCenturyRange(text: string): ParsedSpan | undefined {
  const match = text.match(
    /\b([IVXLC]+)\s*(век[а-я]*|вв?\.)?\s*(до\s*н\.?\s*э\.?)?\s*[-–—]\s*([IVXLC]+)\s*(век[а-я]*|вв?\.)/i
  );
  if (!match) return undefined;

  const from = romanToInt(match[1]);
  const to = romanToInt(match[4]);
  if (from === null || to === null) return undefined;

  // "VIII век до н.э. — V век н.э.": маркер стоит только у первой границы
  const startIsBC = Boolean(match[3]);
  const tail = text.slice(match.index! + match[0].length, match.index! + match[0].length + 12);
  const endIsBC = BC_MARKER.test(tail);

  const start = centuryToSpan(from, startIsBC);
  const end = centuryToSpan(to, endIsBC);

  return {
    startYear: Math.min(start.startYear, end.startYear),
    endYear: Math.max(start.endYear, end.endYear),
    precision: 'century',
  };
}

/** "V век", "XV века до н.э." */
function matchRomanCentury(text: string): ParsedSpan | undefined {
  const match = text.match(/\b([IVXLC]+)\s*(?:век[а-я]*|вв?\.)\s*(до\s*н\.?\s*э\.?)?/i);
  if (!match) return undefined;

  const century = romanToInt(match[1]);
  if (century === null) return undefined;

  const span = centuryToSpan(century, Boolean(match[2]));
  return { ...span, precision: 'century' };
}

/** "384–322 до н.э.", "428/427–348/347 до н.э." */
function matchBCRange(text: string): ParsedSpan | undefined {
  const match = text.match(
    /\b(\d{1,4})(?:\/\d{1,4})?\s*[-–—]\s*(\d{1,4})(?:\/\d{1,4})?\s*до\s*н\.?\s*э\.?/i
  );
  if (!match) return undefined;

  const from = -Math.abs(parseInt(match[1], 10));
  const to = -Math.abs(parseInt(match[2], 10));

  return {
    startYear: Math.min(from, to),
    endYear: Math.max(from, to),
    precision: 'approximate',
  };
}

/** "около 350 до н.э." */
function matchBCYear(text: string): ParsedSpan | undefined {
  const match = text.match(/\b(\d{1,4})(?:\/\d{1,4})?\s*до\s*н\.?\s*э\.?/i);
  if (!match) return undefined;

  return {
    startYear: -Math.abs(parseInt(match[1], 10)),
    precision: 'approximate',
  };
}

/** "1770–1831", "около 397–400" */
function matchYearRange(text: string): ParsedSpan | undefined {
  const match = text.match(/\b(\d{3,4})\s*[-–—]\s*(\d{3,4})\b/);
  if (!match) return undefined;

  const from = parseInt(match[1], 10);
  const to = parseInt(match[2], 10);
  if (!isPlausibleYear(from) || !isPlausibleYear(to)) return undefined;

  return {
    startYear: Math.min(from, to),
    endYear: Math.max(from, to),
    precision: 'exact',
  };
}

/** "1795", "1925 (опубликовано посмертно)" */
function matchSingleYear(text: string): ParsedSpan | undefined {
  const match = text.match(/\b(\d{3,4})\b/);
  if (!match) return undefined;

  const year = parseInt(match[1], 10);
  if (!isPlausibleYear(year)) return undefined;

  return { startYear: year, precision: 'exact' };
}

function isPlausibleYear(year: number): boolean {
  return year >= 100 && year <= new Date().getFullYear();
}

/**
 * Фолбэк для эпох: если в тексте датировки нет, берём её из названия.
 */
function guessSpanFromContext(note: ArcheNote): ParsedSpan | undefined {
  if (note.type !== 'time' && note.folder !== '01_Time') {
    return undefined;
  }

  const title = note.title.toLowerCase();
  const epochs: Array<[RegExp, number, number]> = [
    [/античност/, -800, 500],
    [/средневеков|средние века/, 500, 1400],
    [/возрожден/, 1400, 1600],
    [/новое время/, 1600, 1800],
    [/предмодерн/, 1800, 1900],
    [/постмодерн/, 1950, 2025],
    [/модерн/, 1900, 1950],
  ];

  for (const [pattern, startYear, endYear] of epochs) {
    if (pattern.test(title)) {
      return { startYear, endYear, precision: 'century' };
    }
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
  if (note.type === 'culture') score += 0.2;
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
