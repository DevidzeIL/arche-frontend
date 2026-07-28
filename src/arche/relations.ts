/**
 * Типизированные связи между заметками.
 *
 * Правила хранилища требуют: «Смысл — в тексте, связи — в ссылках».
 * Поэтому тип связи НЕ размечается руками во frontmatter, а выводится из того
 * описания, которое уже пишется рядом со ссылкой:
 *
 *     - [[Мифологическое мышление]] — то, от чего происходит переход к логосу
 *     - [[Романтизм]] — кризис, на который отвечает романтизм
 *     - [[Платон]] — влияние платонизма на мысль Августина
 *
 * Формат письма менять не нужно. Если инференс ошибся, тип можно задать явно
 * ведущим маркером в фигурных скобках:
 *
 *     - {противостоит} [[Теоцентризм]] — человек вместо Бога в центре
 */

import type { ArcheNote } from './types';

export const RELATION_KINDS = [
  'origin',
  'develops',
  'opposes',
  'crisis',
  'response',
  'influence',
  'author',
  'epoch',
  'context',
  'related',
] as const;

export type RelationKind = (typeof RELATION_KINDS)[number];

export interface RelationKindMeta {
  /** Подпись для ребра, читается как «A <label> B», где A раньше по времени */
  label: string;
  /** Заголовок группы в панели «Почему» */
  groupLabel: string;
  color: string;
  /** Пунктир для canvas; пустой массив — сплошная линия */
  dash: number[];
  /**
   * Смысловой вес. Влияет на то, какие рёбра рисуются при обзоре
   * и насколько связь важна для родословной.
   */
  weight: number;
  /** Участвует ли связь в трассировке «почему возникло» */
  genealogical: boolean;
}

export const RELATION_META: Record<RelationKind, RelationKindMeta> = {
  origin: {
    label: 'порождает',
    groupLabel: 'Переход',
    color: '#e0af68',
    dash: [],
    weight: 1.0,
    genealogical: true,
  },
  develops: {
    label: 'развивает',
    groupLabel: 'Развитие',
    color: '#7fc8a9',
    dash: [],
    weight: 0.9,
    genealogical: true,
  },
  crisis: {
    label: 'кризис',
    groupLabel: 'Кризис и пределы',
    color: '#d97777',
    dash: [],
    weight: 0.95,
    genealogical: true,
  },
  response: {
    label: 'ответ на',
    groupLabel: 'Ответ',
    color: '#e08a7a',
    dash: [],
    weight: 0.9,
    genealogical: true,
  },
  opposes: {
    label: 'противостоит',
    groupLabel: 'Противостояние',
    color: '#f7768e',
    dash: [5, 4],
    weight: 0.85,
    genealogical: true,
  },
  influence: {
    label: 'влияет на',
    groupLabel: 'Влияние',
    color: '#7aa2f7',
    dash: [],
    weight: 0.8,
    genealogical: true,
  },
  author: {
    label: 'автор',
    groupLabel: 'Авторство',
    color: '#b48ead',
    dash: [],
    weight: 0.6,
    genealogical: false,
  },
  epoch: {
    label: 'эпоха',
    groupLabel: 'Эпоха',
    color: '#9aa5ce',
    dash: [2, 3],
    weight: 0.4,
    genealogical: false,
  },
  context: {
    label: 'контекст',
    groupLabel: 'Контекст',
    color: '#565f89',
    dash: [2, 3],
    weight: 0.15,
    genealogical: false,
  },
  related: {
    label: 'связано с',
    groupLabel: 'Связано',
    color: '#6b7280',
    dash: [],
    weight: 0.3,
    genealogical: false,
  },
};

/**
 * Правила инференса, в порядке проверки — первое совпадение выигрывает.
 * Порядок важен: «кризис, на который отвечает романтизм» должен стать response,
 * а не crisis, поэтому более специфичные шаблоны идут раньше.
 */
