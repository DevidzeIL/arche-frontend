/**
 * Фон «а в это время» и сведения о государствах — из Wikidata.
 *
 * Хранилище — это заметки своими словами, и тысячу событий в нём никто
 * писать не будет, и не должен. Но на глобусе пустота вокруг Канта врёт
 * не меньше, чем выдуманная точность: в 1755 году Кант пишет «Всеобщую
 * естественную историю неба», а Лиссабон в тот же год лежит в руинах,
 * и Европа спорит о Провидении.
 *
 * Поэтому здесь только то, что у Wikidata лицензировано как CC0 и не
 * является чужим текстом: название, год, координаты, короткое описание
 * («немецкий философ»), имя файла изображения и ссылка на статью.
 * Текст остаётся своим.
 *
 * Что считается «заметным» — решают пороги по числу языковых версий
 * статьи: событие, о котором написали на тридцати языках, знает каждый
 * школьник где-нибудь.
 *
 * Запуск: pnpm context — всё; pnpm context --only=polities — только
 * сведения о государствах (им нужен уже собранный public/borders/index.json).
 * Ответы кэшируются в .cache/context, повторный запуск идёт с того места,
 * где оборвался.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARTICLES,
  chunk,
  claimsOf,
  firstPerItem,
  idOf,
  itemOf,
  jsonYearOf,
  labelOf,
  pointOf,
  qualifierYear,
  articleOf,
  wikidataClient,
  yearOf,
} from './lib/wikidata.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, '.cache', 'context');
const OUT = path.join(root, 'public', 'context');
fs.mkdirSync(OUT, { recursive: true });

const { sparql, entities } = wikidataClient(CACHE);

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const wants = (part) => !only || only.includes(part);

/**
 * Виды событий. `classes` — прямые типы (P31): обход подклассов в WDQS
 * упирается в таймаут, а прямых типов хватает на всё заметное.
 * `minLinks` — сколько языковых версий нужно, чтобы событие попало на фон.
 */
const EVENT_KINDS = {
  battle: { label: 'Сражение', classes: ['Q178561', 'Q188055', 'Q1261499'], minLinks: 22 },
  war: { label: 'Война', classes: ['Q198'], minLinks: 35 },
  treaty: { label: 'Договор', classes: ['Q131569', 'Q625298'], minLinks: 15 },
  council: { label: 'Собор', classes: ['Q51645', 'Q111161'], minLinks: 8 },
  uprising: { label: 'Восстание, революция', classes: ['Q10931', 'Q124734', 'Q45382'], minLinks: 20 },
  disaster: { label: 'Бедствие', classes: ['Q7944', 'Q7692360', 'Q12184'], minLinks: 18 },
  university: { label: 'Основан университет', classes: ['Q3918'], minLinks: 25, before: 1900 },
  // Соборы, храмы, замки и дворцы — то, что видно до сих пор: Парфенон
  // и Нотр-Дам в хранилище есть, а Айя-София и Кёльнский собор — нет
  building: {
    label: 'Построено',
    classes: [
      'Q2977', 'Q16970', 'Q44539', 'Q23413', 'Q16560', 'Q32815', 'Q44613',
      'Q12516', 'Q54831', 'Q160742', 'Q5393308', 'Q842402',
    ],
    minLinks: 40,
    before: 1900,
    weight: 0.7,
  },
  // Только до 1500 года: у современных городов «дата основания» часто
  // административная (Сыктывкар — 1780, год получения статуса), а статей
  // о городах столько, что по известности они обгоняют любое сражение —
  // поэтому и вес ниже
  city: { label: 'Основан город', classes: ['Q515', 'Q1549591', 'Q15661340'], minLinks: 90, before: 1500, weight: 0.35 },
};

/**
 * Люди по роду занятий (P106). Пороги разные: философов в хранилище
 * больше всего, и фон для них нужен гуще; писателей и государственных
 * деятелей в Википедии много, а на глобусе нужны те, кого знают все.
 */
