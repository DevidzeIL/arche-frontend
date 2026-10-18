/**
 * Исторические границы для глобуса: сборка из открытых наборов.
 *
 * Сырые данные весят 173 МБ (Cliopatria) и 76 МБ (historical-basemaps) —
 * в браузер такое не отдать. Скрипт упрощает геометрию, режет её по векам
 * и кладёт в public/borders/ готовые TopoJSON: глобус подтягивает только
 * тот век, на который смотрят.
 *
 * Версии наборов закреплены. Обновление границ — осознанный шаг, а не
 * побочный эффект пересборки: новая версия Cliopatria может переименовать
 * государство, и связанная с ним заметка молча потеряет соседство.
 *
 * Запуск: pnpm borders (несколько минут, скачивает ~120 МБ при первом запуске)
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import mapshaper from 'mapshaper';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, '.cache', 'borders');
const OUT = path.join(root, 'public', 'borders');

const CLIO_VERSION = 'v0.2.1';
const CLIO_URL = `https://github.com/Seshat-Global-History-Databank/cliopatria/raw/${CLIO_VERSION}/cliopatria.geojson.zip`;
const HB_COMMIT = 'da7a4b735ecef70aebdc9c73e409d8a2500d50f3';
const HB_RAW = `https://raw.githubusercontent.com/aourednik/historical-basemaps/${HB_COMMIT}/geojson`;
const HB_API = `https://api.github.com/repos/aourednik/historical-basemaps/contents/geojson?ref=${HB_COMMIT}`;

/**
 * Шаг упрощения в метрах. На шаре, приближённом до упора, градус занимает
 * около 40 пикселей — пять километров дают пару пикселей, глазу не видно.
 */
const INTERVAL = 5000;
/** Сетка координат: 30 000 делений на весь охват — полпикселя при максимальном приближении */
const QUANTIZATION = 30000;
const CENTURY = 100;

const USER_AGENT = 'arche-explorer/0.1 (personal project; build-time script)';

fs.mkdirSync(CACHE, { recursive: true });

/** mapshaper разбирает команду как строку, и обратные слеши Windows в ней ломаются */
const posix = (file) => file.split(path.sep).join('/');

async function download(url, file) {
  if (fs.existsSync(file)) return;
  console.log(`  ↓ ${url}`);
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

async function toTopology(features, quantization = QUANTIZATION) {
  const input = { 'rows.json': JSON.stringify({ type: 'FeatureCollection', features }) };
  const out = await mapshaper.applyCommands(
    `-i rows.json -o format=topojson quantization=${quantization} out.json`,
    input
  );
  return String(out['out.json']);
}

function writeJson(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return fs.statSync(file).size;
}

// ─── Cliopatria ──────────────────────────────────────────────────────────

async function loadCliopatria() {
  const zip = path.join(CACHE, `cliopatria-${CLIO_VERSION}.zip`);
  const geojson = path.join(CACHE, `cliopatria-${CLIO_VERSION}.geojson`);
  await download(CLIO_URL, zip);

  if (!fs.existsSync(geojson)) {
    const entries = unzipSync(fs.readFileSync(zip));
    const name = Object.keys(entries).find((key) => key.endsWith('.geojson'));
    if (!name) throw new Error('В архиве Cliopatria нет .geojson');
    fs.writeFileSync(geojson, entries[name]);
  }

  // Упрощение 173 МБ — самый долгий шаг; при той же версии и том же шаге
  // результат не меняется, поэтому кэшируем
  const simplified = path.join(CACHE, `simplified-${CLIO_VERSION}-${INTERVAL}.json`);
  if (fs.existsSync(simplified)) return JSON.parse(fs.readFileSync(simplified, 'utf8')).features;

  console.log('  упрощаю Cliopatria…');
  // RELATION — союзы и вассалитеты («Alliance between…»): на карте это
  // третий слой поверх государств и объединений, который ничего не добавляет
  // к вопросу «чья это земля», зато запутывает картинку
  const out = await mapshaper.applyCommands(
    [
      `-i "${posix(geojson)}"`,
      `-filter 'Type == "POLITY"'`,
      `-simplify interval=${INTERVAL} keep-shapes`,
      '-filter-fields Name,FromYear,ToYear,Wikidata,Wikipedia,MemberOf',
      '-o format=geojson precision=0.0001 simplified.json',
    ].join(' ')
  );
  fs.writeFileSync(simplified, String(out['simplified.json']));
  return JSON.parse(String(out['simplified.json'])).features;
}

/**
 * Пачками по 50 с кэшем на диске: полторы тысячи названий — это тридцать
 * запросов, и гонять их при каждой пересборке незачем. Кэш пишется после
 * каждой пачки, так что оборванный запуск продолжится с того же места.
 */
async function cachedBatches(cacheName, keys, fetchBatch, label) {
  const file = path.join(CACHE, cacheName);
  const cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const missing = keys.filter((key) => !(key in cache));

  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    Object.assign(cache, await fetchBatch(batch));
    for (const key of batch) if (!(key in cache)) cache[key] = null;
    fs.writeFileSync(file, JSON.stringify(cache, null, 1));
    process.stdout.write(`\r  ${label}: ${Math.min(i + 50, missing.length)} / ${missing.length}`);
  }
  if (missing.length > 0) process.stdout.write('\n');
  return cache;
}

