import matter from 'gray-matter';
import type { ArcheNote, NoteGeo, NoteTimeSpan } from '../types';

// Игнорируемые папки
export const EXCLUDED_FOLDERS = ['_rules', '_templates'];

// Нормализация wikilink target
export function normalizeWikilinkTarget(raw: string): string | null {
  // Убираем |alias
  let normalized = raw.split('|')[0];
  // Убираем #heading
  normalized = normalized.split('#')[0];
  // Trim
  normalized = normalized.trim();
  // Игнорируем пустые
  if (!normalized) {
    return null;
  }
  return normalized;
}

// Извлечение wikilinks из markdown (без code blocks)
export function extractWikilinks(content: string): string[] {
  // Сначала удаляем fenced code blocks
  let cleaned = content.replace(/```[\s\S]*?```/g, '');
  // Затем удаляем inline code
  cleaned = cleaned.replace(/`[^`]*`/g, '');
  
  // Теперь ищем wikilinks
  const wikilinkRegex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match;

  while ((match = wikilinkRegex.exec(cleaned)) !== null) {
    const linkText = match[1];
    const normalized = normalizeWikilinkTarget(linkText);
    if (normalized) {
      links.push(normalized);
    }
  }

  return [...new Set(links)]; // Убираем дубликаты
}

// Преобразование markdown в plain text (для поиска)
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#+\s+/gm, '') // Убираем заголовки
    .replace(/!\[\[[^\]]+\]\]/g, '') // Убираем ![[image.png]]
    .replace(/!\[[^\]]*\]\([^\)]+\)/g, '') // Убираем ![alt](path)
    .replace(/<img[^>]+>/gi, '') // Убираем <img> теги
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // [[links]] -> links
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // [text](url) -> text
    .replace(/\*\*([^\*]+)\*\*/g, '$1') // **bold** -> bold
    .replace(/\*([^\*]+)\*/g, '$1') // *italic* -> italic
    .replace(/`([^`]+)`/g, '$1') // `code` -> code
    .replace(/^\s*[-*+]\s+/gm, '') // Убираем маркеры списков
    .replace(/^\s*\d+\.\s+/gm, '') // Убираем нумерацию
    .replace(/^\s*!?[^\s]+\.(png|jpg|jpeg|gif|webp|svg)\s*/gim, '') // Убираем названия файлов изображений в начале строки
    .replace(/\n+/g, ' ') // Множественные переносы -> пробел
    .trim();
}

const PRECISIONS = ['exact', 'approximate', 'century'] as const;

/**
 * Читает явный временной интервал из frontmatter.
 *
 * Поддерживаются плоские поля (удобно редактировать в Obsidian):
 *   start_year: -428
 *   end_year: -348
 *   display_year: -428
 *   year_precision: exact | approximate | century
 *
 * и вложенная форма для обратной совместимости:
 *   timeline:
 *     start_year: -428
 */
export function parseTimeSpan(frontmatter: Record<string, unknown>): NoteTimeSpan | undefined {
  const nested =
    frontmatter.timeline && typeof frontmatter.timeline === 'object'
      ? (frontmatter.timeline as Record<string, unknown>)
      : {};

  const readYear = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const raw = frontmatter[key] ?? nested[key];
      if (raw === undefined || raw === null || raw === '') continue;
      const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (Number.isFinite(value)) return value;
    }
    return undefined;
  };

  const startYear = readYear('start_year', 'startYear');
  if (startYear === undefined) return undefined;

  let endYear = readYear('end_year', 'endYear');
  // Перевёрнутый интервал — данные явно ошибочны, разворачиваем вместо тихой поломки раскладки
  let normalizedStart = startYear;
  if (endYear !== undefined && endYear < normalizedStart) {
    [normalizedStart, endYear] = [endYear, normalizedStart];
  }

  const rawPrecision = frontmatter.year_precision ?? nested.precision;
  const precision = PRECISIONS.find((p) => p === String(rawPrecision ?? '').trim());

  return {
    startYear: normalizedStart,
    endYear,
    displayYear: readYear('display_year', 'displayYear'),
    precision,
  };
}

/** Строка или список строк из frontmatter — обе формы удобны в Obsidian */
function readList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Координаты заметки-места:
 *
 *   lat: 37.98
 *   lon: 23.73
 *   scale: city | region
 *   aliases: [Афины, Аттика]
 *
 * Координаты есть только у мест. Остальные заметки к местам привязываются
 * по названию — так же, как связи между заметками задаются ссылками,
 * а не продублированными данными.
 */
