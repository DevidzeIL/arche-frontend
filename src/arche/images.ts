/**
 * Разрешение путей к изображениям из arche-vault/_imgs.
 *
 * Vite подставляет реальные URL на этапе сборки, поэтому glob должен быть
 * статическим литералом. Модуль общий: им пользуется и рендер markdown,
 * и карточки на карте.
 */

const imageModules = import.meta.glob('../../arche-vault/_imgs/**/*.{png,jpg,jpeg,JPG,gif,webp,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** имя файла → URL, с нормализацией регистра и пробелов */
const byFilename = new Map<string, string>();

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

for (const [path, url] of Object.entries(imageModules)) {
  const filename = path.split('/').pop();
  if (filename) byFilename.set(normalizeName(filename), url);
}

export function resolveImage(filename: string): string | null {
  const name = filename.split('/').pop() ?? filename;
  return byFilename.get(normalizeName(name)) ?? null;
}

/** `![[file.png]]` и `![alt](file.png)` — обе формы встречаются в заметках */
const IMAGE_IN_BODY = /!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]|!\[[^\]]*\]\(([^)]+)\)/;

/**
 * Первое изображение заметки — для превью на карте и в карточках.
 * Возвращает null, если картинки нет или файл не найден.
 */
export function firstImageOf(body: string): string | null {
  const match = body.match(IMAGE_IN_BODY);
  if (!match) return null;
  const filename = (match[1] ?? match[2] ?? '').trim();
  if (!filename) return null;
  return resolveImage(filename);
}