const PEOPLE_GROUPS = {
  philosophy: { label: 'Философия', occupations: ['Q4964182'], minLinks: 35 },
  religion: { label: 'Религия', occupations: ['Q1234713', 'Q250867'], minLinks: 45 },
  literature: {
    label: 'Литература',
    occupations: ['Q36180', 'Q49757', 'Q214917', 'Q6625963'],
    minLinks: 65,
  },
  art: { label: 'Искусство', occupations: ['Q1028181', 'Q1281618', 'Q42973'], minLinks: 55 },
  music: { label: 'Музыка', occupations: ['Q36834'], minLinks: 60 },
  science: {
    label: 'Наука',
    occupations: ['Q169470', 'Q170790', 'Q11063', 'Q593644', 'Q864503', 'Q18805', 'Q39631'],
    minLinks: 50,
  },
  society: {
    label: 'Общество',
    occupations: ['Q201788', 'Q188094', 'Q2306091', 'Q212980'],
    minLinks: 55,
  },
  travel: { label: 'Путешествия', occupations: ['Q11900058'], minLinks: 50 },
  // «Политик» (Q82955) — миллионы людей, и WDQS не успевает отфильтровать
  // их по известности за минуту. Государственные деятели — узкий класс
  power: { label: 'Власть', occupations: ['Q116', 'Q372436', 'Q1402561'], minLinks: 80 },
};

/** Имя файла Commons из адреса Special:FilePath */
const fileOf = (uri) => (uri ? decodeURIComponent(uri.slice(uri.lastIndexOf('/') + 1)).replace(/_/g, ' ') : null);

function eventQuery(kind) {
  const values = kind.classes.map((q) => `wd:${q}`).join(' ');
  const before = kind.before ? `FILTER(YEAR(?date) < ${kind.before})` : '';
  return `
SELECT ?item ?itemLabel ?itemDescription ?date ?end ?coord ?placeLabel ?image ?links ?ru ?en WHERE {
  VALUES ?class { ${values} }
  ?item wdt:P31 ?class; wikibase:sitelinks ?links.
  FILTER(?links >= ${kind.minLinks})
  OPTIONAL { ?item wdt:P585 ?pointInTime }
  OPTIONAL { ?item wdt:P580 ?startTime }
  OPTIONAL { ?item wdt:P571 ?inception }
  BIND(COALESCE(?pointInTime, ?startTime, ?inception) AS ?date)
  FILTER(BOUND(?date))
  ${before}
  OPTIONAL { ?item wdt:P582 ?end }
  OPTIONAL { ?item wdt:P625 ?own }
  OPTIONAL { ?item wdt:P276 ?place. ?place wdt:P625 ?placeCoord }
  BIND(COALESCE(?own, ?placeCoord) AS ?coord)
  FILTER(BOUND(?coord))
  OPTIONAL { ?item wdt:P18 ?image }
  ${ARTICLES}
}`;
}

function peopleQuery(occupation, minLinks) {
  return `
SELECT ?item ?itemLabel ?itemDescription ?birth ?death ?coord ?placeLabel ?deathPlaceLabel ?image ?links ?ru ?en WHERE {
  ?item wdt:P106 wd:${occupation}; wdt:P31 wd:Q5; wikibase:sitelinks ?links.
  FILTER(?links >= ${minLinks})
  ?item wdt:P569 ?birth.
  OPTIONAL { ?item wdt:P570 ?death }
  ?item wdt:P19 ?place. ?place wdt:P625 ?coord.
  OPTIONAL { ?item wdt:P20 ?deathPlace }
  OPTIONAL { ?item wdt:P18 ?image }
  ${ARTICLES}
}`;
}

const byLinks = (a, b) => b.links - a.links;

/**
 * Ужимаем то, что грузится целиком при открытии глобуса: английская статья
 * нужна, только если нет русской; описания в Wikidata бывают на абзац —
 * на подсказку хватает начала
 */
const DESCRIPTION_LIMIT = 100;
function trim(item) {
  if (item.ru) item.en = null;
  if (item.description && item.description.length > DESCRIPTION_LIMIT) {
    item.description = `${item.description.slice(0, DESCRIPTION_LIMIT - 1).trimEnd()}…`;
  }
  return item;
}

// ─── События ─────────────────────────────────────────────────────────────

