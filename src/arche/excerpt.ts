/**
 * Короткая выжимка из заметки для карточек и превью.
 *
 * plainText из парсера для этого не годится: он склеивает заголовок,
 * строки метаданных и текст в одну ленту, и превью начинается с
 * «Гераклит Годы жизни: около 544–483 до н.э. Страна / культура: …» —
 * то есть с того, что и так написано рядом.
 */

import type { ArcheNote } from './types';

/** `**Годы жизни:** 384–322` и подобные строки шапки */
const METADATA_LINE = /^\s*\*\*[^*]+:\*\*/;
const HEADING = /^\s*#{1,6}\s/;
const LIST_ITEM = /^\s*[-*+]\s/;
const IMAGE_LINE = /^\s*!\[/;
const FRONTMATTER_LEFTOVER = /^\s*---\s*$/;

function stripInlineMarkup(text: string): string {
  return text
    .replace(/!\[\[[^\]]+\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => alias || target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Убирает раздел вместе с его содержимым (до следующего заголовка того же уровня).
 */
function stripSection(body: string, heading: string): string {
  const pattern = new RegExp(`^##\\s+${heading}\\s*$[\\s\\S]*?(?=^##\\s|\\z)`, 'gim');
  return body.replace(pattern, '');
}

/**
 * Тело заметки для показа на странице.
 *
 * Раздел «Связи» вырезается: это исходные данные для графа, и приложение
 * рисует их гораздо содержательнее — с типом связи, направлением во времени
 * и обратными ссылками. Три похожих блока подряд читателю не нужны.
 *
 * «Карточки» вырезаются по той же причине: строки вида «вопрос :: ответ»
 * читаются как опечатка, а показывает их отдельный блок.
 */
export function bodyForDisplay(note: ArcheNote): string {
  return stripSection(stripSection(note.body, 'Связи'), 'Карточки')
    // Заголовок первого уровня повторяет название, которое шаблон уже показал
    .replace(/^\s*#\s+.+$/m, '')
    .trimEnd();
}

/**
 * Убирает изображения из markdown — для шаблонов, которые показывают
 * обложку сами: иначе одна и та же картинка рендерится дважды.
 */
export function stripImages(markdown: string): string {
  return markdown
    .replace(/!\[\[[^\]]+\]\]\s*/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)\s*/g, '');
}

/**
 * Первый содержательный абзац: пропускаем заголовки, картинки,
 * строки метаданных и списки.
 */
export function excerptOf(note: ArcheNote, maxLength = 220): string {
  const paragraphs = note.body.split(/\r?\n\s*\r?\n/);

  for (const raw of paragraphs) {
    const lines = raw
      .split(/\r?\n/)
      .filter(
        (line) =>
          line.trim() &&
          !HEADING.test(line) &&
          !METADATA_LINE.test(line) &&
          !IMAGE_LINE.test(line) &&
          !LIST_ITEM.test(line) &&
          !FRONTMATTER_LEFTOVER.test(line)
      );

    const text = stripInlineMarkup(lines.join(' '));
    if (text.length >= 40) {
      return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
    }
  }

  // Заметка совсем короткая — отдаём что есть, лишь бы не пустоту
  const fallback = stripInlineMarkup(note.plainText ?? '');
  return fallback.length > maxLength ? `${fallback.slice(0, maxLength).trimEnd()}…` : fallback;
}