/** Статья английской Википедии → элемент Wikidata, с учётом перенаправлений */
function wikipediaItems(titles) {
  return cachedBatches('enwiki-items.json', titles, async (batch) => {
    const url =
      'https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1' +
      `&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(batch.join('|'))}`;
    const { query = {} } = await fetchJson(url);
    const target = new Map(batch.map((title) => [title, title]));
    for (const step of [...(query.normalized ?? []), ...(query.redirects ?? [])]) {
      for (const [title, current] of target) if (current === step.from) target.set(title, step.to);
    }
    const itemOf = new Map(
      Object.values(query.pages ?? {}).map((page) => [page.title, page.pageprops?.wikibase_item])
    );
    return Object.fromEntries(batch.map((title) => [title, itemOf.get(target.get(title)) ?? null]));
  }, 'Википедия');
}

/** Русская подпись и статья русской Википедии для элементов Wikidata (CC0) */
function wikidataLabels(ids) {
  return cachedBatches('wikidata-labels.json', ids, async (batch) => {
    const url =
      'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json' +
      `&props=labels|sitelinks&languages=ru&sitefilter=ruwiki&ids=${batch.join('|')}`;
    const { entities = {} } = await fetchJson(url);
    return Object.fromEntries(
      batch.map((id) => [
        id,
        {
          ru: entities[id]?.labels?.ru?.value ?? null,
          ruwiki: entities[id]?.sitelinks?.ruwiki?.title ?? null,
        },
      ])
    );
  }, 'Wikidata');
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Ручной словарь сильнее Wikidata: у сотни государств русской подписи нет,
 * а у трёх десятков она описывает не государство, а событие или человека
 * («Danish Magnates» → «Кристофер II»)
 */
const POLITY_NAMES_RU = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts', 'data', 'polity-names.ru.json'), 'utf8')
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wikidata отвечает 429, если спрашивать подряд без пауз. Ждём столько,
 * сколько она просит, и повторяем — ошибка здесь временная, а не настоящая.
 */
export async function fetchJson(url, init = {}, attempts = 6) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, ...init.headers },
    });
    if (response.ok) {
      await sleep(400);
      return response.json();
    }
    if ((response.status !== 429 && response.status < 500) || attempt >= attempts) {
      throw new Error(`${response.status} ${url.slice(0, 120)}`);
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5 * attempt) * 1000);
  }
}