async function buildEvents() {
  const events = new Map();
  for (const [kind, meta] of Object.entries(EVENT_KINDS)) {
    const rows = firstPerItem(await sparql(eventQuery(meta), `event-${kind}-${meta.minLinks}-v2`));
    let added = 0;
    for (const row of rows) {
      const id = idOf(row.item.value);
      const title = labelOf(row.itemLabel);
      const year = yearOf(row.date?.value);
      const point = pointOf(row.coord?.value);
      if (!title || year === null || !point || events.has(id)) continue;
      // Порог по году проверяется и здесь: запрос мог быть закэширован с другим.
      // Будущее — ошибка данных («Российско-украинская война», 2100 год)
      if ((meta.before && year >= meta.before) || year > new Date().getFullYear()) continue;
      const end = yearOf(row.end?.value);
      events.set(id, {
        id,
        title,
        description: labelOf(row.itemDescription),
        year,
        end: end !== null && end > year ? end : null,
        lon: point[0],
        lat: point[1],
        place: labelOf(row.placeLabel),
        kind,
        links: Number(row.links.value),
        rank: Number(row.links.value) * (meta.weight ?? 1),
        ru: articleOf(row.ru?.value),
        en: articleOf(row.en?.value),
        image: fileOf(row.image?.value),
      });
      added += 1;
    }
    console.log(`  ${meta.label}: ${added}`);
  }

  // Изображение в файл не кладём: оно нужно только в открытой панели и
  // запрашивается там по элементу Wikidata, а в файле весило бы четверть
  const fields = ['id', 'title', 'description', 'year', 'end', 'lon', 'lat', 'place', 'kind', 'links', 'ru', 'en'];
  fs.writeFileSync(
    path.join(OUT, 'events.json'),
    JSON.stringify({
      kinds: Object.fromEntries(Object.entries(EVENT_KINDS).map(([k, v]) => [k, v.label])),
      fields,
      // Порядок — по известности с поправкой на вид: клиент берёт первых
      rows: [...events.values()].sort((a, b) => b.rank - a.rank).map(trim).map((e) => fields.map((f) => e[f] ?? null)),
    })
  );
  return events.size;
}

// ─── Люди ────────────────────────────────────────────────────────────────

async function buildPeople() {
  const people = new Map();
  for (const [group, meta] of Object.entries(PEOPLE_GROUPS)) {
    let added = 0;
    for (const occupation of meta.occupations) {
      const rows = firstPerItem(
        await sparql(peopleQuery(occupation, meta.minLinks), `people-${occupation}-${meta.minLinks}-v2`)
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
          deathPlace: labelOf(row.deathPlaceLabel),
          group,
          links: Number(row.links.value),
          ru: articleOf(row.ru?.value),
          en: articleOf(row.en?.value),
          image: fileOf(row.image?.value),
        });
        added += 1;
      }
    }
    console.log(`  ${meta.label}: ${added}`);
  }

  const fields = [
    'id', 'title', 'description', 'birth', 'death', 'lon', 'lat', 'place', 'deathPlace',
    'group', 'links', 'ru', 'en',
  ];
  fs.writeFileSync(
    path.join(OUT, 'people.json'),
    JSON.stringify({
      groups: Object.fromEntries(Object.entries(PEOPLE_GROUPS).map(([k, v]) => [k, v.label])),
      fields,
      rows: [...people.values()].sort(byLinks).map(trim).map((p) => fields.map((f) => p[f] ?? null)),
    })
  );
  return people.size;
}

// ─── Государства ─────────────────────────────────────────────────────────


/**
 * Сведения о государстве: столица, форма правления, языки, религия,
 * флаг, предшественники. Всё — ссылками на сущности; подписи к ним
 * собираются вторым проходом.
 */
