/**
 * Фон «а в это время»: события и люди из Wikidata.
 *
 * Хранилище — это заметки своими словами, и тысячу событий в нём никто
 * писать не будет, и не должен. Но на глобусе пустота вокруг Канта врёт
 * не меньше, чем выдуманная точность: в 1755 году Кант пишет «Всеобщую
 * естественную историю неба», а Лиссабон в тот же год лежит в руинах,
 * и Европа спорит о Провидении.
 *
 * Поэтому здесь только то, что у Wikidata лицензировано как CC0 и не
 * является чужим текстом: название, год, координаты, короткое описание
 * («немецкий философ») и ссылка на статью. Текст остаётся своим.
 *
 * Что считается «заметным» — решают пороги по числу языковых версий
 * статьи: событие, о котором написали на тридцати языках, знает каждый
 * школьник где-нибудь. Пороги подобраны так, чтобы фон не забивал карту.
 *
 * Запуск: pnpm context (несколько минут: два десятка запросов к WDQS)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, '.cache', 'context');
const OUT = path.join(root, 'public', 'context');
const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'arche-explorer/0.1 (personal project; build-time script)';

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

/**
 * Виды событий. `classes` — прямые типы (P31): обход подклассов в WDQS
 * упирается в таймаут, а прямых типов хватает на всё заметное.
 * `minLinks` — сколько языковых версий нужно, чтобы событие попало на фон.
 */
const EVENT_KINDS = {
  battle: { label: 'Сражение', classes: ['Q178561', 'Q188055', 'Q1261499'], minLinks: 30 },
  war: { label: 'Война', classes: ['Q198'], minLinks: 45 },
  treaty: { label: 'Договор', classes: ['Q131569', 'Q625298'], minLinks: 22 },
  council: { label: 'Собор', classes: ['Q51645', 'Q111161'], minLinks: 12 },
  uprising: { label: 'Восстание, революция', classes: ['Q10931', 'Q124734', 'Q45382'], minLinks: 30 },
  disaster: { label: 'Бедствие', classes: ['Q7944', 'Q7692360', 'Q12184'], minLinks: 25 },
  university: { label: 'Основан университет', classes: ['Q3918'], minLinks: 45, before: 1900 },
};

/**
 * Люди по роду занятий (P106). Пороги разные: философов в хранилище
 * больше всего, и фон для них нужен гуще; политиков в Википедии много,
 * а на глобусе нужны только те, кого знают все.
 */
