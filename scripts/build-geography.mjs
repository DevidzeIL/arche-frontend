/**
 * Физическая география для глобуса: реки, озёра, подписи морей, хребтов
 * и пустынь — из Natural Earth (общественное достояние).
 *
 * Карта истории без рек и морей читается плохо: вблизи непонятно, где
 * находишься, пока не прочтёшь подписи городов. Атлас опирается на Рейн,
 * Дунай и Средиземное море — здесь то же самое.
 *
 * Реки — 1:50m, плюс несколько исторически важных рек помельче из 1:10m
 * (Тибр, Майн, Ока): в 50m их нет. Русских названий у рек в Natural Earth
 * нет, поэтому подписываются только реки из словаря ниже; остальные
 * рисуются без подписи. У морей, озёр и хребтов русские названия свои.
 *
 * Запуск: pnpm geography. Исходники кэшируются в .cache/geography.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import { geoArea } from 'd3-geo';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, '.cache', 'geography');
const OUT = path.join(root, 'public', 'geo');
const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

/** mapshaper разбирает команду как строку, и обратные слеши Windows в ней ломаются */
const posix = (file) => file.split(path.sep).join('/');

async function source(name) {
  const file = path.join(CACHE, `${name}.geojson`);
  if (!fs.existsSync(file)) {
    console.log(`  ↓ ${name}`);
    const response = await fetch(`${SOURCE}/${name}.geojson`);
    if (!response.ok) throw new Error(`${response.status} ${name}`);
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  return file;
}

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** В Natural Earth в части названий стоят знаки ударения: «Я́блоновый хребе́т» */
const clean = (name) => name.normalize('NFD').replace(/́/g, '').normalize('NFC');

/**
 * Ранг подписи озера — по площади: у озёр в Natural Earth почти у всех ранг 0,
 * и Ладога не отличалась бы от пруда. Стерадианы: 1 км² ≈ 2,5·10⁻⁸
 */
const lakeRank = (area) => (area >= 1e-3 ? 1 : area >= 3e-4 ? 2 : area >= 1e-4 ? 3 : area >= 3e-5 ? 4 : 6);

/** Реки: названия Natural Earth → русские. Несколько написаний одной реки — одно название */
const RIVERS_RU = {
  Nile: 'Нил', 'El Bahr el Abyad': 'Белый Нил', 'El Bahr el Azraq': 'Голубой Нил', Abay: 'Голубой Нил',
  Amazonas: 'Амазонка', Mississippi: 'Миссисипи', Missouri: 'Миссури', Ohio: 'Огайо',
  Yangtze: 'Янцзы', 'Chang Jiang': 'Янцзы', Huang: 'Хуанхэ', Xi: 'Сицзян', Songhua: 'Сунгари', Liao: 'Ляохэ',
  Mekong: 'Меконг', Salween: 'Салуин', Ayeyarwady: 'Иравади', Brahmaputra: 'Брахмапутра',
  Ganges: 'Ганг', Yamuna: 'Джамна', Indus: 'Инд', Narmada: 'Нармада', Krishna: 'Кришна', 'Godävari': 'Годавари',
  Euphrates: 'Евфрат', 'Al Furat': 'Евфрат', Firat: 'Евфрат', Tigris: 'Тигр', Dicle: 'Тигр',
  'Shatt al Arab': 'Шатт-эль-Араб', Jordan: 'Иордан', Helmand: 'Гильменд', Tarim: 'Тарим',
  'Amu  Darya': 'Амударья', 'Syr Darya': 'Сырдарья', Panj: 'Пяндж', Naryn: 'Нарын',
  Danube: 'Дунай', Donau: 'Дунай', Rhine: 'Рейн', Rhein: 'Рейн', Rhin: 'Рейн',
  Elbe: 'Эльба', Oder: 'Одер', Vistula: 'Висла', Seine: 'Сена', Loire: 'Луара', Garonne: 'Гаронна',
  'Rhône': 'Рона', Po: 'По', Thames: 'Темза', Ebro: 'Эбро', Tajo: 'Тахо', Tejo: 'Тахо', Duero: 'Дуэро',
  Drava: 'Драва', Tisa: 'Тиса', Tisza: 'Тиса', Daugava: 'Западная Двина', Neva: 'Нева', 'Svir’': 'Свирь',
  Dnipro: 'Днепр', Dnepre: 'Днепр', Dniester: 'Днестр', Don: 'Дон', Volga: 'Волга', Kama: 'Кама',
  Ural: 'Урал', 'Severnaya Dvina': 'Северная Двина', Sukhona: 'Сухона', Vychegda: 'Вычегда', Pechora: 'Печора',
  Ob: 'Обь', Irtysh: 'Иртыш', Tobol: 'Тобол', 'Tom’': 'Томь', Yenisey: 'Енисей', Angara: 'Ангара',
  Lena: 'Лена', Aldan: 'Алдан', Vilyuy: 'Вилюй', Kolyma: 'Колыма', Indigirka: 'Индигирка',
  Amur: 'Амур', 'Heilong Jiang': 'Амур', 'Argun’': 'Аргунь', 'Selenge (Selenga)': 'Селенга',
  Glomma: 'Гломма', 'Göta älv': 'Гёта-эльв', Kemijoki: 'Кемийоки', Vuoksi: 'Вуокса',
  Congo: 'Конго', Niger: 'Нигер', Benue: 'Бенуэ', Zambezi: 'Замбези', Limpopo: 'Лимпопо',
  Orange: 'Оранжевая', Okavango: 'Окаванго', 'Sénégal': 'Сенегал', Volta: 'Вольта',
  'St. Lawrence': 'Св. Лаврентия', Hudson: 'Гудзон', Mackenzie: 'Маккензи', Yukon: 'Юкон',
  Columbia: 'Колумбия', 'Rio Grande': 'Рио-Гранде', Colorado: 'Колорадо',
  'Paraná': 'Парана', Uruguay: 'Уругвай', Orinoco: 'Ориноко', Magdalena: 'Магдалена',
  Madeira: 'Мадейра', Xingu: 'Шингу', Tocantins: 'Токантинс', Murray: 'Муррей', Darling: 'Дарлинг',
  'Suez Canal': 'Суэцкий канал', 'Panama Canal': 'Панамский канал',
};

/** Реки помельче из 1:10m: в 50m их нет, а на них стоит половина европейской истории */
const EXTRA_RIVERS = {
  Tevere: 'Тибр', Tiber: 'Тибр', Arno: 'Арно', Main: 'Майн', Mosel: 'Мозель', Moselle: 'Мозель',
  Maas: 'Маас', Meuse: 'Маас', Schelde: 'Шельда', Weser: 'Везер', Oka: 'Ока', Neman: 'Неман',
  Nemunas: 'Неман', Vltava: 'Влтава', Sava: 'Сава', Prut: 'Прут', Guadalquivir: 'Гвадалквивир',
  Guadiana: 'Гвадиана', Morava: 'Морава', Inn: 'Инн', Saône: 'Сона', Ems: 'Эмс',
};

const MARINE = new Set(['ocean', 'sea', 'bay', 'gulf']);
const REGIONS = new Set(['Range/mtn', 'Desert']);

async function run(commands, inputs = {}) {
  const out = await mapshaper.applyCommands(commands, inputs);
  return JSON.parse(String(Object.values(out)[0]));
}

// ─── Реки ────────────────────────────────────────────────────────────────

const rivers50 = read(await source('ne_50m_rivers_lake_centerlines'));
const rivers10 = read(await source('ne_10m_rivers_lake_centerlines'));
const riverFeatures = [
  ...rivers50.features.map((f) => ({
    type: 'Feature',
    geometry: f.geometry,
    properties: { r: f.properties.scalerank, n: RIVERS_RU[f.properties.name] ?? null },
  })),
  ...rivers10.features
    .filter((f) => EXTRA_RIVERS[f.properties.name])
    .map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      // Вне 50m — самые мелкие: показываются только вблизи
      properties: { r: 7, n: EXTRA_RIVERS[f.properties.name] },
    })),
];

