/**
 * Раскраска карты не по государствам, а по тому, что их объединяет:
 * религии, языку, форме правления.
 *
 * Сведения — из Wikidata (см. polityFacts.ts), и подписи там разнобойные:
 * «католицизм», «Римско-католическая церковь», «латинский обряд». Если
 * красить по подписи как есть, Европа рассыпается на двадцать оттенков
 * одного и того же. Поэтому подписи раскладываются по семьям, и у каждой
 * семьи свой постоянный цвет — Франция в 1600 и в 1700 году окрашена
 * одинаково, и глаз сразу видит, где граница Реформации.
 */
import { hueOf } from './bordersData';
import type { PolityFacts } from './polityFacts';

export type Coloring = 'states' | 'religion' | 'language' | 'government';

export const COLORINGS: Array<{ key: Coloring; label: string }> = [
  { key: 'states', label: 'Государства' },
  { key: 'religion', label: 'Религия' },
  { key: 'language', label: 'Язык' },
  { key: 'government', label: 'Правление' },
];

export interface ColorCategory {
  key: string;
  label: string;
  hue: number;
  /** Не ответ, а «по-разному»: рисуется блёкло, чтобы не спорить с настоящими категориями */
  muted?: boolean;
}

interface Rule {
  test: RegExp;
  label: string;
  hue: number;
  /** С какого года это вообще возможно: лютеранство до 1517 года — ошибка данных */
  since?: number;
}

/** Порядок важен: для одной подписи «протестантизм» проверяется раньше общего «христианства» */
const RELIGION_RULES: Rule[] = [
  { test: /католи|римско|латинск/i, label: 'Католицизм', hue: 48, since: 30 },
  { test: /правосла|ортодокс|восточн.*церк|византийск/i, label: 'Православие', hue: 0, since: 30 },
  { test: /протестан|лютеран|кальвин|англикан|реформат|пресвитериан|гугенот|евангелическ/i, label: 'Протестантизм', hue: 275, since: 1517 },
  { test: /христиан|несториан|монофизит|ариан|копт/i, label: 'Христианство', hue: 18, since: 30 },
  { test: /шии|шиизм|исмаил|зейди/i, label: 'Шиизм', hue: 165, since: 632 },
  { test: /сунн|ислам|мусульм|ибади|хариджи/i, label: 'Ислам', hue: 130, since: 610 },
  { test: /иудаи|еврейск/i, label: 'Иудаизм', hue: 215 },
  { test: /будд|ламаи|махаян|тхерава/i, label: 'Буддизм', hue: 28 },
  { test: /индуи|хинду|брахман|вайшнав|шиваи|ведизм|ведическ/i, label: 'Индуизм', hue: 325 },
  { test: /джайн/i, label: 'Джайнизм', hue: 300 },
  { test: /сикх/i, label: 'Сикхизм', hue: 40, since: 1469 },
  { test: /зороастр|маздеи|манихе/i, label: 'Зороастризм', hue: 8 },
  { test: /конфуци/i, label: 'Конфуцианство', hue: 190 },
  { test: /даос/i, label: 'Даосизм', hue: 175 },
  { test: /синто/i, label: 'Синтоизм', hue: 350 },
  { test: /атеи|секуляр|светск|государственный атеизм/i, label: 'Светское государство', hue: 200 },
  {
    test: /язычес|политеи|эллинск|римская религия|египетская религия|германск|славянск|скандинавск|кельтск|тенгри|шаман|анимизм|месопотамск|ханаанск/i,
    label: 'Политеизм и местные культы',
    hue: 95,
  },
];