function extractPolity(entity) {
  const timed = (prop) =>
    claimsOf(entity, prop)
      .map((c) => ({ id: itemOf(c), from: qualifierYear(c, 'P580'), to: qualifierYear(c, 'P582') }))
      .filter((v) => v.id);
  const items = (prop) => claimsOf(entity, prop).map(itemOf).filter(Boolean);
  // Сначала предпочтительные утверждения: по первому значению красится карта
  const ranked = (prop) =>
    claimsOf(entity, prop)
      .sort((a, b) => Number(b.rank === 'preferred') - Number(a.rank === 'preferred'))
      .map(itemOf)
      .filter(Boolean);
  const year = (prop) => jsonYearOf(claimsOf(entity, prop)[0]?.mainsnak?.datavalue?.value?.time);
  const files = (prop) =>
    claimsOf(entity, prop).map((c) => ({
      file: c.mainsnak.datavalue.value,
      from: qualifierYear(c, 'P580'),
      to: qualifierYear(c, 'P582'),
    }));

  return {
    d: entity.descriptions?.ru?.value ?? null,
    cap: timed('P36'),
    hos: timed('P35'),
    office: items('P1906'),
    gov: items('P122'),
    lang: items('P37'),
    // У государств религия записана как «официальная религия» (P3075);
    // P140 — свойство людей и организаций, у государств оно редко и
    // перечисляет всех подданных: у Османской империи там и православие
    off: ranked('P3075'),
    rel: ranked('P140'),
    inc: year('P571'),
    dis: year('P576'),
    flag: files('P41'),
    arms: files('P94')[0]?.file ?? null,
    prev: items('P1365'),
    next: items('P1366'),
  };
}