const INFERENCE_RULES: Array<{ kind: RelationKind; pattern: RegExp }> = [
  { kind: 'response', pattern: /(ответ|отвеча\w*|реакци\w*|как ответ)\s/i },
  // Интеллектуальная преемственность важнее слова «критиковал» в том же описании:
  // «ученик Платона, развивший и критиковавший его идеи» — это линия, а не разрыв
  { kind: 'develops', pattern: /(ученик|учител\w*|последовател\w*|преемни\w*)/i },
  {
    kind: 'origin',
    pattern:
      /(от котор\w+ происходит переход|происходит переход|переход к|переход от|предшеству\w*|возника\w+ из|выраст\w*|вырос\w*|становится основой|основа для|подготавлива\w*|подготов\w*|расшат\w*|открыва\w+ (?:путь|возможность)|делает возможн\w*|дал\w* начало|приводит к|ведёт к|ведет к|на котор\w+ держится|держится на)/i,
  },
  { kind: 'crisis', pattern: /(кризис|предел\w*|утрат\w*|распад|разрушени\w*|исчерпани\w*|обнаружение границ|надлом\w*|скомпрометир\w*|обнаж\w+ предел|пошатн\w*)/i },
  { kind: 'opposes', pattern: /(противостои\w*|противопоставл\w*|отличие от|отход от|отказ от|критик\w*|вместо|альтернативн\w*|другой способ|в отличие)/i },
  { kind: 'develops', pattern: /(развити\w*|развива\w*|систематизаци\w*|систематизир\w*|продолжени\w*|продолжа\w*|углубл\w*|разработ\w*)/i },
  { kind: 'author', pattern: /(автор|ключевое произведение|произведение автора|написа\w*|создател\w*)/i },
  { kind: 'epoch', pattern: /(эпоха|эпохи|период)/i },
  { kind: 'influence', pattern: /(влияни\w*|повлия\w*|воздействи\w*|формиру\w*)/i },
  { kind: 'context', pattern: /(контекст вектора|контекст вектор\w*)/i },
];

/** Явный маркер: `- {противостоит} [[X]] — …` */
const EXPLICIT_MARKERS: Record<string, RelationKind> = {
  порождает: 'origin',
  переход: 'origin',
  развивает: 'develops',
  противостоит: 'opposes',
  кризис: 'crisis',
  ответ: 'response',
  влияет: 'influence',
  влияние: 'influence',
  автор: 'author',
  эпоха: 'epoch',
  контекст: 'context',
  связано: 'related',
};

export function inferRelationKind(description: string): RelationKind {
  for (const { kind, pattern } of INFERENCE_RULES) {
    if (pattern.test(description)) return kind;
  }
  return 'related';
}

export interface RawRelation {
  /** Название цели ссылки, ещё не разрешённое в id */
  targetTitle: string;
  kind: RelationKind;
  /** Человеческое описание связи из заметки */
  description: string;
  /** Тип задан явным маркером, а не выведен */
  explicit: boolean;
}

/** `- [[Цель]] — описание` или `- {маркер} [[Цель]] — описание` */
const RELATION_LINE =
  /^\s*[-*]\s*(?:\{([^}]+)\}\s*)?\[\[([^\]]+)\]\]\s*(?:[—–-]\s*(.*))?$/;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

function normalizeTarget(raw: string): string | null {
  const target = raw.split('|')[0].split('#')[0].trim();
  if (!target || IMAGE_EXT.test(target)) return null;
  return target;
}

/**
 * Достаёт связи из тела заметки.
 * Списочные ссылки с описанием — основной источник; остальные wikilinks
 * попадают как слабые 'related', чтобы граф не терял связность.
 */
export function extractRelations(body: string): RawRelation[] {
  const withoutCode = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  const found = new Map<string, RawRelation>();

  for (const line of withoutCode.split(/\r?\n/)) {
    const match = line.match(RELATION_LINE);
    if (!match) continue;

    const [, marker, rawTarget, rawDescription] = match;
    const targetTitle = normalizeTarget(rawTarget);
    if (!targetTitle) continue;

    const description = (rawDescription ?? '').trim();
    const explicitKind = marker ? EXPLICIT_MARKERS[marker.trim().toLowerCase()] : undefined;

    found.set(targetTitle, {
      targetTitle,
      kind: explicitKind ?? (description ? inferRelationKind(description) : 'related'),
      description,
      explicit: Boolean(explicitKind),
    });
  }

  // Упоминания в прозе: слабая связь, но без них граф разваливается на острова
  for (const match of withoutCode.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const targetTitle = normalizeTarget(match[1]);
    if (!targetTitle || found.has(targetTitle)) continue;
    found.set(targetTitle, { targetTitle, kind: 'related', description: '', explicit: false });
  }

  return [...found.values()];
}

/** Связи заметки после разбора; цели ещё не разрешены в id */
export function relationsOf(note: ArcheNote): RawRelation[] {
  return extractRelations(note.body);
}
