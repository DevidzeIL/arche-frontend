/**
 * База знаний: войны, течения, религии, народы, эпохи и связи между ними.
 *
 * Глобус показывал точки — событие здесь, человек там. Но история
 * держится на связях: война — это участники, сражения, причины и итоги;
 * течение — люди, которые к нему принадлежали, и те, на кого они повлияли.
 * Всё это в Wikidata есть, под CC0, и без чужого текста: названия, годы,
 * координаты и ссылки между элементами.
 *
 * Здесь же — привязка заметок хранилища к Wikidata: по ней Кант на своей
 * странице узнаёт, к какому течению принадлежал и на кого повлиял.
 * Привязка лежит в отдельном файле, заметки не трогаются; поправить её
 * можно полем `wikidata: Q…` во frontmatter.
 *
 * Запуск: pnpm kb (нужен собранный фон: pnpm context). Ответы кэшируются
 * в .cache/kb — оборванный запуск продолжится с того же места.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARTICLES,
  articleOf,
  chunk,
  claimsOf,
  firstPerItem,
  idOf,
  itemOf,
  jsonYearOf,
  labelOf,
  pointOf,
  wikidataClient,
  yearOf,
} from './lib/wikidata.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, '.cache', 'kb');
const OUT = path.join(root, 'public', 'kb');
const VAULT = path.join(root, 'arche-vault');
fs.mkdirSync(OUT, { recursive: true });

const { sparql, entities, search } = wikidataClient(CACHE);

/**
 * Виды сущностей. Порядок важен: дадаизм числится и направлением
 * искусства, и литературным направлением — достаётся первому.
 */
const GROUPS = [
  // Тридцатилетняя война — «религиозная война», Наполеоновские и Крестовые — «серия войн»
  { type: 'war', classes: ['Q198', 'Q8465', 'Q103495', 'Q1006311', 'Q831663', 'Q1827102', 'Q104212151'], minLinks: 15 },
  { type: 'movement', kind: 'philosophy', classes: ['Q2915955', 'Q12765852'], minLinks: 8 },
  { type: 'movement', kind: 'art', classes: ['Q968159', 'Q1792644'], minLinks: 15 },
  { type: 'movement', kind: 'literature', classes: ['Q3326717'], minLinks: 12 },
  { type: 'movement', kind: 'architecture', classes: ['Q32880'], minLinks: 15 },
  // Просвещение числится только «культурным движением»; класс широкий, поэтому порог высокий
  { type: 'movement', kind: 'culture', classes: ['Q2198855'], minLinks: 40 },
  // Католицизм и протестантизм — «семейства деноминаций» и «крупнейшие религии»
  { type: 'religion', classes: ['Q9174', 'Q13414953', 'Q879146', 'Q123129246', 'Q6957341'], minLinks: 25 },
  { type: 'nation', classes: ['Q41710'], minLinks: 40 },
  { type: 'period', classes: ['Q11514315', 'Q6428674'], minLinks: 20 },
];

const TYPES = {
  war: 'Война',
  battle: 'Сражение',
  movement: 'Течение',
  religion: 'Религия',
  nation: 'Народ',
  period: 'Эпоха',
};
const MOVEMENT_KINDS = {
  philosophy: 'Философия',
  art: 'Искусство',
  literature: 'Литература',
  architecture: 'Архитектура',
  culture: 'Культура',
};

/** Сколько сражений войны и представителей течения хранить: дальше — хвост */
const BATTLES_PER_WAR = 60;
const MEMBERS_PER_MOVEMENT = 40;

function listQuery({ classes, minLinks }) {
  return `
SELECT ?item ?itemLabel ?itemDescription ?start ?end ?coord ?links ?ru ?en WHERE {
  VALUES ?class { ${classes.map((q) => `wd:${q}`).join(' ')} }
  ?item wdt:P31 ?class; wikibase:sitelinks ?links.
  FILTER(?links >= ${minLinks})
  OPTIONAL { ?item wdt:P580 ?s1 } OPTIONAL { ?item wdt:P571 ?s2 } OPTIONAL { ?item wdt:P585 ?s3 }
  BIND(COALESCE(?s1, ?s2, ?s3) AS ?start)
  OPTIONAL { ?item wdt:P582 ?e1 } OPTIONAL { ?item wdt:P576 ?e2 }
  BIND(COALESCE(?e1, ?e2) AS ?end)
  OPTIONAL { ?item wdt:P625 ?own }
  OPTIONAL { ?item wdt:P276 ?place. ?place wdt:P625 ?placeCoord }
  BIND(COALESCE(?own, ?placeCoord) AS ?coord)
  ${ARTICLES}
}`;
}