// Подпись — у одного куска реки, самого длинного: иначе «Рейн» встал бы пять раз
const length = (geometry) => {
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  let sum = 0;
  for (const line of lines) for (let i = 1; i < line.length; i++) sum += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  return sum;
};
const longest = new Map();
for (const f of riverFeatures) {
  if (!f.properties.n) continue;
  const best = longest.get(f.properties.n);
  if (!best || length(f.geometry) > length(best.geometry)) longest.set(f.properties.n, f);
}
for (const f of longest.values()) f.properties.l = 1;
for (const f of riverFeatures) if (!f.properties.l) f.properties.n = null;

const riversFile = path.join(CACHE, 'rivers-input.json');
fs.writeFileSync(riversFile, JSON.stringify({ type: 'FeatureCollection', features: riverFeatures }));

// ─── Озёра ───────────────────────────────────────────────────────────────

const lakes50 = read(await source('ne_50m_lakes'));
const lakesFile = path.join(CACHE, 'lakes-input.json');
fs.writeFileSync(
  lakesFile,
  JSON.stringify({
    type: 'FeatureCollection',
    features: lakes50.features.map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        r: f.properties.scalerank,
        n: f.properties.name_ru ? clean(f.properties.name_ru) : null,
        a: lakeRank(geoArea(f)),
      },
    })),
  })
);

