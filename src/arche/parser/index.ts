import matter from 'gray-matter';
import type { ArcheNote } from '../types';

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
    .replace(/\[\[([^\]]+)\]\]/g, '$1') // [[links]] -> links
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // [text](url) -> text
    .replace(/\*\*([^\*]+)\*\*/g, '$1') // **bold** -> bold
    .replace(/\*([^\*]+)\*/g, '$1') // *italic* -> italic
    .replace(/`([^`]+)`/g, '$1') // `code` -> code
    .replace(/^\s*[-*+]\s+/gm, '') // Убираем маркеры списков
    .replace(/^\s*\d+\.\s+/gm, '') // Убираем нумерацию
    .replace(/\n+/g, ' ') // Множественные переносы -> пробел
    .trim();
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
    };
  } catch (error) {
    console.error(`Error parsing note ${filePath}:`, error);
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

  console.log(`Found ${Object.keys(foundModules).length} markdown files`);
  if (Object.keys(foundModules).length > 0) {
    console.log('Sample paths:', Object.keys(foundModules).slice(0, 5));
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
    } else {
      console.warn(`Failed to parse note: ${relativePath} (original path: ${path})`);
    }
  }

  console.log(`Loaded ${notes.length} notes from arche-vault`);
  if (notes.length > 0) {
    console.log('Sample notes:', notes.slice(0, 3).map(n => ({ title: n.title, folder: n.folder })));
  }
  return notes;
}

