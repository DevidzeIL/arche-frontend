/**
 * Проверка хранилища.
 *
 * Приложение спроектировано так, чтобы кривая заметка ничего не ломала:
 * parseNote при ошибке возвращает null, notesById.set перезаписывает дубль,
 * firstImageOf на пропавший файл отдаёт null. Это правильно для рантайма —
 * одна опечатка не должна ронять сайт, — но означает, что заметка может
 * молча исчезнуть, и никто об этом не узнает.
 *
 * Скрипт делает это заметным до сборки. Запуск: pnpm lint:vault
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = path.join(root, 'arche-vault');
const IMGS = path.join(VAULT, '_imgs');

/** Папки с ведущим подчёркиванием в приложение не попадают */
function walk(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else if (entry.name.endsWith('.md')) out.push(rel);
  }
  return out;
}

const normalize = (value) => value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/ё/g, 'е');

const images = new Set(
  fs.existsSync(IMGS) ? fs.readdirSync(IMGS).map(normalize) : []
);

const files = walk(VAULT);
const notes = [];

for (const rel of files) {
  const raw = fs.readFileSync(path.join(VAULT, rel), 'utf8');
  const front = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const field = (name) => front.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim();

  notes.push({
    rel,
    raw,
    front,
    id: field('id'),
    type: field('type'),
    title: path.basename(rel, '.md'),
    startYear: field('start_year'),
    endYear: field('end_year'),
    lat: field('lat'),
    lon: field('lon'),
    wikidata: field('wikidata'),
  });
}

const titles = new Set(notes.map((n) => normalize(n.title)));
const problems = [];
const warnings = [];

const seenIds = new Map();
for (const note of notes) {
  if (!note.id) {
    problems.push(`${note.rel}: нет поля id — заметка получит путь вместо адреса`);
  } else if (seenIds.has(note.id)) {
    problems.push(
      `${note.rel}: id «${note.id}» уже занят (${seenIds.get(note.id)}) — одна из заметок исчезнет`
    );
  } else {
    seenIds.set(note.id, note.rel);
  }

  if (!note.type) warnings.push(`${note.rel}: нет поля type — попадёт в «Заметки»`);

  if (note.startYear && note.endYear && Number(note.endYear) < Number(note.startYear)) {
    problems.push(`${note.rel}: интервал перевёрнут (${note.startYear}..${note.endYear})`);
  }

  // Ручная привязка к Wikidata: опечатка в ней молча отвяжет заметку от справки
  if (note.wikidata && !/^(Q\d+|none)$/.test(note.wikidata.replace(/^["']|["']$/g, ''))) {
    problems.push(`${note.rel}: wikidata «${note.wikidata}» — нужен идентификатор вида Q9312 или none`);
  }

  if (note.type === 'place' && (!note.lat || !note.lon)) {
    problems.push(`${note.rel}: место без координат — не попадёт на глобус`);
  }

  const body = note.raw.slice(note.front ? note.raw.indexOf('---', 3) + 3 : 0);

  for (const match of body.matchAll(/!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]|!\[[^\]]*\]\(([^)]+)\)/g)) {
    const file = (match[1] ?? match[2] ?? '').split('/').pop();
    if (file && !images.has(normalize(file))) {
      problems.push(`${note.rel}: изображение «${file}» не найдено в _imgs`);
    }
  }

  const withoutCode = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  for (const match of withoutCode.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = match[1].split('|')[0].split('#')[0].trim();
    if (!target || /\.(png|jpe?g|gif|webp|svg)$/i.test(target)) continue;
    if (!titles.has(normalize(target))) {
      warnings.push(`${note.rel}: ссылка на несуществующую заметку «${target}»`);
    }
  }
}

/**
 * Поправки к границам (arche-vault/_borders). Опечатка в названии
 * государства здесь не ломает сборку, а молча не срабатывает: заплатка
 * для «Swiss Confederaton» вернёт Женеву никому.
 */
const BORDERS = path.join(VAULT, '_borders');
const INDEX = path.join(root, 'public', 'borders', 'index.json');

function readJson(file, label) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    problems.push(`${label}: не разбирается как JSON — ${error.message}`);
    return null;
  }
}

const polityKeys = new Set(
  (readJson(INDEX, 'public/borders/index.json')?.polities ?? []).map((p) => (p.u ? `(${p.n})` : p.n))
);
const known = (name) => polityKeys.size === 0 || polityKeys.has(name);

const patches = readJson(path.join(BORDERS, 'patches.geojson'), '_borders/patches.geojson');
for (const [i, feature] of (patches?.features ?? []).entries()) {
  const p = feature.properties ?? {};
  const label = `_borders/patches.geojson #${i + 1} «${p.name ?? '?'}»`;
  if (!p.name || !p.ru) problems.push(`${label}: нужны поля name и ru`);
  if (!Number.isInteger(p.from) || !Number.isInteger(p.to) || p.to < p.from) {
    problems.push(`${label}: годы from/to не заданы или перевёрнуты`);
  }
  if (!['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) {
    problems.push(`${label}: геометрия должна быть Polygon или MultiPolygon`);
  }
  if (p.polity && !known(p.polity)) problems.push(`${label}: государства «${p.polity}» нет в Cliopatria`);
  if (p.within && !known(p.within)) problems.push(`${label}: объединения «${p.within}» нет в Cliopatria`);
  if (p.draw !== undefined && typeof p.draw !== 'boolean') {
    problems.push(`${label}: draw — true или false, без кавычек`);
  }
}

const names = readJson(path.join(BORDERS, 'names.json'), '_borders/names.json') ?? {};
for (const [name, value] of Object.entries(names)) {
  if (name === '_') continue;
  // Названия фона (historical-basemaps) в индекс не входят — только предупреждаем
  if (!known(name) && !known(`(${name})`)) {
    warnings.push(`_borders/names.json: «${name}» нет среди государств Cliopatria`);
  }
  if (Array.isArray(value) && value.some((r) => !r.ru)) {
    problems.push(`_borders/names.json: у «${name}» есть отрезок без ru`);
  }
}

const list = (label, items) => {
  if (items.length === 0) return;
  console.log(`\n${label} (${items.length}):`);
  for (const item of items) console.log(`  ${item}`);
};

console.log(`Проверено заметок: ${notes.length}`);
list('ОШИБКИ', problems);
list('Предупреждения', warnings);

if (problems.length === 0 && warnings.length === 0) {
  console.log('\nВсё в порядке.');
}

// Предупреждения сборку не роняют: незаполненный type или ссылка на
// будущую заметку — нормальное состояние растущего хранилища
process.exit(problems.length > 0 ? 1 : 0);
