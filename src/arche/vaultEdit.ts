/**
 * Правка заметок прямо из приложения.
 *
 * Ручка записи существует только у dev-сервера (см. vite/vault-write.ts),
 * поэтому здесь всё начинается с VAULT_WRITABLE: в собранном приложении
 * ни одна из этих функций не должна ничего предлагать.
 *
 * Frontmatter правится текстом, а не через gray-matter. Разбор с обратной
 * сборкой переписал бы YAML по своему вкусу: переставил ключи, снял
 * кавычки, развернул списки в блочную форму. Файл-то остался бы valid,
 * но diff в git превратился бы в кашу, а хранилище редактируется ещё
 * и руками в Obsidian.
 */

/** Записывать в хранилище можно только с dev-сервера */
export const VAULT_WRITABLE = import.meta.env.DEV;

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/** Разделы, после которых новые блоки не дописываются: они всегда в хвосте */
const TRAILING_SECTIONS = ['источники / литература', 'источники', 'литература', 'что читать'];

const HEADING = /^##\s+(.+?)\s*$/;

export function frontmatterOf(raw: string): string | null {
  const match = raw.match(FRONTMATTER);
  return match ? match[1] : null;
}

function fieldOf(frontmatter: string, key: string): string | null {
  const match = frontmatter.match(new RegExp(`^${key}:\s*(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

/**
 * Проверка перед сохранением.
 *
 * Главное здесь — id. По нему интервальное повторение находит карточки
 * заметки после каждой пересборки хранилища: сменить id значит обнулить
 * всю статистику по этой заметке, ничего об этом не сказав.
 */
export function validateNoteSource(
  raw: string,
  note: { id: string; path: string }
): string | null {
  const frontmatter = frontmatterOf(raw);
  if (frontmatter === null) {
    return 'Пропал блок frontmatter — три дефиса в начале файла';
  }

  // note.id падает на путь файла, когда id во frontmatter не задан:
  // такую заметку сверять не с чем
  if (note.id !== note.path) {
    const id = fieldOf(frontmatter, 'id');
    if (!id) return 'Из frontmatter пропало поле id';
    if (id !== note.id) return `Поле id изменилось: было ${note.id}, стало ${id}`;
  }

  if (raw.replace(FRONTMATTER, '').trim().length === 0) {
    return 'Заметка осталась пустой';
  }

  return null;
}

/** Проставляет дату правки в frontmatter — так же, как это делается руками */
export function withUpdatedDate(raw: string, day: string): string {
  const frontmatter = frontmatterOf(raw);
  if (frontmatter === null) return raw;

  const updated =
    fieldOf(frontmatter, 'updated') !== null
      ? frontmatter.replace(/^updated:.*$/m, `updated: ${day}`)
      : fieldOf(frontmatter, 'created') !== null
        ? frontmatter.replace(/^(created:.*)$/m, `$1\nupdated: ${day}`)
        : `${frontmatter}\nupdated: ${day}`;

  return raw.replace(FRONTMATTER, `---\n${updated}\n---`);
}

function headingIndex(lines: string[], titles: string[]): number {
  return lines.findIndex((line) => {
    const match = line.match(HEADING);
    return match ? titles.includes(match[1].trim().toLowerCase()) : false;
  });
}

/**
 * Дописывает строку `- лицевая :: оборот` в раздел «## Карточки».
 *
 * Раздела может не быть — тогда он создаётся перед списком литературы,
 * а не в самом конце файла: источники по договорённости всегда последние.
 */
export function appendCard(raw: string, front: string, back: string): string {
  const line = `- ${front.trim()} :: ${back.trim()}`;
  const lines = raw.split('\n');

  const cardsAt = headingIndex(lines, ['карточки']);
  if (cardsAt >= 0) {
    let end = lines.length;
    for (let i = cardsAt + 1; i < lines.length; i++) {
      if (HEADING.test(lines[i])) {
        end = i;
        break;
      }
    }
    while (end > cardsAt + 1 && lines[end - 1].trim() === '') end--;
    lines.splice(end, 0, line);
    return lines.join('\n');
  }

  const trailingAt = headingIndex(lines, TRAILING_SECTIONS);
  const at = trailingAt >= 0 ? trailingAt : lines.length;

  const block = ['## Карточки', '', line, ''];
  if (at > 0 && lines[at - 1].trim() !== '') block.unshift('');

  lines.splice(at, 0, ...block);
  return lines.join('\n');
}

/** Сохранение. Возвращает текст ошибки или null, если всё прошло. */
export async function saveNoteFile(notePath: string, content: string): Promise<string | null> {
  if (!VAULT_WRITABLE) return 'Правка хранилища доступна только с локального сервера';

  try {
    const response = await fetch('/__vault/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: notePath, content }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      return payload.error ?? `Сервер ответил ${response.status}`;
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Не удалось связаться с сервером';
  }
}