// ─── 1. Сущности ─────────────────────────────────────────────────────────

const items = new Map();
for (const group of GROUPS) {
  // Классы — в имени кэша: иначе после их правки молча взялся бы старый ответ
  const name = `${group.type}-${group.kind ?? ''}-${group.minLinks}-${group.classes.join('')}`;
  const rows = firstPerItem(await sparql(listQuery(group), name));
  let added = 0;
  for (const row of rows) {
    const id = idOf(row.item.value);
    const title = labelOf(row.itemLabel);
    if (!title || items.has(id)) continue;
    const start = yearOf(row.start?.value);
    // Эпоха без начала на шкалу не встаёт — и в ленту её не положить
    if (group.type === 'period' && start === null) continue;
    const end = yearOf(row.end?.value);
    const entry = { t: group.type, n: title, links: Number(row.links.value) };
    if (group.kind) entry.k = group.kind;
    const description = labelOf(row.itemDescription);
    if (description) entry.d = description.length > 140 ? `${description.slice(0, 139).trimEnd()}…` : description;
    if (start !== null && start <= new Date().getFullYear()) entry.f = start;
    if (end !== null && end >= (entry.f ?? -Infinity) && end <= new Date().getFullYear()) entry.e = end;
    const point = pointOf(row.coord?.value);
    if (point) entry.c = point;
    const ru = articleOf(row.ru?.value);
    const en = articleOf(row.en?.value);
    if (ru) entry.ru = ru;
    else if (en) entry.en = en;
    items.set(id, entry);
    added += 1;
  }
  console.log(`  ${TYPES[group.type]}${group.kind ? ` (${MOVEMENT_KINDS[group.kind]})` : ''}: ${added}`);
}

// ─── 2. Связи из утверждений ─────────────────────────────────────────────

const amountOf = (claim) => Number(claim?.mainsnak?.datavalue?.value?.amount);

function extract(entity) {
  const ids = (prop) => claimsOf(entity, prop).map(itemOf).filter(Boolean);
  const year = (prop) => jsonYearOf(claimsOf(entity, prop)[0]?.mainsnak?.datavalue?.value?.time);
  const amounts = (prop) => claimsOf(entity, prop).map(amountOf).filter(Number.isFinite);
  return {
    participants: ids('P710'),
    casualties: Math.max(0, ...amounts('P1120')) || null,
    causes: ids('P828'),
    effects: ids('P1542'),
    partOf: ids('P361'),
    prev: ids('P155'),
    next: ids('P156'),
    founders: ids('P112'),
    splitFrom: ids('P807'),
    subclassOf: ids('P279'),
    origin: ids('P495'),
    country: ids('P17'),
    continent: ids('P30'),
    location: ids('P276'),
    languages: ids('P2936'),
    religions: ids('P140'),
    population: Math.max(0, ...amounts('P1082')) || null,
    start: year('P580') ?? year('P571'),
    end: year('P582') ?? year('P576'),
  };
}

const claims = await entities('claims', [...items.keys()], 'props=claims', extract);

/** Имя кэша по содержимому пачки: добавленный элемент меняет одну пачку, а не сдвигает все */
const batchName = (prefix, batch) => {
  let hash = 0;
  for (const ch of batch.join(',')) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0;
  return `${prefix}-${(hash >>> 0).toString(36)}-${batch.length}`;
};

/**
 * Люди среди участников войн. В P710 вперемешку стороны и лица:
 * «Пруссия, Франция, …, Георг II, Мария Терезия». Стороны подсвечиваются
 * на карте, лица — отдельной строкой справки
 */
const participantIds = [...new Set(Object.values(claims).flatMap((c) => c?.participants ?? []))].sort();
const humans = new Set();
for (const batch of chunk(participantIds, 200)) {
  const rows = await sparql(
    `SELECT ?p WHERE { VALUES ?p { ${batch.map((id) => `wd:${id}`).join(' ')} } ?p wdt:P31 wd:Q5. }`,
    batchName('humans', batch)
  );
  for (const row of rows) humans.add(idOf(row.p.value));
}

const referenced = new Set();
const keepRefs = (list, limit = 12) => {
  const kept = list.slice(0, limit);
  for (const id of kept) if (!items.has(id)) referenced.add(id);
  return kept;
};