// Реки и озёра — одной топологией: общие координаты, меньше вес
const water = await mapshaper.applyCommands(
  [
    `-i "${posix(riversFile)}" "${posix(lakesFile)}" combine-files`,
    '-rename-layers rivers,lakes',
    '-simplify dp interval=1200 keep-shapes',
    '-o format=topojson quantization=60000 water.json',
  ].join(' ')
);
const waterJson = String(water['water.json']);
fs.writeFileSync(path.join(OUT, 'water.json'), waterJson);

// ─── Подписи: моря, хребты, пустыни, крупные озёра ───────────────────────

const labels = [];
const pointsOf = async (file, filter) => {
  const json = await run(`-i "${posix(file)}" -filter '${filter}' -points inner -o format=geojson precision=0.01 points.json`);
  return json.features;
};

const marine = await pointsOf(await source('ne_10m_geography_marine_polys'), '!!name_ru && ["ocean","sea","bay","gulf"].indexOf(featurecla) >= 0');
for (const f of marine) {
  const p = f.properties;
  if (!MARINE.has(p.featurecla) || !f.geometry) continue;
  labels.push([p.featurecla === 'ocean' ? 'ocean' : 'sea', clean(p.name_ru), ...f.geometry.coordinates, p.scalerank ?? 9]);
}

const regions = await pointsOf(await source('ne_10m_geography_regions_polys'), '!!NAME_RU && ["Range/mtn","Desert"].indexOf(FEATURECLA) >= 0');
for (const f of regions) {
  const p = f.properties;
  if (!REGIONS.has(p.FEATURECLA) || !f.geometry) continue;
  labels.push([p.FEATURECLA === 'Desert' ? 'desert' : 'range', clean(p.NAME_RU), ...f.geometry.coordinates, p.SCALERANK ?? 9]);
}

const lakePoints = await pointsOf(lakesFile, '!!n && a <= 4');
for (const f of lakePoints) {
  if (!f.geometry) continue;
  labels.push(['lake', f.properties.n, ...f.geometry.coordinates, f.properties.a]);
}

// Сначала крупное: океаны, потом моря, хребты и озёра по значимости
labels.sort((a, b) => a[4] - b[4]);
fs.writeFileSync(path.join(OUT, 'labels.json'), JSON.stringify({ fields: ['kind', 'name', 'lon', 'lat', 'rank'], rows: labels }));

const named = [...longest.keys()].length;
console.log(
  `Реки: ${riverFeatures.length} кусков, подписано ${named}; озёра: ${lakes50.features.length}; подписи: ${labels.length}` +
    ` (моря ${labels.filter((l) => l[0] === 'sea' || l[0] === 'ocean').length}, хребты ${labels.filter((l) => l[0] === 'range').length},` +
    ` пустыни ${labels.filter((l) => l[0] === 'desert').length}, озёра ${labels.filter((l) => l[0] === 'lake').length})`
);
console.log(`water.json: ${(waterJson.length / 1024).toFixed(0)} КБ`);
