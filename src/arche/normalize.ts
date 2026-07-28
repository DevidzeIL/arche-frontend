/**
 * Нормализация названий для сопоставления wikilink'ов с заметками.
 * Живёт отдельно от стора, чтобы графом знаний можно было пользоваться
 * без загрузки zustand и всего хранилища (тесты, скрипты, разбор данных).
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim()
    .replace(/\s+/g, ' ');
}