for (const [id, entry] of items) {
  const c = claims[id];
  if (!c) continue;
  if (entry.f === undefined && c.start !== null) entry.f = c.start;
  if (entry.e === undefined && c.end !== null && c.end >= (entry.f ?? -Infinity)) entry.e = c.end;
  const set = (key, list, limit) => {
    const kept = keepRefs(list, limit);
    if (kept.length) entry[key] = kept;
  };
  if (entry.t === 'war') {
    set('p', c.participants.filter((q) => !humans.has(q)), 30);
    set('ld', c.participants.filter((q) => humans.has(q)), 12);
    set('ca', c.causes);
    set('ef', c.effects);
    set('of', c.partOf, 4);
    if (c.casualties) entry.dead = c.casualties;
  }
  if (entry.t === 'movement') {
    set('fo', c.founders, 6);
    set('o', [...c.origin, ...c.country], 3);
    set('of', c.partOf, 4);
  }
  if (entry.t === 'religion') {
    set('fo', c.founders, 6);
    // Ветвь — от чего отделилась или чьим подклассом числится, если это тоже религия
    set('pa', [...c.splitFrom, ...c.subclassOf.filter((q) => items.get(q)?.t === 'religion')], 4);
    set('o', c.origin, 3);
  }
  if (entry.t === 'nation') {
    set('lang', c.languages, 6);
    set('rel', c.religions, 6);
    set('of', c.partOf, 4);
    set('o', c.country, 6);
    if (c.population) entry.pop = c.population;
  }
  if (entry.t === 'period') {
    set('prev', c.prev, 3);
    set('next', c.next, 3);
    set('of', c.partOf, 3);
    set('o', [...c.location, ...c.country, ...c.continent], 3);
  }
}

// ─── 3. Сражения войн ────────────────────────────────────────────────────

const wars = [...items].filter(([, e]) => e.t === 'war').map(([id]) => id);
const battlesOf = new Map();
for (const [i, batch] of chunk(wars, 40).entries()) {
  const rows = await sparql(
    `SELECT ?item ?itemLabel ?war ?date ?coord ?links WHERE {
  VALUES ?war { ${batch.map((id) => `wd:${id}`).join(' ')} }
  ?item wdt:P361 ?war; wdt:P625 ?coord; wikibase:sitelinks ?links.
  FILTER(?links >= 5)
  OPTIONAL { ?item wdt:P585 ?d1 } OPTIONAL { ?item wdt:P580 ?d2 }
  BIND(COALESCE(?d1, ?d2) AS ?date)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }
}`,
    `battles-${i}-${batch.length}`
  );
  for (const row of firstPerItem(rows)) {
    const id = idOf(row.item.value);
    const war = idOf(row.war.value);
    const title = labelOf(row.itemLabel);
    const point = pointOf(row.coord?.value);
    if (!title || !point || items.get(id)?.t === 'war') continue;
    const list = battlesOf.get(war) ?? [];
    list.push({ id, n: title, f: yearOf(row.date?.value), c: point, links: Number(row.links.value) });
    battlesOf.set(war, list);
  }
}
let battleCount = 0;
for (const [war, list] of battlesOf) {
  const kept = list.sort((a, b) => b.links - a.links).slice(0, BATTLES_PER_WAR);
  items.get(war).b = kept.map((b) => b.id);
  for (const b of kept) {
    if (items.has(b.id)) continue;
    const entry = { t: 'battle', n: b.n, c: b.c, w: war, links: b.links };
    if (b.f !== null) entry.f = b.f;
    items.set(b.id, entry);
    battleCount += 1;
  }
}
console.log(`  Сражения войн: ${battleCount}`);

// ─── 4. Люди: представители течений и связи влияния ──────────────────────

const persons = new Map();
const addPerson = (id, name, birth, death, links) => {
  if (!name) return;
  const known = persons.get(id);
  if (!known || (links ?? 0) > (known[3] ?? 0)) persons.set(id, [name, birth, death, links ?? 0]);
};

const movements = [...items].filter(([, e]) => e.t === 'movement').map(([id]) => id);
const members = {};
for (const [i, batch] of chunk(movements, 40).entries()) {
  const rows = await sparql(
    `SELECT ?m ?item ?itemLabel ?birth ?death ?links WHERE {
  VALUES ?m { ${batch.map((id) => `wd:${id}`).join(' ')} }
  ?item wdt:P135 ?m; wdt:P31 wd:Q5; wikibase:sitelinks ?links.
  FILTER(?links >= 20)
  OPTIONAL { ?item wdt:P569 ?birth } OPTIONAL { ?item wdt:P570 ?death }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }
}`,
    `members-${i}-${batch.length}`
  );
  const byMovement = new Map();
  for (const row of rows) {
    const m = idOf(row.m.value);
    const id = idOf(row.item.value);
    const links = Number(row.links.value);
    addPerson(id, labelOf(row.itemLabel), yearOf(row.birth?.value), yearOf(row.death?.value), links);
    const list = byMovement.get(m) ?? new Map();
    list.set(id, links);
    byMovement.set(m, list);
  }
  for (const [m, list] of byMovement) {
    members[m] = [...list].sort((a, b) => b[1] - a[1]).slice(0, MEMBERS_PER_MOVEMENT).map(([id]) => id);
  }
}