// Оттенки разнесены по кругу: «абсолютная монархия» и просто «монархия»
// на соседних оттенках на карте не различить
const GOVERNMENT_RULES: Rule[] = [
  { test: /абсолютн/i, label: 'Абсолютная монархия', hue: 0 },
  { test: /конституцион|парламентск.*монарх|ограниченн.*монарх/i, label: 'Конституционная монархия', hue: 50 },
  { test: /теократ|халифат|папск/i, label: 'Теократия', hue: 80 },
  { test: /тоталитар|диктатур|однопарти|социалистическ|коммунистическ|военн.*режим|хунт|авторитар/i, label: 'Диктатура, однопартийность', hue: 290 },
  { test: /республик|демократ/i, label: 'Республика', hue: 210 },
  { test: /олигарх|аристократ|патрициат/i, label: 'Олигархия', hue: 255 },
  { test: /конфедерац|федерац|союз|лига/i, label: 'Союз, федерация', hue: 170 },
  { test: /вожд|племен|кочев/i, label: 'Вождество, племенной союз', hue: 130 },
  { test: /феодал|вассал|княж/i, label: 'Феодальное государство', hue: 25 },
  { test: /монарх|королев|царств|импери|султан|эмират|ханств|деспот/i, label: 'Монархия', hue: 325 },
];

/** Несколько официальных религий разных семей: Священная Римская империя после Аугсбургского мира */
const MIXED: ColorCategory = { key: 'mixed', label: 'Несколько конфессий', hue: 230, muted: true };

/**
 * Какая из подписей решает.
 *
 * Религии — это альтернативы: первая подпись главная (предпочтительное
 * утверждение), остальные — что ещё было в стране. Если решало бы самое
 * раннее правило, «греческое православие» среди терпимых меньшинств
 * перекрашивало бы Османскую империю в православную. Поэтому order='labels'.
 *
 * Формы правления — уточнения: «монархия» и «абсолютная монархия» про одно
 * и то же, и решает самая конкретная — order='rules'.
 *
 * official — подписи это официальные религии (P3075). Тогда порядок в
 * Wikidata ничего не значит, и если семей несколько — честнее так и
 * сказать, чем выбрать первую попавшуюся
 */
function byRules(
  labels: string[] | undefined,
  rules: Rule[],
  year: number,
  { order, official = false }: { order: 'labels' | 'rules'; official?: boolean }
): ColorCategory | null {
  if (!labels || labels.length === 0) return null;
  const families: Rule[] = [];
  for (const label of labels) {
    const rule = rules.find((r) => r.test.test(label));
    if (!rule || (rule.since !== undefined && year < rule.since)) continue;
    if (!families.includes(rule)) families.push(rule);
  }
  if (order === 'rules') families.sort((a, b) => rules.indexOf(a) - rules.indexOf(b));
  if (official && families.length > 1) return MIXED;
  if (families.length > 0) {
    const rule = families[0];
    return { key: rule.label, label: rule.label, hue: rule.hue };
  }
  // Все подписи — семьи, которых в этот год ещё не было: сведения не про этот год
  if (labels.every((label) => rules.some((r) => r.test.test(label)))) return null;
  // Подпись есть, но ни в одну семью не легла: своим цветом, но честно — «другое»
  return { key: `other:${labels[0]}`, label: labels[0].charAt(0).toUpperCase() + labels[0].slice(1), hue: hueOf(labels[0]) };
}

/** Категория государства для раскраски; null — сведений нет, рисуется серым */
export function categoryOf(coloring: Coloring, facts: PolityFacts | undefined, year: number): ColorCategory | null {
  if (coloring === 'religion') {
    return byRules(facts?.rel, RELIGION_RULES, year, { order: 'labels', official: facts?.ro === 1 });
  }
  if (coloring === 'government') return byRules(facts?.gov, GOVERNMENT_RULES, year, { order: 'rules' });
  if (coloring === 'language') {
    const label = facts?.lang?.[0];
    if (!label) return null;
    // «немецкий язык» и «Немецкий» — одно и то же
    const key = label.toLowerCase().replace(/\s+язык$/, '').trim();
    return { key, label: label.charAt(0).toUpperCase() + label.slice(1), hue: hueOf(key) };
  }
  return null;
}