async function buildCliopatria() {
  const features = await loadCliopatria();
  console.log(`  записей: ${features.length}`);

  // Одно государство — много строк, по строке на каждое изменение границ
  const byName = new Map();
  for (const { properties: p } of features) {
    const entry = byName.get(p.Name);
    if (entry) {
      entry.from = Math.min(entry.from, p.FromYear);
      entry.to = Math.max(entry.to, p.ToYear);
      if (p.Wikipedia) entry.phrases.set(p.Wikipedia, (entry.phrases.get(p.Wikipedia) ?? 0) + 1);
    } else {
      byName.set(p.Name, {
        name: p.Name,
        from: p.FromYear,
        to: p.ToYear,
        wikidata: p.Wikidata || null,
        phrases: new Map(p.Wikipedia ? [[p.Wikipedia, 1]] : []),
        memberOf: p.MemberOf || null,
      });
    }
  }
  for (const entry of byName.values()) {
    entry.wikipedia = [...entry.phrases].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  /*
   * Идентификаторы Wikidata в Cliopatria местами ошибочны: «Republic of Korea»
   * помечена как КНДР, «Syria» — как Ассирия, «Roman Empire» — как Византия.
   * Ссылка на статью Википедии у тех же строк почти всегда верна, поэтому
   * элемент ищем через неё, а собственный идентификатор набора берём только
   * если статьи нет и он не повторяется у другого государства.
   */
  const viaArticle = await wikipediaItems(
    [...new Set([...byName.values()].map((p) => p.wikipedia).filter(Boolean))]
  );
  const namesOfId = new Map();
  for (const p of byName.values()) {
    const base = p.name.replace(/^\((.*)\)$/, '$1');
    if (!p.wikidata) continue;
    if (!namesOfId.has(p.wikidata)) namesOfId.set(p.wikidata, new Set());
    namesOfId.get(p.wikidata).add(base);
  }
  for (const p of byName.values()) {
    const own = p.wikidata && namesOfId.get(p.wikidata).size === 1 ? p.wikidata : null;
    p.item = (p.wikipedia && viaArticle[p.wikipedia]) || own;
  }

  const labels = await wikidataLabels(
    [...new Set([...byName.values()].map((p) => p.item).filter(Boolean))]
  );

  const names = [...byName.keys()].sort((a, b) => byName.get(a).from - byName.get(b).from);
  const indexOf = new Map(names.map((name, i) => [name, i]));

  const polities = names.map((name) => {
    const p = byName.get(name);
    const label = p.item ? labels[p.item] : null;
    // Скобки в Cliopatria означают объединение: «(Holy Roman Empire)» —
    // сама империя поверх входящих в неё княжеств. В подписи скобки не нужны
    const union = name.startsWith('(');
    const entry = {
      n: union ? name.slice(1, -1) : name,
      f: p.from,
      t: p.to,
    };
    if (union) entry.u = 1;
    // «История Шумера» — название статьи, а не государства
    if (POLITY_NAMES_RU[entry.n]) entry.ru = POLITY_NAMES_RU[entry.n];
    else if (label?.ru && !/^история\s/i.test(label.ru)) entry.ru = capitalize(label.ru);
    if (p.item) entry.q = p.item;
    if (p.wikipedia) entry.w = p.wikipedia;
    if (label?.ruwiki) entry.rw = label.ruwiki;
    if (p.memberOf && indexOf.has(p.memberOf)) entry.m = indexOf.get(p.memberOf);
    return entry;
  });

  const rows = features.map((feature) => ({
    type: 'Feature',
    properties: {
      p: indexOf.get(feature.properties.Name),
      f: feature.properties.FromYear,
      t: feature.properties.ToYear,
    },
    geometry: feature.geometry,
  }));

  const minYear = Math.min(...rows.map((r) => r.properties.f));
  const maxYear = Math.max(...rows.map((r) => r.properties.t));
  const chunks = [];
  let total = 0;

  for (let from = Math.floor(minYear / CENTURY) * CENTURY; from <= maxYear; from += CENTURY) {
    const to = from + CENTURY - 1;
    const inChunk = rows.filter((r) => r.properties.f <= to && r.properties.t >= from);
    if (inChunk.length === 0) continue;
    total += writeJson(path.join(OUT, 'c', `${from}.json`), await toTopology(inChunk));
    chunks.push(from);
    process.stdout.write(`\r  века: ${chunks.length}`);
  }
  process.stdout.write('\n');
  console.log(`  границы: ${(total / 1e6).toFixed(1)} МБ без сжатия`);

  return { polities, chunks, withRu: polities.filter((p) => p.ru).length };
}

// ─── historical-basemaps ─────────────────────────────────────────────────

/** «world_bc500.geojson» → −500 */
function snapshotYear(file) {
  const match = file.match(/^world_(bc)?(\d+)\.geojson$/);
  if (!match) return null;
  return match[1] ? -Number(match[2]) : Number(match[2]);
}

/**
 * Русские названия фона. У historical-basemaps нет идентификаторов Wikidata,
 * поэтому словарь ручной — для трёхсот самых частых названий. Остальные
 * три тысячи — в основном австралийские и американские народы; их
 * английские названия видны по наведению.
 */
const BG_NAMES_RU = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts', 'data', 'bg-names.ru.json'), 'utf8')
);

