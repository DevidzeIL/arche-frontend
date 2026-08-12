/**
 * Генерация вопросов из графа знаний.
 *
 * Вопросы не пишутся руками — они собираются из тех же типизированных
 * связей, что рисует карта. Поэтому тест проверяет ровно то, ради чего
 * хранилище существует: что из чего возникло, кто кому противостоит,
 * что было раньше. Объяснение к ответу — человеческая подпись связи
 * из заметки.
 *
 * cardId — стабильное зерно вопроса (ребро или узел графа). По нему
 * система повторения пересобирает вопрос заново: формулировка та же,
 * а неверные варианты каждый раз свежие.
 */
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode } from '../knowledge';
import { RELATION_META, type RelationKind } from '../relations';
import { excerptOf } from '../excerpt';
import { formatYear } from '../timeSpan';
import type { CardState } from './srs';
import { isDue } from './srs';

export interface QuizOption {
  id: string;
  label: string;
}

export interface QuizQuestion {
  cardId: string;
  prompt: string;
  options: QuizOption[];
  correctId: string;
  /** Подпись связи из заметки — показывается после ответа */
  explanation?: string;
  /** Куда вести кнопку «открыть заметку» */
  noteId?: string;
}

/** Виды связей, из которых можно спрашивать про родословную */
const CAUSAL: RelationKind[] = ['origin', 'develops', 'crisis', 'response', 'influence'];

/** Виды, чьи подписи годятся как варианты в вопросе «какая связь» */
const KIND_OPTIONS: RelationKind[] = [...CAUSAL, 'opposes'];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

const edgeIndexCache = new WeakMap<KnowledgeGraph, Map<string, KnowledgeEdge>>();

function edgesById(g: KnowledgeGraph): Map<string, KnowledgeEdge> {
  let map = edgeIndexCache.get(g);
  if (!map) {
    map = new Map(g.edges.map((e) => [e.id, e]));
    edgeIndexCache.set(g, map);
  }
  return map;
}

/**
 * Неверные варианты: того же типа, что правильный ответ, и НЕ связанные
 * с опорным узлом вопроса — иначе «неверный» вариант может оказаться
 * тоже верным, просто по другому ребру.
 */
function distractors(
  g: KnowledgeGraph,
  correct: KnowledgeNode,
  options: { anchorId?: string; count?: number; avoidTitleIn?: string } = {}
): KnowledgeNode[] {
  const count = options.count ?? 3;
  const excluded = new Set<string>([correct.id]);

  if (options.anchorId) {
    excluded.add(options.anchorId);
    for (const e of g.adjacent.get(options.anchorId) ?? []) {
      excluded.add(e.sourceId);
      excluded.add(e.targetId);
    }
  }

  let pool = g.nodes.filter((n) => !excluded.has(n.id));

  if (options.avoidTitleIn) {
    const text = options.avoidTitleIn.toLowerCase();
    pool = pool.filter((n) => !text.includes(n.title.toLowerCase()));
  }

  const sameType = pool.filter((n) => n.type === correct.type);
  if (sameType.length >= count) pool = sameType;

  return sampleNearInTime(pool, correct, count);
}

/**
 * Выбор неверных вариантов рядом по времени.
 *
 * Совпадения типа мало: если правильный ответ — античная концепция,
 * а варианты набраны по всей истории, отвечать можно не зная материала,
 * а просто узнав, что три названия «из другого времени». Берём вдвое
 * больше ближайших по эпохе кандидатов и тасуем уже их — вопрос
 * перестаёт решаться по одному звучанию названия.
 */
function sampleNearInTime(
  pool: KnowledgeNode[],
  correct: KnowledgeNode,
  count: number
): KnowledgeNode[] {
  const year = correct.time?.displayYear;
  if (year === undefined || pool.length <= count) return sample(pool, count);

  const dated = pool.filter((n) => n.time);
  if (dated.length < count) return sample(pool, count);

  const near = [...dated]
    .sort(
      (a, b) =>
        Math.abs(a.time!.displayYear - year) - Math.abs(b.time!.displayYear - year)
    )
    .slice(0, Math.max(count, count * 3));

  return sample(near, count);
}

function nodeOptions(correct: KnowledgeNode, wrong: KnowledgeNode[]): QuizOption[] {
  return shuffle([correct, ...wrong].map((n) => ({ id: n.id, label: n.title })));
}

function edgeExplanation(edge: KnowledgeEdge): string {
  const kind = RELATION_META[edge.kind].label;
  return edge.labels[0] ? `${kind} — ${edge.labels[0]}` : kind;
}

