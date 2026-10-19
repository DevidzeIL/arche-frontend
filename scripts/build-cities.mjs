/**
 * Города для глобуса — из Wikidata.
 *
 * Места хранилища — это заметки, и их немного: город появляется на карте,
 * когда о нём есть что сказать. Но без соседних городов карта читается
 * плохо — непонятно, где Кёнигсберг относительно Берлина и Варшавы. Этот
 * слой — ориентиры: названия, год основания, координаты. Текста нет.
 *
 * Выборка — по прямым типам (P31): обход подклассов WDQS не успевает.
 * Тип берётся с любым рангом (p:P31/ps:P31): у Вроцлава «город»
 * записан обычным рангом рядом с предпочтительным «городом на правах
 * повята», и wdt:P31 его не видит.
 *
 * Известность — не общее число статей: ботовые разделы (себуанский,
 * варайский) создают статьи о каждой деревне, и польская деревня Курув
 * оказывается известнее Минска. Считаются только статьи в тридцати
 * крупных Википедиях.
 *
 * Названия по годам (Константинополь → Стамбул) и исправления дат —
 * из рукописного scripts/data/city-names.ru.json.
 *
 * Запуск: pnpm cities. Ответы кэшируются в .cache/cities.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunk, idOf, pointOf, wikidataClient, yearOf } from './lib/wikidata.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, '.cache', 'cities');
const OUT = path.join(root, 'public', 'context');
fs.mkdirSync(OUT, { recursive: true });

const { sparql, entities } = wikidataClient(CACHE);

/**
 * Тип → порог по общему числу статей (чтобы WDQS отвечал быстро) и
 * признак древности: древнему городу хватает меньшей известности
 */
const CLASSES = [
  { id: 'Q515', label: 'город', minLinks: 40 },
  { id: 'Q1549591', label: 'крупный город', minLinks: 40 },
  { id: 'Q1637706', label: 'город-миллионник', minLinks: 20 },
  { id: 'Q200250', label: 'метрополис', minLinks: 20 },
  { id: 'Q5119', label: 'столица', minLinks: 20 },
  { id: 'Q51929311', label: 'крупнейший город страны', minLinks: 20 },
  { id: 'Q7930989', label: 'город (поселение)', minLinks: 50 },
  { id: 'Q925381', label: 'город на правах повята', minLinks: 50 },
  { id: 'Q12131624', label: 'город областного значения Украины', minLinks: 50 },
  { id: 'Q2264924', label: 'портовый город', minLinks: 50 },
  { id: 'Q15661340', label: 'древний город', minLinks: 20, ancient: true },
  { id: 'Q133442', label: 'город-государство', minLinks: 20, ancient: true },
  { id: 'Q148837', label: 'полис', minLinks: 20, ancient: true },
  { id: 'Q2202509', label: 'город Римской империи', minLinks: 15, ancient: true },
  { id: 'Q1266818', label: 'исторический город', minLinks: 20, ancient: true },
  { id: 'Q3957', label: 'малый город', minLinks: 70 },
  { id: 'Q484170', label: 'коммуна Франции', minLinks: 100 },
  { id: 'Q747074', label: 'коммуна Италии', minLinks: 80 },
  { id: 'Q42744322', label: 'городская община Германии', minLinks: 70 },
  { id: 'Q1093829', label: 'город США', minLinks: 100 },
  { id: 'Q2074737', label: 'муниципалитет Испании', minLinks: 80 },
];

/** Крупные Википедии: статья в них — признак известности, а не работы бота */
const MAJOR = [
  'en', 'de', 'fr', 'es', 'it', 'ru', 'pl', 'ja', 'zh', 'pt', 'nl', 'uk', 'ar', 'fa', 'tr',
  'ko', 'he', 'el', 'cs', 'hu', 'fi', 'ro', 'bg', 'sr', 'da', 'no', 'id', 'vi', 'hi', 'la',
].map((code) => `${code}wiki`);
/** Сколько крупных Википедий должно писать о городе, чтобы он попал на карту */
const MIN_MAJOR = 12;
const MIN_MAJOR_ANCIENT = 7;
/**
 * Город без даты основания, но с идентификатором Pleiades (P1584) —
 * справочника мест античного мира — существовал в античности. Точный
 * год неизвестен, поэтому берётся условное начало эпохи: Неаполь и Кёльн
 * видны в римское время, а не только с 1500 года
 */
const ANTIQUE_FROM = 0;

const found = new Map();
for (const cls of CLASSES) {
  const rows = await sparql(
    `SELECT ?item ?coord ?links ?inc ?first ?dis WHERE {
  ?item p:P31 ?st. ?st ps:P31 wd:${cls.id}. FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
  ?item wikibase:sitelinks ?links; wdt:P625 ?coord.
  FILTER(?links >= ${cls.minLinks})
  OPTIONAL { ?item wdt:P571 ?inc }
  OPTIONAL { ?item wdt:P1249 ?first }
  OPTIONAL { ?item wdt:P576 ?dis }
}`,
    `class-${cls.id}-${cls.minLinks}-v2`
  );
  let added = 0;
  for (const row of rows) {
    const id = idOf(row.item.value);
    const point = pointOf(row.coord.value);
    if (!point) continue;
    const entry = found.get(id) ?? { id, point, links: Number(row.links.value), inc: null, first: null, dis: null, ancient: false };
    // Основан — самой ранней датой из указанных (у Вавилона их две), упразднён — поздней
    const inc = yearOf(row.inc?.value);
    const first = yearOf(row.first?.value);
    const dis = yearOf(row.dis?.value);
    if (inc !== null && (entry.inc === null || inc < entry.inc)) entry.inc = inc;
    if (first !== null && (entry.first === null || first < entry.first)) entry.first = first;
    if (dis !== null && (entry.dis === null || dis > entry.dis)) entry.dis = dis;
    if (cls.ancient) entry.ancient = true;
    if (!found.has(id)) added += 1;
    found.set(id, entry);
  }
  console.log(`  ${cls.label}: ${rows.length} строк, новых ${added}`);
}