const PEOPLE_GROUPS = {
  philosophy: { label: 'Философия', occupations: ['Q4964182'], minLinks: 55 },
  religion: { label: 'Религия', occupations: ['Q1234713', 'Q250867'], minLinks: 60 },
  literature: {
    label: 'Литература',
    occupations: ['Q36180', 'Q49757', 'Q214917', 'Q6625963'],
    minLinks: 90,
  },
  art: { label: 'Искусство', occupations: ['Q1028181', 'Q1281618', 'Q42973'], minLinks: 75 },
  music: { label: 'Музыка', occupations: ['Q36834'], minLinks: 80 },
  science: {
    label: 'Наука',
    occupations: ['Q169470', 'Q170790', 'Q11063', 'Q593644', 'Q864503', 'Q18805', 'Q39631'],
    minLinks: 70,
  },
  society: {
    label: 'Общество',
    occupations: ['Q201788', 'Q188094', 'Q2306091', 'Q212980'],
    minLinks: 70,
  },
  // «Политик» (Q82955) — миллионы людей, и WDQS не успевает отфильтровать
  // их по известности за минуту. Государственные деятели — узкий класс
  power: { label: 'Власть', occupations: ['Q116', 'Q372436', 'Q1402561'], minLinks: 110 },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sparql(query, cacheName) {
  const file = path.join(CACHE, `${cacheName}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));

  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ query }),
        // Сервис сам обрывает запрос через минуту; дольше ждать нечего
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      // Обрыв соединения у WDQS — обычное дело под нагрузкой
      if (attempt >= 5) throw error;
      console.log(`  повтор ${cacheName}: ${error.cause?.code ?? error.name}`);
      await sleep(10_000 * attempt);
      continue;
    }
    if (response.ok) {
      const rows = (await response.json()).results.bindings;
      fs.writeFileSync(file, JSON.stringify(rows));
      await sleep(1500);
      return rows;
    }
    if ((response.status !== 429 && response.status < 500) || attempt >= 5) {
      throw new Error(`WDQS ${response.status} (${cacheName}): ${(await response.text()).slice(0, 300)}`);
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 10 * attempt) * 1000);
  }
}

/**
 * Год из даты WDQS. RDF-выгрузка Wikidata считает годы по XSD 1.1, где
 * есть нулевой год: «-0427» — это 428 год до н.э. В хранилище нулевого
 * года нет (Платон — `start_year: -428`), поэтому до нашей эры сдвигаем.
 */
function yearOf(value) {
  if (!value) return null;
  const match = value.match(/^(-?)(\d+)-/);
  if (!match) return null;
  const year = Number(match[2]) * (match[1] ? -1 : 1);
  return year <= 0 ? year - 1 : year;
}

/** «Point(20.51 54.71)» → [20.51, 54.71] */
function pointOf(value) {
  const match = value?.match(/Point\(([-\d.eE]+) ([-\d.eE]+)\)/);
  return match ? [Number(Number(match[1]).toFixed(3)), Number(Number(match[2]).toFixed(3))] : null;
}

const idOf = (uri) => uri.slice(uri.lastIndexOf('/') + 1);
const articleOf = (uri) => (uri ? decodeURIComponent(uri.slice(uri.lastIndexOf('/') + 1)).replace(/_/g, ' ') : null);

/** У сущности без русской подписи сервис отдаёт её идентификатор — такая подпись не нужна */
const labelOf = (binding) => {
  const label = binding?.value;
  return label && !/^Q\d+$/.test(label) ? label : null;
};

const ARTICLES = `
  OPTIONAL { ?ru schema:about ?item; schema:isPartOf <https://ru.wikipedia.org/> }
  OPTIONAL { ?en schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }`;

function eventQuery(kind) {
  const values = kind.classes.map((q) => `wd:${q}`).join(' ');
  const before = kind.before ? `FILTER(YEAR(?date) < ${kind.before})` : '';
  return `
SELECT ?item ?itemLabel ?itemDescription ?date ?coord ?placeLabel ?links ?ru ?en WHERE {
  VALUES ?class { ${values} }
  ?item wdt:P31 ?class; wikibase:sitelinks ?links.
  FILTER(?links >= ${kind.minLinks})
  OPTIONAL { ?item wdt:P585 ?pointInTime }
  OPTIONAL { ?item wdt:P580 ?startTime }
  OPTIONAL { ?item wdt:P571 ?inception }
  BIND(COALESCE(?pointInTime, ?startTime, ?inception) AS ?date)
  FILTER(BOUND(?date))
  ${before}
  OPTIONAL { ?item wdt:P625 ?own }
  OPTIONAL { ?item wdt:P276 ?place. ?place wdt:P625 ?placeCoord }
  BIND(COALESCE(?own, ?placeCoord) AS ?coord)
  FILTER(BOUND(?coord))
  ${ARTICLES}
}`;
}

function peopleQuery(occupation, minLinks) {
  return `
SELECT ?item ?itemLabel ?itemDescription ?birth ?death ?coord ?placeLabel ?links ?ru ?en WHERE {
  ?item wdt:P106 wd:${occupation}; wdt:P31 wd:Q5; wikibase:sitelinks ?links.
  FILTER(?links >= ${minLinks})
  ?item wdt:P569 ?birth.
  OPTIONAL { ?item wdt:P570 ?death }
  ?item wdt:P19 ?place. ?place wdt:P625 ?coord.
  ${ARTICLES}
}`;
}

function firstPerItem(rows) {
  const seen = new Map();
  for (const row of rows) {
    const id = idOf(row.item.value);
    if (!seen.has(id)) seen.set(id, row);
  }
  return [...seen.values()];
}

// ─── События ─────────────────────────────────────────────────────────────

const events = new Map();
for (const [kind, meta] of Object.entries(EVENT_KINDS)) {
  const rows = firstPerItem(await sparql(eventQuery(meta), `event-${kind}`));
  let added = 0;
  for (const row of rows) {
    const id = idOf(row.item.value);
    const title = labelOf(row.itemLabel);
    const year = yearOf(row.date?.value);
    const point = pointOf(row.coord?.value);
    if (!title || year === null || !point || events.has(id)) continue;
    events.set(id, {
      id,
      title,
      description: labelOf(row.itemDescription),
      year,
      lon: point[0],
      lat: point[1],
      place: labelOf(row.placeLabel),
      kind,
      links: Number(row.links.value),
      ru: articleOf(row.ru?.value),
      en: articleOf(row.en?.value),
    });
    added += 1;
  }
  console.log(`  ${meta.label}: ${added}`);
}

// ─── Люди ────────────────────────────────────────────────────────────────

const people = new Map();
for (const [group, meta] of Object.entries(PEOPLE_GROUPS)) {
  let added = 0;
  for (const occupation of meta.occupations) {
    const rows = firstPerItem(
      await sparql(peopleQuery(occupation, meta.minLinks), `people-${occupation}-${meta.minLinks}`)
    );
    for (const row of rows) {
      const id = idOf(row.item.value);
      const title = labelOf(row.itemLabel);
      const birth = yearOf(row.birth?.value);
      const point = pointOf(row.coord?.value);
      // Человек с несколькими занятиями остаётся в первой группе: Декарт —
      // философ, хотя и математик тоже
      if (!title || birth === null || !point || people.has(id)) continue;
      people.set(id, {
        id,
        title,
        description: labelOf(row.itemDescription),
        birth,
        death: yearOf(row.death?.value),
        lon: point[0],
        lat: point[1],
        place: labelOf(row.placeLabel),
        group,
        links: Number(row.links.value),
        ru: articleOf(row.ru?.value),
        en: articleOf(row.en?.value),
      });
      added += 1;
    }
  }
  console.log(`  ${meta.label}: ${added}`);
}

// Компактно: файл грузится целиком при открытии глобуса
const byLinks = (a, b) => b.links - a.links;
const eventRows = [...events.values()]
  .sort(byLinks)
  .map((e) => [e.id, e.title, e.description, e.year, e.lon, e.lat, e.place, e.kind, e.links, e.ru, e.en]);
const peopleRows = [...people.values()]
  .sort(byLinks)
  .map((p) => [p.id, p.title, p.description, p.birth, p.death, p.lon, p.lat, p.place, p.group, p.links, p.ru, p.en]);

fs.writeFileSync(
  path.join(OUT, 'events.json'),
  JSON.stringify({
    kinds: Object.fromEntries(Object.entries(EVENT_KINDS).map(([k, v]) => [k, v.label])),
    fields: ['id', 'title', 'description', 'year', 'lon', 'lat', 'place', 'kind', 'links', 'ru', 'en'],
    rows: eventRows,
  })
);
fs.writeFileSync(
  path.join(OUT, 'people.json'),
  JSON.stringify({
    groups: Object.fromEntries(Object.entries(PEOPLE_GROUPS).map(([k, v]) => [k, v.label])),
    fields: ['id', 'title', 'description', 'birth', 'death', 'lon', 'lat', 'place', 'group', 'links', 'ru', 'en'],
    rows: peopleRows,
  })
);

console.log(`Готово: ${eventRows.length} событий, ${peopleRows.length} человек`);