// ─── Строители вопросов ────────────────────────────────────────────────

/** «Что стоит у истоков X?» — по причинному ребру, ответ — предок */
function makeAncestorQuestion(g: KnowledgeGraph, edge: KnowledgeEdge): QuizQuestion | null {
  if (edge.undirected || !CAUSAL.includes(edge.kind)) return null;
  const source = g.nodeById.get(edge.sourceId);
  const target = g.nodeById.get(edge.targetId);
  if (!source || !target) return null;

  const wrong = distractors(g, source, { anchorId: target.id });
  if (wrong.length < 3) return null;

  return {
    cardId: `rel:${edge.id}`,
    prompt: `«${target.title}» — что из перечисленного стоит у его истоков?`,
    options: nodeOptions(source, wrong),
    correctId: source.id,
    explanation: edgeExplanation(edge),
    noteId: target.id,
  };
}

/** «К чему привело X?» — то же ребро с другой стороны */
function makeDescendantQuestion(g: KnowledgeGraph, edge: KnowledgeEdge): QuizQuestion | null {
  if (edge.undirected || !CAUSAL.includes(edge.kind)) return null;
  const source = g.nodeById.get(edge.sourceId);
  const target = g.nodeById.get(edge.targetId);
  if (!source || !target) return null;

  const wrong = distractors(g, target, { anchorId: source.id });
  if (wrong.length < 3) return null;

  return {
    cardId: `rel2:${edge.id}`,
    prompt: `К чему в дальнейшем ведёт «${source.title}»?`,
    options: nodeOptions(target, wrong),
    correctId: target.id,
    explanation: edgeExplanation(edge),
    noteId: source.id,
  };
}

/** «Какая связь между A и B?» — варианты из типов связей */
function makeKindQuestion(g: KnowledgeGraph, edge: KnowledgeEdge): QuizQuestion | null {
  if (!KIND_OPTIONS.includes(edge.kind) || edge.labels.length === 0) return null;
  const source = g.nodeById.get(edge.sourceId);
  const target = g.nodeById.get(edge.targetId);
  if (!source || !target) return null;

  const wrongKinds = sample(KIND_OPTIONS.filter((k) => k !== edge.kind), 3);
  const options = shuffle(
    [edge.kind, ...wrongKinds].map((k) => ({ id: k, label: RELATION_META[k].label }))
  );

  return {
    cardId: `kind:${edge.id}`,
    prompt: `Как связаны «${source.title}» и «${target.title}»?`,
    options,
    correctId: edge.kind,
    explanation: edge.labels[0],
    noteId: target.id,
  };
}

/** «Кто автор работы X?» */
function makeAuthorQuestion(g: KnowledgeGraph, edge: KnowledgeEdge): QuizQuestion | null {
  if (edge.kind !== 'author') return null;
  const a = g.nodeById.get(edge.sourceId);
  const b = g.nodeById.get(edge.targetId);
  if (!a || !b) return null;

  const work = a.type === 'work' ? a : b.type === 'work' ? b : null;
  const person = a.type === 'person' ? a : b.type === 'person' ? b : null;
  if (!work || !person) return null;

  const wrong = distractors(g, person, { anchorId: work.id });
  if (wrong.length < 3) return null;

  return {
    cardId: `author:${edge.id}`,
    prompt: `Кто автор «${work.title}»?`,
    options: nodeOptions(person, wrong),
    correctId: person.id,
    explanation: edge.labels[0],
    noteId: work.id,
  };
}

/** «О чём это определение?» — выжимка заметки со скрытым названием */
function makeDefQuestion(g: KnowledgeGraph, node: KnowledgeNode): QuizQuestion | null {
  const excerpt = excerptOf(node.note, 220);
  if (excerpt.length < 60) return null;

  const escaped = node.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const masked = excerpt.replace(new RegExp(escaped, 'gi'), '…');

  const wrong = distractors(g, node, { avoidTitleIn: masked });
  if (wrong.length < 3) return null;

  return {
    cardId: `def:${node.id}`,
    prompt: `«${masked}»\n\nО ком или о чём это?`,
    options: nodeOptions(node, wrong),
    correctId: node.id,
    noteId: node.id,
  };
}

