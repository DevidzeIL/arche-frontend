/**
 * Парсер метаданных из frontmatter заметки
 * Использует gray-matter для парсинга YAML
 */

import { ArcheNote } from '@/arche/types';
import { PersonMetadata, WorkMetadata, ConceptMetadata, TimeMetadata } from './types';
import matter from 'gray-matter';

export function parseMetadata(note: ArcheNote): PersonMetadata | WorkMetadata | ConceptMetadata | TimeMetadata | null {
  try {
    // Используем gray-matter для парсинга frontmatter
    const parsed = matter(note.rawContent);
    const metadata = parsed.data || {};
    
    // Обрабатываем массивы (gray-matter может вернуть строку)
    Object.keys(metadata).forEach(key => {
      const value = metadata[key];
      if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
        try {
          metadata[key] = JSON.parse(value);
        } catch {
          // Если не JSON, парсим вручную
          metadata[key] = value.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        }
      }
    });
    
    // Возвращаем соответствующий тип метаданных
    switch (note.type) {
      case 'person':
        return metadata as PersonMetadata;
      case 'work':
        return metadata as WorkMetadata;
      case 'concept':
        return metadata as ConceptMetadata;
      case 'time':
      case 'epoch':
        return metadata as TimeMetadata;
      default:
        return null;
    }
  } catch (e) {
    // Failed to parse metadata - skip silently
    return null;
  }
}

