/**
 * Карточки на запоминание.
 *
 * Отличие от тестов: у теста есть варианты, и правильный ответ можно
 * угадать. Карточка спрашивает на воспоминание — вы формулируете ответ
 * про себя, переворачиваете и честно оцениваете себя сами. Для того,
 * что нужно вынимать из головы без подсказок (суть понятия, датировка,
 * родословная идеи), это работает лучше выбора из четырёх.
 *
 * Как и вопросы теста, карточки НЕ пишутся руками — они собираются из
 * заметок и графа. Руками пишется только то, что автоматика вытащить
 * не может: раздел «## Карточки» в любой заметке, строками «фронт :: бэк».
 *
 * cardId — стабильное зерно. По нему интервальное повторение находит
 * карточку заново после пересборки vault'а.
 */
import type { ArcheNote } from '../types';
import type { KnowledgeGraph, KnowledgeEdge } from '../knowledge';
import { RELATION_META } from '../relations';
import { noteTypeLabel } from '../noteTypes';
import { excerptOf } from '../excerpt';
import { formatYear } from '../timeSpan';

export type FlashcardKind = 'define' | 'when' | 'origin' | 'legacy' | 'author' | 'authored';

export interface Flashcard {
  cardId: string;
  kind: FlashcardKind;
  /** Короткая подпись над вопросом: тип заметки или вид карточки */
  tag: string;
  /** Лицевая сторона — вопрос */
  front: string;
  /** Оборот — основной ответ */
  back: string;
  /** Уточнения на обороте: подписи связей, годы */
  details?: string[];
  noteId: string;
}

export const FLASHCARD_KIND_LABEL: Record<FlashcardKind, string> = {
  define: 'Суть',
  when: 'Датировка',
  origin: 'Что предшествует',
  legacy: 'К чему ведёт',
  author: 'Авторство',
  authored: 'Из заметки',
};

/** Типы, которым карточка на суть не нужна: это навигация и служебное */
const SKIP_TYPES = new Set(['hub', 'quiz']);

/** Порядок карточек внутри одной заметки — от опорной к деталям */
const KIND_ORDER: FlashcardKind[] = [
  'define',
  'authored',
  'author',
  'origin',
  'legacy',
  'when',
];

/**
 * Как назвать заметку в вопросе. Имя человека в кавычках выглядит дико,
 * а название работы или понятия без кавычек сливается с текстом вопроса.
 */
function subject(note: ArcheNote): string {
  return note.type === 'person' ? note.title : `«${note.title}»`;
}

// ─── Раздел «## Карточки» ──────────────────────────────────────────────

/** `- лицевая сторона :: оборот` */
const AUTHORED_LINE = /^\s*[-*]\s*(.+?)\s*::\s*(.+?)\s*$/;
const CARDS_SECTION = /^##\s+Карточки\s*$/i;
const ANY_HEADING = /^##\s+/;

/** Стабильный хэш текста — идентичность карточки для SRS */
function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function stripMarkup(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => alias || target)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** Карточки, написанные руками в разделе «## Карточки» заметки */
export function authoredCardsOf(note: ArcheNote): Flashcard[] {
  const lines = note.body.split(/\r?\n/);
  const cards: Flashcard[] = [];
  let inside = false;

  for (const line of lines) {
    if (CARDS_SECTION.test(line)) {
      inside = true;
      continue;
    }
    if (inside && ANY_HEADING.test(line)) break;
    if (!inside) continue;

    const match = line.match(AUTHORED_LINE);
    if (!match) continue;

    const front = stripMarkup(match[1]);
    const back = stripMarkup(match[2]);
    if (!front || !back) continue;

    cards.push({
      cardId: `fc:v:${note.id}:${hashText(front)}`,
      kind: 'authored',
      tag: FLASHCARD_KIND_LABEL.authored,
      front,
      back,
      noteId: note.id,
    });
  }

  return cards;
}

// ─── Автоматические карточки ───────────────────────────────────────────

function defineCard(note: ArcheNote): Flashcard | null {
  const back = excerptOf(note, 320);
  if (back.length < 60) return null;

  return {
    cardId: `fc:def:${note.id}`,
    kind: 'define',
    tag: noteTypeLabel(note.type),
    front: `${subject(note)} — в чём суть?`,
    back,
    noteId: note.id,
  };
}

/**
 * Датировка спрашивается только там, где она задана во frontmatter явно.
 * Разбор дат из текста — фолбэк для раскладки на карте: там ошибка сдвигает
 * узел, здесь она превратилась бы в заученную неправду.
 */