// Люди фона (pnpm context) — их связи тоже нужны
const contextPeople = JSON.parse(fs.readFileSync(path.join(root, 'public', 'context', 'people.json'), 'utf8'));
for (const row of contextPeople.rows) {
  const p = Object.fromEntries(contextPeople.fields.map((f, i) => [f, row[i]]));
  addPerson(p.id, p.title, p.birth, p.death, p.links);
}

// ─── 5. Привязка заметок хранилища ───────────────────────────────────────

const normalize = (value) =>
  value.trim().toLowerCase().replace(/ё/g, 'е').replace(/[«»"']/g, '').replace(/\s+/g, ' ');

function vaultNotes() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('_')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) {
        const front = fs.readFileSync(full, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
        const field = (name) => front.match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'm'))?.[1]?.replace(/^["']|["']$/g, '');
        out.push({
          id: field('id'),
          type: field('type'),
          wikidata: field('wikidata'),
          title: path.basename(entry.name, '.md'),
        });
      }
    }
  };
  walk(VAULT);
  return out.filter((n) => n.id && !['hub', 'quiz'].includes(n.type));
}

const notes = vaultNotes();
const byTitle = new Map();
const offer = (title, id, kind) => {
  const key = normalize(title);
  if (!byTitle.has(key)) byTitle.set(key, { id, kind });
};
for (const [id, p] of persons) offer(p[0], id, 'person');
for (const [id, e] of items) offer(e.n, id, e.t);
const contextEvents = JSON.parse(fs.readFileSync(path.join(root, 'public', 'context', 'events.json'), 'utf8'));
for (const row of contextEvents.rows) offer(row[contextEvents.fields.indexOf('title')], row[0], 'event');

/** «Критика чистого разума — Кант» → «Критика чистого разума» */
const searchTerm = (note) => (note.type === 'work' ? note.title.split(' — ')[0] : note.title);

const vault = {};
const unmatched = [];
for (const note of notes) {
  // wikidata: none — скрипт привязал не то, и заметке лучше остаться без справки
  if (note.wikidata === 'none') continue;
  if (note.wikidata && /^Q\d+$/.test(note.wikidata)) {
    vault[note.id] = note.wikidata;
    continue;
  }
  // Места ищутся всегда поиском: «Афины» среди наших сущностей — это не город
  const hit = note.type === 'place' ? null : byTitle.get(normalize(searchTerm(note)));
  const compatible = hit && (note.type === 'person') === (hit.kind === 'person');
  if (compatible) vault[note.id] = hit.id;
  else unmatched.push(note);
}

// Остальное — поиском по русскому названию, с проверкой типа
const found = await search('vault-search', unmatched.map(searchTerm));
const candidateIds = [...new Set(Object.values(found).flat().map((r) => r.id))];
const kindsOf = await entities('vault-types', candidateIds, 'props=claims', (e) => ({
  p31: claimsOf(e, 'P31').map(itemOf).filter(Boolean),
  coord: claimsOf(e, 'P625').length > 0,
}));
const DISAMBIGUATION = 'Q4167410';
for (const note of unmatched) {
  const term = normalize(searchTerm(note));
  const match = (found[searchTerm(note)] ?? []).find((r) => {
    if (normalize(r.label ?? '') !== term) return false;
    const kind = kindsOf[r.id];
    if (!kind || kind.p31.includes(DISAMBIGUATION)) return false;
    if (note.type === 'person') return kind.p31.includes('Q5');
    if (note.type === 'place') return kind.coord;
    return !kind.p31.includes('Q5');
  });
  if (match) vault[note.id] = match.id;
}
console.log(`  Заметки хранилища: привязано ${Object.keys(vault).length} из ${notes.length}`);

// Люди хранилища — тоже участники связей влияния
const vaultPersons = notes.filter((n) => n.type === 'person' && vault[n.id]).map((n) => vault[n.id]);
const vaultPersonInfo = await entities('vault-persons', vaultPersons, 'props=labels|claims&languages=ru|en', (e) => ({
  name: e.labels?.ru?.value ?? e.labels?.en?.value ?? null,
  birth: jsonYearOf(claimsOf(e, 'P569')[0]?.mainsnak?.datavalue?.value?.time),
  death: jsonYearOf(claimsOf(e, 'P570')[0]?.mainsnak?.datavalue?.value?.time),
  sitelinks: Object.keys(e.sitelinks ?? {}).length,
}));
for (const [id, info] of Object.entries(vaultPersonInfo)) {
  if (info) addPerson(id, info.name, info.birth, info.death, 1000);
}