export function parseGeo(frontmatter: Record<string, unknown>): NoteGeo | undefined {
  const read = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const raw = frontmatter[key];
      if (raw === undefined || raw === null || raw === '') continue;
      const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (Number.isFinite(value)) return value;
    }
    return undefined;
  };

  const lat = read('lat', 'latitude');
  const lon = read('lon', 'lng', 'longitude');
  if (lat === undefined || lon === undefined) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;

  return {
    lat,
    lon,
    scale: String(frontmatter.scale ?? '').trim() === 'region' ? 'region' : 'city',
    aliases: readList(frontmatter.aliases),
  };
}

// Парсинг одного файла
export function parseNote(
  filePath: string,
  rawContent: string
): ArcheNote | null {
  try {
    const { data: frontmatter, content: body } = matter(rawContent);

    // Определяем папку из пути
    const pathParts = filePath.split('/');
    const folder = pathParts[0] || '';

    // Игнорируем файлы из скрытых папок
    if (EXCLUDED_FOLDERS.includes(folder) || folder.startsWith('_')) {
      return null;
    }

    // Извлекаем название из имени файла
    const fileName = pathParts[pathParts.length - 1] || '';
    const title = fileName.replace(/\.md$/, '').trim();

    // Нормализация domain (может быть строкой или массивом)
    let domain: string[] = [];
    if (frontmatter.domain) {
      if (Array.isArray(frontmatter.domain)) {
        domain = frontmatter.domain;
      } else if (typeof frontmatter.domain === 'string') {
        domain = [frontmatter.domain];
      }
    }

    // Извлекаем links из body (YAML frontmatter уже удалён matter)
    const links = extractWikilinks(body);
    const plainText = markdownToPlainText(body);

    // Нормализация дат - убеждаемся, что это строки
    let created: string | undefined;
    if (frontmatter.created) {
      if (frontmatter.created instanceof Date) {
        created = frontmatter.created.toISOString().split('T')[0];
      } else {
        created = String(frontmatter.created);
      }
    }

    let updated: string | undefined;
    if (frontmatter.updated) {
      if (frontmatter.updated instanceof Date) {
        updated = frontmatter.updated.toISOString().split('T')[0];
      } else {
        updated = String(frontmatter.updated);
      }
    }

    return {
      id: frontmatter.id || filePath,
      path: filePath,
      title,
      type: frontmatter.type,
      domain,
      status: frontmatter.status,
      group: frontmatter.group,
      created,
      updated,
      folder,
      rawContent,
      body,
      plainText,
      links,
      timeSpan: parseTimeSpan(frontmatter),
      geo: parseGeo(frontmatter),
      places: readList(frontmatter.place ?? frontmatter.places),
    };
  } catch (error) {
    // Error parsing note - skip silently
    return null;
  }
}

// Загрузка всех заметок через import.meta.glob
export async function loadNotes(): Promise<ArcheNote[]> {
  // import.meta.glob работает относительно корня проекта
  // Пробуем путь относительно src (где находится код)
  let foundModules: Record<string, any> = {};
  
  // Вариант 1: относительно src (рекомендуемый)
  foundModules = import.meta.glob('../arche-vault/**/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  });

  // Вариант 2: с ведущим слешем (если первый не работает)
  if (Object.keys(foundModules).length === 0) {
    foundModules = import.meta.glob('/arche-vault/**/*.md', {
      query: '?raw',
      import: 'default',
      eager: true,
    });
  }

  // Вариант 3: с './' (относительно корня)
  if (Object.keys(foundModules).length === 0) {
    foundModules = import.meta.glob('./arche-vault/**/*.md', {
      query: '?raw',
      import: 'default',
      eager: true,
    });
  }

  
  const notes: ArcheNote[] = [];

  for (const [path, content] of Object.entries(foundModules)) {
    // Убираем различные префиксы из пути
    let relativePath = path
      .replace(/^\.\.\/arche-vault\//, '')
      .replace(/^\/arche-vault\//, '')
      .replace(/^\.\/arche-vault\//, '')
      .replace(/^arche-vault\//, '');
    
    const note = parseNote(relativePath, content as string);
    if (note) {
      notes.push(note);
    }
  }

  return notes;
}