/** «Что появилось раньше остального?» — по датировкам */
function makeChronoQuestion(
  anchor: KnowledgeNode,
  pool: KnowledgeNode[]
): QuizQuestion | null {
  if (!anchor.time) return null;

  // Кандидаты берутся из ближайших по времени, а не из всей истории:
  // иначе «что раньше» решается взглядом на разброс эпох, без знания
  const candidates = pool
    .filter((n) => n.time && n.id !== anchor.id)
    .sort(
      (a, b) =>
        Math.abs(a.time!.startYear - anchor.time!.startYear) -
        Math.abs(b.time!.startYear - anchor.time!.startYear)
    )
    .slice(0, 12);

  const picked: KnowledgeNode[] = [anchor];
  for (const candidate of shuffle(candidates)) {
    if (picked.length >= 4) break;
    // Годы должны заметно различаться, иначе вопрос спорный
    if (picked.every((p) => Math.abs(p.time!.startYear - candidate.time!.startYear) >= 20)) {
      picked.push(candidate);
    }
  }
  if (picked.length < 4) return null;

  const earliest = picked.reduce((a, b) => (a.time!.startYear <= b.time!.startYear ? a : b));

  return {
    cardId: `chrono:${anchor.id}`,
    prompt: 'Что из перечисленного появилось раньше остального?',
    options: nodeOptions(earliest, picked.filter((n) => n.id !== earliest.id)),
    correctId: earliest.id,
    explanation: `«${earliest.title}» — ${formatYear(earliest.time!.startYear, earliest.time!.precision)}`,
    noteId: earliest.id,
  };
}

// ─── Сборка ────────────────────────────────────────────────────────────

export function buildChapterQuiz(
  g: KnowledgeGraph,
  lessonNoteIds: string[],
  count = 8
): QuizQuestion[] {
  const nodes = lessonNoteIds
    .map((id) => g.nodeById.get(id))
    .filter((n): n is KnowledgeNode => Boolean(n));

  const byCard = new Map<string, QuizQuestion>();
  const push = (q: QuizQuestion | null) => {
    if (q && !byCard.has(q.cardId)) byCard.set(q.cardId, q);
  };

  for (const node of nodes) {
    push(makeDefQuestion(g, node));
    for (const edge of g.adjacent.get(node.id) ?? []) {
      push(makeAuthorQuestion(g, edge));
      push(makeAncestorQuestion(g, edge));
      push(makeDescendantQuestion(g, edge));
      push(makeKindQuestion(g, edge));
    }
  }

  for (const anchor of sample(nodes.filter((n) => n.time), 2)) {
    push(makeChronoQuestion(anchor, nodes));
  }

  return sample([...byCard.values()], count);
}

/** Пересобирает вопрос по зерну карточки — для сессий повторения */
export function regenerateQuestion(g: KnowledgeGraph, cardId: string): QuizQuestion | null {
  const sep = cardId.indexOf(':');
  if (sep < 0) return null;
  const prefix = cardId.slice(0, sep);
  const rest = cardId.slice(sep + 1);

  switch (prefix) {
    case 'def': {
      const node = g.nodeById.get(rest);
      return node ? makeDefQuestion(g, node) : null;
    }
    case 'chrono': {
      const node = g.nodeById.get(rest);
      return node ? makeChronoQuestion(node, g.nodes) : null;
    }
    case 'rel': {
      const edge = edgesById(g).get(rest);
      return edge ? makeAncestorQuestion(g, edge) : null;
    }
    case 'rel2': {
      const edge = edgesById(g).get(rest);
      return edge ? makeDescendantQuestion(g, edge) : null;
    }
    case 'kind': {
      const edge = edgesById(g).get(rest);
      return edge ? makeKindQuestion(g, edge) : null;
    }
    case 'author': {
      const edge = edgesById(g).get(rest);
      return edge ? makeAuthorQuestion(g, edge) : null;
    }
    default:
      return null;
  }
}

/** Существует ли ещё сущность, на которую ссылается карточка */
export function cardEntityExists(g: KnowledgeGraph, cardId: string): boolean {
  const sep = cardId.indexOf(':');
  if (sep < 0) return false;
  const prefix = cardId.slice(0, sep);
  const rest = cardId.slice(sep + 1);
  if (prefix === 'def' || prefix === 'chrono') return g.nodeById.has(rest);
  return edgesById(g).has(rest);
}

/**
 * Карточки, которые пора повторить сегодня.
 * extraExists — проверка для карточек вне графа (авторские тесты).
 */
export function dueCardIds(
  g: KnowledgeGraph,
  cards: Record<string, CardState>,
  extraExists?: (cardId: string) => boolean,
  now = new Date()
): string[] {
  return Object.entries(cards)
    .filter(
      ([id, card]) =>
        isDue(card, now) && (cardEntityExists(g, id) || Boolean(extraExists?.(id)))
    )
    .map(([id]) => id);
}
