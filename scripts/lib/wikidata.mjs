/**
 * Общее для скриптов, которые собирают данные из Wikidata:
 * запросы с повтором, кэш на диске, разбор дат и координат.
 *
 * Wikidata под нагрузкой отвечает 429 и 5xx, рвёт соединения и обрывает
 * ответы на середине. Поэтому всё с повтором, а каждый ответ кэшируется —
 * оборванный запуск продолжается с того же места.
 */
import fs from 'node:fs';
import path from 'node:path';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const API = 'https://www.wikidata.org/w/api.php';
export const USER_AGENT = 'arche-explorer/0.1 (personal project; build-time script)';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const chunk = (list, size) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/** Запрос с повтором: 429/5xx, обрыв соединения и обрыв посреди тела ответа */
export async function request(url, init = {}, label = url.slice(0, 80)) {
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, ...init.headers },
        // Сервис сам обрывает запрос через минуту; дольше ждать нечего
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) return await response.json();
    } catch (error) {
      if (attempt >= 5) throw error;
      console.log(`  повтор ${label}: ${error.cause?.code ?? error.name}`);
      await sleep(10_000 * attempt);
      continue;
    }
    if ((response.status !== 429 && response.status < 500) || attempt >= 5) {
      throw new Error(`${response.status} (${label}): ${(await response.text()).slice(0, 300)}`);
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 10 * attempt) * 1000);
  }
}

/** Клиент с кэшем в своей папке: у каждого скрипта свой */
export function wikidataClient(cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });

  async function sparql(query, cacheName) {
    const file = path.join(cacheDir, `${cacheName}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const json = await request(
      ENDPOINT,
      {
        method: 'POST',
        headers: {
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ query }),
      },
      cacheName
    );
    const rows = json.results.bindings;
    fs.writeFileSync(file, JSON.stringify(rows));
    await sleep(1500);
    return rows;
  }

  /** wbgetentities пачками по 50, с кэшем выжимки: полные ответы весят мегабайты */
  async function entities(cacheName, ids, params, extract) {
    const file = path.join(cacheDir, `${cacheName}.json`);
    const cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const missing = ids.filter((id) => !(id in cache));
    for (let i = 0; i < missing.length; i += 50) {
      const batch = missing.slice(i, i + 50);
      const json = await request(
        `${API}?action=wbgetentities&format=json&ids=${batch.join('|')}&${params}`,
        {},
        cacheName
      );
      for (const id of batch) cache[id] = json.entities?.[id] ? extract(json.entities[id]) : null;
      fs.writeFileSync(file, JSON.stringify(cache));
      process.stdout.write(`\r  ${cacheName}: ${Math.min(i + 50, missing.length)} / ${missing.length}`);
      await sleep(300);
    }
    if (missing.length > 0) process.stdout.write('\n');
    return cache;
  }

  /** Поиск элемента по названию — для привязки заметок хранилища */
  async function search(cacheName, terms, language = 'ru') {
    const file = path.join(cacheDir, `${cacheName}.json`);
    const cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    for (const term of terms) {
      if (term in cache) continue;
      const json = await request(
        `${API}?action=wbsearchentities&format=json&type=item&limit=7&language=${language}&uselang=${language}&search=${encodeURIComponent(term)}`,
        {},
        cacheName
      );
      cache[term] = (json.search ?? []).map((r) => ({ id: r.id, label: r.label, description: r.description ?? null }));
      fs.writeFileSync(file, JSON.stringify(cache));
      await sleep(250);
    }
    return cache;
  }

  return { sparql, entities, search };
}

/**
 * Год из даты WDQS. RDF-выгрузка Wikidata считает годы по XSD 1.1, где
 * есть нулевой год: «-0427» — это 428 год до н.э. В хранилище нулевого
 * года нет (Платон — `start_year: -428`), поэтому до нашей эры сдвигаем.
 */
export function yearOf(value) {
  if (!value) return null;
  const match = value.match(/^(-?)(\d+)-/);
  if (!match) return null;
  const year = Number(match[2]) * (match[1] ? -1 : 1);
  return year <= 0 ? year - 1 : year;
}

/**
 * Год из JSON wbgetentities. Здесь, в отличие от RDF, нулевого года нет:
 * «-0428» — это и есть 428 год до н.э.
 */
export function jsonYearOf(time) {
  const match = typeof time === 'string' ? time.match(/^([+-])(\d+)-/) : null;
  return match ? Number(match[2]) * (match[1] === '-' ? -1 : 1) : null;
}

/** «Point(20.51 54.71)» → [20.51, 54.71] */
export function pointOf(value) {
  const match = value?.match(/Point\(([-\d.eE]+) ([-\d.eE]+)\)/);
  return match ? [Number(Number(match[1]).toFixed(3)), Number(Number(match[2]).toFixed(3))] : null;
}

export const idOf = (uri) => uri.slice(uri.lastIndexOf('/') + 1);
export const articleOf = (uri) =>
  uri ? decodeURIComponent(uri.slice(uri.lastIndexOf('/') + 1)).replace(/_/g, ' ') : null;

/** У сущности без русской подписи сервис отдаёт её идентификатор — такая подпись не нужна */
export const labelOf = (binding) => {
  const label = binding?.value;
  return label && !/^Q\d+$/.test(label) ? label : null;
};

/** Значение-сущность из утверждения Wikidata */
export const itemOf = (claim) => claim?.mainsnak?.datavalue?.value?.id ?? null;
export const qualifierYear = (claim, prop) => jsonYearOf(claim?.qualifiers?.[prop]?.[0]?.datavalue?.value?.time);

/** Утверждения без отметки «устарело»: ранг deprecated — это то, что сама Wikidata считает ошибкой */
export const claimsOf = (entity, prop) =>
  (entity.claims?.[prop] ?? []).filter((c) => c.rank !== 'deprecated' && c.mainsnak?.datavalue);

export const ARTICLES = `
  OPTIONAL { ?ru schema:about ?item; schema:isPartOf <https://ru.wikipedia.org/> }
  OPTIONAL { ?en schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }`;

export function firstPerItem(rows) {
  const seen = new Map();
  for (const row of rows) {
    const id = idOf(row.item.value);
    if (!seen.has(id)) seen.set(id, row);
  }
  return [...seen.values()];
}