// Подписи, статьи и число крупных Википедий — без утверждений: полные элементы городов весят мегабайты
const meta = await entities('meta-v2', [...found.keys()], 'props=labels|sitelinks&languages=ru|en', (e) => ({
  ru: e.labels?.ru?.value ?? null,
  en: e.labels?.en?.value ?? null,
  ruwiki: e.sitelinks?.ruwiki?.title ?? null,
  enwiki: e.sitelinks?.enwiki?.title ?? null,
  major: MAJOR.filter((site) => e.sitelinks?.[site]).length,
}));

/**
 * Население и признак античности — отдельными лёгкими запросами по готовому
 * списку. Население нужно для порядка: тридцать из тридцати Википедий пишут
 * и о Штутгарте, и о трёхтысячном Куруве, а показывать первым надо Штутгарт
 */
const ids = [...found.keys()].sort();
for (const [i, batch] of chunk(ids, 300).entries()) {
  const values = batch.map((id) => `wd:${id}`).join(' ');
  const pop = await sparql(
    `SELECT ?item (MAX(?p) AS ?pop) WHERE { VALUES ?item { ${values} } ?item wdt:P1082 ?p. } GROUP BY ?item`,
    `population-${i}-${batch.length}`
  );
  for (const row of pop) found.get(idOf(row.item.value)).pop = Number(row.pop.value);
  const pleiades = await sparql(
    `SELECT DISTINCT ?item WHERE { VALUES ?item { ${values} } ?item wdt:P1584 ?p. }`,
    `pleiades-${i}-${batch.length}`
  );
  for (const row of pleiades) found.get(idOf(row.item.value)).antique = true;
}

/**
 * Порядок показа: крупные Википедии, общее число статей (с потолком: у
 * Курува их 237) и население. Древнему городу без населения — надбавка,
 * иначе Троя проиграла бы любому райцентру
 */
const scoreOf = (city) => {
  const links = Math.min(8, Math.max(0, (city.links - 60) / 25));
  const pop = city.pop ? Math.min(3, Math.max(0, Math.log10(city.pop) - 4)) * 2 : 0;
  const ancient = !city.pop && (city.ancient || city.antique) ? 5 : 0;
  return city.major + links + pop + ancient;
};

const data = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'data', 'city-names.ru.json'), 'utf8'));

const PRESENT = new Date().getFullYear();
const rows = [];
let dropped = 0;
const cities = [...found.values()]
  .map((city) => ({ ...city, major: meta[city.id]?.major ?? 0 }))
  .map((city) => ({ ...city, score: scoreOf(city) }))
  .sort((a, b) => b.score - a.score || b.links - a.links);
for (const city of cities) {
  const m = meta[city.id];
  const name = m?.ru ?? m?.en;
  if (!name) continue;
  if (city.major < (city.ancient ? MIN_MAJOR_ANCIENT : MIN_MAJOR)) {
    dropped += 1;
    continue;
  }
  // Основание: исправление из словаря, иначе дата основания, иначе первое упоминание.
  // Год из будущего или упразднение раньше основания — ошибка данных
  const raw = data.since[city.id] ?? city.inc ?? city.first ?? (city.antique ? ANTIQUE_FROM : null);
  const from = raw !== null && raw <= PRESENT ? raw : null;
  const to = city.dis !== null && (from === null || city.dis >= from) && city.dis <= PRESENT ? city.dis : null;
  rows.push([
    city.id,
    name,
    city.point[0],
    city.point[1],
    from,
    to,
    Math.round(city.score),
    m.ruwiki ?? null,
    m.ruwiki ? null : (m.enwiki ?? null),
    // Год основания условный — «существовал в античности»
    !data.since[city.id] && city.inc === null && city.first === null && city.antique ? 1 : 0,
  ]);
}

const kept = new Set(rows.map((r) => r[0]));
const missingRenames = Object.keys(data.names).filter((id) => !kept.has(id));
if (missingRenames.length) console.log(`  переименования без города в выборке: ${missingRenames.join(', ')}`);

fs.writeFileSync(
  path.join(OUT, 'cities.json'),
  JSON.stringify({
    fields: ['id', 'name', 'lon', 'lat', 'from', 'to', 'score', 'ru', 'en', 'approx'],
    rows,
    renames: data.names,
  })
);

const dated = rows.filter((r) => r[4] !== null && !r[9]).length;
const antique = rows.filter((r) => r[9]).length;
console.log(`Города: ${rows.length} (отсеяно малоизвестных: ${dropped}), с годом основания — ${dated}, античных без года — ${antique}`);