// ─── 6. Влияние и течения людей ──────────────────────────────────────────

/**
 * Пачки по отсортированным людям и с именем по содержимому: новый человек
 * меняет одну пачку, а не сдвигает все — и кэш остальных остаётся годным
 */
const known = [...persons.keys()].sort();
const influence = new Set();
const movementsOf = {};
/**
 * Влияние — двумя отдельными запросами и небольшими пачками: запрос
 * в обе стороны сразу на сотню человек WDQS не успевает за минуту
 */
const influenceQuery = (values, reverse) => `SELECT ?a ?aLabel ?aBirth ?aDeath ?aLinks ?b WHERE {
  VALUES ?b { ${values} }
  ${reverse ? '?a wdt:P737 ?b.' : '?b wdt:P737 ?a.'}
  ?a wdt:P31 wd:Q5; wikibase:sitelinks ?aLinks.
  FILTER(?aLinks >= 30)
  OPTIONAL { ?a wdt:P569 ?aBirth } OPTIONAL { ?a wdt:P570 ?aDeath }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }
}`;

for (const [i, batch] of chunk(known, 60).entries()) {
  const values = batch.map((id) => `wd:${id}`).join(' ');
  // Кто повлиял на наших людей — и на кого повлияли они
  for (const reverse of [false, true]) {
    const rows = await sparql(influenceQuery(values, reverse), batchName(`influence-${reverse ? 'on' : 'by'}`, batch));
    for (const row of rows) {
      const a = idOf(row.a.value);
      const b = idOf(row.b.value);
      addPerson(a, labelOf(row.aLabel), yearOf(row.aBirth?.value), yearOf(row.aDeath?.value), Number(row.aLinks.value));
      influence.add(reverse ? `${b}>${a}` : `${a}>${b}`);
    }
  }
  if (i % 10 === 0) process.stdout.write(`\r  влияние: ${i + 1} / ${Math.ceil(known.length / 60)}`);

  const mrows = await sparql(
    `SELECT ?item ?m WHERE { VALUES ?item { ${values} } ?item wdt:P135 ?m }`,
    batchName('person-movements', batch)
  );
  for (const row of mrows) {
    const m = idOf(row.m.value);
    if (items.get(m)?.t !== 'movement') continue;
    (movementsOf[idOf(row.item.value)] ??= []).push(m);
  }
}
for (const [m, list] of Object.entries(members)) {
  for (const person of list) {
    const own = (movementsOf[person] ??= []);
    if (!own.includes(m)) own.push(m);
  }
}
console.log(`  Люди: ${persons.size}, связей влияния: ${influence.size}`);

// ─── 7. Подписи ко всему, на что ссылаемся ───────────────────────────────

const labels = await entities('labels', [...referenced], 'props=labels&languages=ru|en', (e) =>
  e.labels?.ru?.value ?? e.labels?.en?.value ?? null
);

// ─── Запись ──────────────────────────────────────────────────────────────

const strip = (entry) => {
  const { links, ...rest } = entry;
  return rest;
};

const itemsOut = {};
// Порядок — по известности: поиск и ленты берут первых
for (const [id, entry] of [...items].sort((a, b) => b[1].links - a[1].links)) itemsOut[id] = strip(entry);

const labelsOut = {};
for (const id of referenced) if (labels[id]) labelsOut[id] = labels[id];

fs.writeFileSync(
  path.join(OUT, 'kb.json'),
  JSON.stringify({ types: TYPES, movementKinds: MOVEMENT_KINDS, items: itemsOut, labels: labelsOut })
);

const personsOut = {};
for (const [id, p] of persons) personsOut[id] = p.slice(0, 3);
fs.writeFileSync(
  path.join(OUT, 'links.json'),
  JSON.stringify({
    persons: personsOut,
    members,
    movementsOf,
    influence: [...influence].map((edge) => edge.split('>')),
  })
);
fs.writeFileSync(path.join(OUT, 'vault.json'), JSON.stringify(vault));

const count = (t) => Object.values(itemsOut).filter((e) => e.t === t).length;
console.log(
  `Готово: войн ${count('war')}, сражений ${count('battle')}, течений ${count('movement')}, ` +
    `религий ${count('religion')}, народов ${count('nation')}, эпох ${count('period')}`
);
