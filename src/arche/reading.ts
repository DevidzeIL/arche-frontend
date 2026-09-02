/**
 * Литература: что читать по заметке и где это взять.
 *
 * ПОЧЕМУ ССЫЛКИ, А НЕ ТЕКСТ. Соблазн наполнить хранилище выдержками из
 * открытых источников велик, но чужой энциклопедический абзац ломает то,
 * ради чего заметки писались: правила требуют человеческого языка и
 * понимания, а не полноты. К тому же Википедия распространяется под
 * CC BY-SA (заражает лицензией всё производное), а Stanford Encyclopedia
 * закрыта копирайтом. Поэтому здесь живут отсылки, а текст остаётся своим.
 *
 * Формат — обычный markdown-список, который читается и в Obsidian:
 *
 *   ## Что читать
 *
 *   - {первичный} Платон — «Апология Сократа» — [Викитека](https://…)
 *   - {проводник} [Socrates — Stanford Encyclopedia](https://…)
 *   - {обзор} Тарнас — «История западного мышления», гл. 1
 *
 * Маркер в фигурных скобках необязателен; без него запись считается обзором.
 */
import type { ArcheNote } from './types';

export const READING_KINDS = ['первичный', 'проводник', 'обзор', 'контекст'] as const;
export type ReadingKind = (typeof READING_KINDS)[number];

export interface ReadingKindMeta {
  label: string;
  /** Чем эта запись полезна — подпись под группой */
  hint: string;
  /** Порядок: сначала то, с чего начинать */
  order: number;
}

export const READING_META: Record<ReadingKind, ReadingKindMeta> = {
  первичный: {
    label: 'Первоисточник',
    hint: 'сам текст, а не пересказ',
    order: 0,
  },
  проводник: {
    label: 'Проводник',
    hint: 'помогает войти в трудный текст',
    order: 1,
  },
  обзор: {
    label: 'Обзор',
    hint: 'общая картина и контекст',
    order: 2,
  },
  контекст: {
    label: 'Рядом',
    hint: 'смежное, если захочется дальше',
    order: 3,
  },
};

export interface ReadingItem {
  /** Стабильный ключ: по нему запоминается «прочитано» */
  id: string;
  noteId: string;
  noteTitle: string;
  kind: ReadingKind;
  /** Человеческая подпись без ссылки */
  text: string;
  url?: string;
  /** Где взять: «Викитека», «Gutenberg» — подпись ссылки */
  source?: string;
}

/** Заголовки, под которыми в хранилище лежит литература */
const READING_HEADING = /^(что читать|источники|литература|источники \/ литература)/i;
const ANY_HEADING = /^##\s+/;

/** `- {первичный} Текст — [Подпись](url)` */
const ITEM = /^\s*[-*]\s+(?:\{([^}]+)\}\s*)?(.+)$/;
const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/;
const BARE_URL = /(https?:\/\/\S+)/;

/** Заглушка из шаблона — не запись, а признак ненаписанного */
const PLACEHOLDER = /^требуется источник/i;

/** Кредит к картинке живёт в том же списке, но литературой не является */
const IMAGE_CREDIT = /^(изображение|фото|иллюстрация)\s*:/i;

/**
 * Старый формат помечал вид в конце строки: «Платон — Апология (первичный)».
 * Он остаётся рабочим — переписывать восемьдесят пять строк ради синтаксиса
 * незачем, разбор понимает оба.
 */
// \w в JavaScript — это [A-Za-z0-9_], кириллицу он не покрывает,
// поэтому окончания перечисляем явным классом
const TRAILING_KIND = /\s*\((первичн[а-яё]*|обзорн[а-яё]*|проводник[а-яё]*)\)\s*$/i;

function kindFromSuffix(text: string): ReadingKind | null {
  const match = text.match(TRAILING_KIND);
  if (!match) return null;
  const word = match[1].toLowerCase();
  if (word.startsWith('первичн')) return 'первичный';
  if (word.startsWith('проводник')) return 'проводник';
  return 'обзор';
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function normalizeKind(raw: string | undefined): ReadingKind {
  const value = (raw ?? '').trim().toLowerCase();
  return (READING_KINDS as readonly string[]).includes(value)
    ? (value as ReadingKind)
    : 'обзор';
}

/** Литература одной заметки в порядке «сначала первоисточник» */
export function readingOf(note: ArcheNote): ReadingItem[] {
  const lines = note.body.split(/\r?\n/);
  const items: ReadingItem[] = [];
  let inside = false;

  for (const line of lines) {
    if (ANY_HEADING.test(line)) {
      inside = READING_HEADING.test(line.replace(ANY_HEADING, '').trim());
      continue;
    }
    if (!inside) continue;

    const match = line.match(ITEM);
    if (!match) continue;

    let text = match[2].trim();
    if (!text || PLACEHOLDER.test(text) || IMAGE_CREDIT.test(text)) continue;

    // Явный маркер главнее; иначе смотрим на старый суффикс в конце строки
    const kind = match[1] ? normalizeKind(match[1]) : (kindFromSuffix(text) ?? 'обзор');

    let url: string | undefined;
    let source: string | undefined;

    const linked = text.match(MARKDOWN_LINK);
    if (linked) {
      source = linked[1];
      url = linked[2];
      // Убираем саму ссылку из подписи — она показывается отдельно
      text = text.replace(MARKDOWN_LINK, '').replace(/[—·|]\s*$/, '').trim();
      if (!text) text = source;
    } else {
      const bare = text.match(BARE_URL);
      if (bare) {
        url = bare[1];
        text = text.replace(BARE_URL, '').replace(/[—·|]\s*$/, '').trim();
      }
    }

    // Хвост вида «(первичный)» из старого формата: он уже стал маркером
    text = text.replace(TRAILING_KIND, '').trim();
    if (!text) continue;

    items.push({
      id: `${note.id}:${hash(text)}`,
      noteId: note.id,
      noteTitle: note.title,
      kind,
      text,
      url,
      source,
    });
  }

  return items.sort((a, b) => READING_META[a.kind].order - READING_META[b.kind].order);
}

/** Есть ли в заметке незаполненная заглушка источника */
export function needsSource(note: ArcheNote): boolean {
  return /требуется источник/i.test(note.body);
}

/** Вся литература хранилища */
export function collectReading(notes: ArcheNote[]): ReadingItem[] {
  return notes.flatMap(readingOf);
}