async function buildPolities() {
  const indexFile = path.join(root, 'public', 'borders', 'index.json');
  if (!fs.existsSync(indexFile)) throw new Error('Сначала соберите границы: pnpm borders');
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const patchesFile = path.join(root, 'arche-vault', '_borders', 'patches.geojson');
  const patches = fs.existsSync(patchesFile) ? JSON.parse(fs.readFileSync(patchesFile, 'utf8')) : { features: [] };

  const ids = [
    ...new Set([
      ...index.polities.map((p) => p.q),
      ...patches.features.map((f) => f.properties?.wikidata),
    ].filter(Boolean)),
  ];

  const facts = await entities('polity-claims-v3', ids, 'props=claims|descriptions&languages=ru', extractPolity);

  // Подписи ко всему, на что ссылаются сведения
  const referenced = new Set();
  for (const f of Object.values(facts)) {
    if (!f) continue;
    for (const v of [...f.cap, ...f.hos]) referenced.add(v.id);
    for (const id of [...f.gov, ...f.lang, ...f.off, ...f.rel, ...f.prev, ...f.next]) referenced.add(id);
  }
  const labels = await entities('labels', [...referenced], 'props=labels&languages=ru|en', (e) =>
    e.labels?.ru?.value ?? e.labels?.en?.value ?? null
  );

  // Координаты столиц: точка на карте и подпись
  const capitals = [...new Set(Object.values(facts).flatMap((f) => (f ? f.cap.map((c) => c.id) : [])))];
  const coords = {};
  for (const [i, batch] of chunk(capitals, 150).entries()) {
    const rows = await sparql(
      `SELECT ?c ?coord WHERE { VALUES ?c { ${batch.map((id) => `wd:${id}`).join(' ')} } ?c wdt:P625 ?coord }`,
      `capitals-${i}-${batch.length}`
    );
    for (const row of rows) coords[idOf(row.c.value)] ??= pointOf(row.coord.value);
  }

  /*
   * Правители. Глава государства (P35) у исторических государств указан
   * редко, зато почти всегда указана должность (P1906: «король Франции»),
   * а у людей — что они её занимали и когда (P39 с датами). Собираем через
   * должность, прямые P35 добавляем сверху.
   *
   * Только P35 бывает и человеком, и должностью: у Пруссии там записан
   * «король Пруссии» с 1701 по 1918 год. Поэтому сначала выясняем, кто из
   * значений P35 — люди; остальные считаем должностями.
   */
  const heads = [...new Set(Object.values(facts).flatMap((f) => (f ? f.hos.map((h) => h.id) : [])))];
  const humans = new Set();
  for (const [i, batch] of chunk(heads, 200).entries()) {
    const rows = await sparql(
      `SELECT ?x WHERE { VALUES ?x { ${batch.map((id) => `wd:${id}`).join(' ')} } ?x wdt:P31 wd:Q5 }`,
      `humans-${i}-${batch.length}`
    );
    for (const row of rows) humans.add(idOf(row.x.value));
  }
  for (const f of Object.values(facts)) {
    if (!f) continue;
    f.office = [...new Set([...f.office, ...f.hos.filter((h) => !humans.has(h.id)).map((h) => h.id)])];
    f.hos = f.hos.filter((h) => humans.has(h.id));
  }

  const offices = [...new Set(Object.values(facts).flatMap((f) => (f ? f.office : [])))];
  const holders = {};
  for (const [i, batch] of chunk(offices, 10).entries()) {
    const rows = await sparql(
      `SELECT ?office ?person ?personLabel ?start ?end WHERE {
  VALUES ?office { ${batch.map((id) => `wd:${id}`).join(' ')} }
  ?person p:P39 ?st. ?st ps:P39 ?office.
  FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
  OPTIONAL { ?st pq:P580 ?start }
  OPTIONAL { ?st pq:P582 ?end }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }
}`,
      `holders-${i}-${batch.length}`
    );
    for (const row of rows) {
      const office = idOf(row.office.value);
      const name = labelOf(row.personLabel);
      const start = yearOf(row.start?.value);
      if (!name || start === null) continue;
      (holders[office] ??= []).push({ id: idOf(row.person.value), name, from: start, to: yearOf(row.end?.value) });
    }
  }

  // Годы государства по Cliopatria: по ним отсекаются правители должности,
  // которая пережила само государство («король Франции» правил и после 1791)
  const spanOf = new Map();
  for (const p of index.polities) {
    if (!p.q) continue;
    const span = spanOf.get(p.q);
    spanOf.set(p.q, span ? { f: Math.min(span.f, p.f), t: Math.max(span.t, p.t) } : { f: p.f, t: p.t });
  }

  const label = (id) => labels[id] ?? null;
  const polities = {};
  const rulers = {};
  for (const [id, f] of Object.entries(facts)) {
    if (!f) continue;
    const span = spanOf.get(id) ?? { f: f.inc ?? -10000, t: f.dis ?? 3000 };
    const entry = {};
    if (f.d) entry.d = f.d;
    const cap = f.cap
      .filter((c) => coords[c.id] && label(c.id))
      .map((c) => [label(c.id), ...coords[c.id], c.from, c.to]);
    if (cap.length) entry.cap = cap;
    // Есть официальная религия — только она, с пометкой ro; иначе — что указано
    const official = f.off.length > 0;
    for (const [key, list] of [['gov', f.gov], ['lang', f.lang], ['rel', official ? f.off : f.rel]]) {
      const names = list.map(label).filter(Boolean);
      if (names.length) entry[key] = [...new Set(names)];
    }
    if (official && entry.rel) entry.ro = 1;
    if (f.inc !== null) entry.inc = f.inc;
    if (f.dis !== null) entry.dis = f.dis;
    if (f.flag.length) entry.flag = f.flag.map((v) => [v.file, v.from, v.to]);
    if (f.arms) entry.arms = f.arms;
    const prev = f.prev.map((q) => [q, label(q)]).filter(([, n]) => n);
    const next = f.next.map((q) => [q, label(q)]).filter(([, n]) => n);
    if (prev.length) entry.prev = prev;
    if (next.length) entry.next = next;
    polities[id] = entry;

    const seen = new Set();
    const list = [
      ...f.hos.filter((h) => h.from !== null && label(h.id)).map((h) => ({ id: h.id, name: label(h.id), from: h.from, to: h.to })),
      ...f.office.flatMap((o) => holders[o] ?? []),
    ]
      .filter((r) => r.from <= span.t && (r.to ?? r.from) >= span.f)
      .filter((r) => {
        const key = `${r.id}|${r.from}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.from - b.from);
    if (list.length) rulers[id] = list.map((r) => [r.name, r.from, r.to, r.id]);
  }

  fs.writeFileSync(path.join(OUT, 'polities.json'), JSON.stringify(polities));
  fs.writeFileSync(path.join(OUT, 'rulers.json'), JSON.stringify(rulers));
  return {
    polities: Object.keys(polities).length,
    withCapital: Object.values(polities).filter((p) => p.cap).length,
    withRulers: Object.keys(rulers).length,
  };
}

// ─── Сборка ──────────────────────────────────────────────────────────────

if (wants('events')) console.log(`События: ${await buildEvents()}`);
if (wants('people')) console.log(`Люди: ${await buildPeople()}`);
if (wants('polities')) {
  const result = await buildPolities();
  console.log(
    `Государства: ${result.polities}, со столицей — ${result.withCapital}, с правителями — ${result.withRulers}`
  );
}