async function buildBackground() {
  const response = await fetch(HB_API, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  const files = (await response.json())
    .map((entry) => ({ file: entry.name, year: snapshotYear(entry.name) }))
    .filter((entry) => entry.year !== null)
    .sort((a, b) => a.year - b.year);

  const years = [];
  const nameCounts = new Map();
  let total = 0;

  for (const { file, year } of files) {
    const local = path.join(CACHE, 'hb', file);
    fs.mkdirSync(path.dirname(local), { recursive: true });
    await download(`${HB_RAW}/${file}`, local);

    // Безымянные полигоны в наборе — заготовки и дыры, подписывать их нечем
    const out = await mapshaper.applyCommands(
      [
        `-i "${posix(local)}"`,
        `-filter 'Boolean(NAME)'`,
        `-simplify interval=${INTERVAL * 1.6} keep-shapes`,
        '-filter-fields NAME',
        '-rename-fields n=NAME',
        `-o format=topojson quantization=${QUANTIZATION} out.json`,
      ].join(' ')
    );
    const topology = JSON.parse(String(out['out.json']));
    for (const geometry of Object.values(topology.objects)[0].geometries) {
      const name = geometry.properties?.n;
      if (!name) continue;
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
      if (BG_NAMES_RU[name]) geometry.properties.r = BG_NAMES_RU[name];
    }
    total += writeJson(path.join(OUT, 'bg', `${year}.json`), topology);
    years.push(year);
    process.stdout.write(`\r  срезы фона: ${years.length} / ${files.length}`);
  }
  process.stdout.write('\n');
  console.log(`  фон: ${(total / 1e6).toFixed(1)} МБ без сжатия`);

  fs.writeFileSync(
    path.join(CACHE, 'bg-names.txt'),
    [...nameCounts].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${c}\t${n}`).join('\n')
  );
  return years;
}

// ─── Сборка ──────────────────────────────────────────────────────────────

console.log('Cliopatria');
const clio = await buildCliopatria();
console.log('historical-basemaps');
// --skip-bg: фон меняется редко, а скачивается и упрощается дольше всего
const bg = process.argv.includes("--skip-bg")
  ? JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8")).bg
  : await buildBackground();

/**
 * Версия по содержимому. Века ссылаются на государства по номеру в индексе,
 * и век из старой сборки при новом индексе подписал бы Францию Англией.
 * Браузер запрашивает файлы с ?v=<версия>, так что кэш PWA не смешивает сборки.
 */
const hash = createHash('sha1');
for (const dir of ['c', 'bg']) {
  for (const file of fs.readdirSync(path.join(OUT, dir)).sort()) {
    hash.update(fs.readFileSync(path.join(OUT, dir, file)));
  }
}
hash.update(JSON.stringify(clio.polities));

writeJson(path.join(OUT, 'index.json'), {
  version: hash.digest('hex').slice(0, 10),
  sources: {
    cliopatria: CLIO_VERSION,
    historicalBasemaps: HB_COMMIT.slice(0, 7),
  },
  chunk: CENTURY,
  chunks: clio.chunks,
  bg,
  polities: clio.polities,
});

console.log(
  `Готово: ${clio.polities.length} государств (${clio.withRu} с русским названием), ` +
    `${clio.chunks.length} веков, ${bg.length} срезов фона`
);