function whenCard(note: ArcheNote, graph: KnowledgeGraph): Flashcard | null {
  if (!note.timeSpan) return null;
  const time = graph.nodeById.get(note.id)?.time;
  if (!time) return null;

  const start = formatYear(time.startYear, time.precision);
  const answer =
    time.endYear !== undefined && time.endYear !== time.startYear
      ? `${start} — ${formatYear(time.endYear, time.precision)}`
      : start;

  return {
    cardId: `fc:when:${note.id}`,
    kind: 'when',
    tag: FLASHCARD_KIND_LABEL.when,
    front:
      note.type === 'person'
        ? `${note.title} — годы жизни?`
        : `${subject(note)} — к какому времени относится?`,
    back: answer,
    details: time.precision === 'approximate' ? ['Датировка приблизительная'] : undefined,
    noteId: note.id,
  };
}

/** «Кто автор» — только для работ: у остальных типов авторства нет */
function authorCard(note: ArcheNote, graph: KnowledgeGraph): Flashcard | null {
  if (note.type !== 'work') return null;

  const authors = (graph.adjacent.get(note.id) ?? [])
    .filter((e) => e.kind === 'author')
    .map((e) => graph.nodeById.get(e.sourceId === note.id ? e.targetId : e.sourceId))
    .filter((n) => n?.type === 'person')
    .map((n) => n!.title);

  if (authors.length === 0) return null;

  return {
    cardId: `fc:who:${note.id}`,
    kind: 'author',
    tag: FLASHCARD_KIND_LABEL.author,
    front: `«${note.title}» — кто автор?`,
    back: [...new Set(authors)].join(', '),
    noteId: note.id,
  };
}

/**
 * Подпись связи для оборота. Если в заметке есть человеческое описание,
 * оно и показывается: тип связи из него же и выведен, и дублировать его
 * значит писать «развивает: развитие идеи, что…».
 */
function edgeLine(title: string, edge: KnowledgeEdge): string {
  return `${title} — ${edge.labels[0] || RELATION_META[edge.kind].label}`;
}

function genealogyCard(
  note: ArcheNote,
  graph: KnowledgeGraph,
  direction: 'origin' | 'legacy'
): Flashcard | null {
  const edges = (direction === 'origin' ? graph.backward : graph.forward).get(note.id) ?? [];
  const neighbours = edges
    .filter((e) => RELATION_META[e.kind].genealogical && !e.undirected)
    .map((edge) => {
      const otherId = direction === 'origin' ? edge.sourceId : edge.targetId;
      const other = graph.nodeById.get(otherId);
      return other ? { edge, title: other.title } : null;
    })
    .filter((x): x is { edge: KnowledgeEdge; title: string } => x !== null)
    // Сильные связи вперёд: у заметки может быть десяток соседей,
    // а на карточке нужны те, без которых её не понять
    .sort((a, b) => RELATION_META[b.edge.kind].weight - RELATION_META[a.edge.kind].weight)
    .slice(0, 4);

  if (neighbours.length === 0) return null;

  return {
    cardId: `fc:${direction === 'origin' ? 'from' : 'to'}:${note.id}`,
    kind: direction,
    tag: FLASHCARD_KIND_LABEL[direction],
    front:
      direction === 'origin'
        ? `${subject(note)} — что этому предшествует?`
        : `${subject(note)} — к чему это ведёт?`,
    back: neighbours.map((n) => n.title).join(' · '),
    details: neighbours.map((n) => edgeLine(n.title, n.edge)),
    noteId: note.id,
  };
}

/** Все карточки одной заметки, в устойчивом порядке */
export function cardsOfNote(note: ArcheNote, graph: KnowledgeGraph): Flashcard[] {
  if (SKIP_TYPES.has(note.type ?? '')) return authoredCardsOf(note);

  const built: Flashcard[] = [
    defineCard(note),
    ...authoredCardsOf(note),
    authorCard(note, graph),
    genealogyCard(note, graph, 'origin'),
    genealogyCard(note, graph, 'legacy'),
    whenCard(note, graph),
  ].filter((c): c is Flashcard => c !== null);

  return built.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/** Полная колода vault'а: cardId → карточка */
export function buildDeck(notes: ArcheNote[], graph: KnowledgeGraph): Map<string, Flashcard> {
  const deck = new Map<string, Flashcard>();
  for (const note of notes) {
    for (const card of cardsOfNote(note, graph)) {
      if (!deck.has(card.cardId)) deck.set(card.cardId, card);
    }
  }
  return deck;
}

export function isFlashcardId(cardId: string): boolean {
  return cardId.startsWith('fc:');
}
