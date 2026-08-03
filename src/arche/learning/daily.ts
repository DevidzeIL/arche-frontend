/**
 * План на день.
 *
 * Задача не «пройти курс», а «зайти на пять минут и не сорвать привычку».
 * Поэтому день — это маленький фиксированный набор: сначала то, что пора
 * повторить, потом чуть-чуть нового, и одна заметка на прочтение.
 *
 * Порядок нового материала берётся из учебной программы, а не случайно:
 * хаб задаёт последовательность осей, оси — последовательность уроков.
 * Значит ежедневная практика идёт по вектору тем же путём, каким его
 * задумал автор vault'а, только по кусочку в день.
 *
 * План детерминирован внутри дня: перезагрузка страницы не тасует
 * карточки заново, иначе «осталось 4» превращалось бы в лотерею.
 */
import type { ArcheNote } from '../types';
import type { KnowledgeGraph } from '../knowledge';
import { buildCourses } from './curriculum';
import { buildDeck, type Flashcard } from './flashcards';
import { buildAuthoredIndex } from './authoredQuiz';
import { regenerateQuestion, type QuizQuestion } from './quiz';
import { isDue, type CardState } from './srs';
import { excerptOf } from '../excerpt';

/** Один шаг сессии: либо карточка на воспоминание, либо вопрос теста */
export type DailyItem =
  | { cardId: string; kind: 'card'; card: Flashcard; isNew: boolean }
  | { cardId: string; kind: 'quiz'; question: QuizQuestion; isNew: boolean };

export interface LessonOfDay {
  noteId: string;
  title: string;
  excerpt: string;
  /** Подпись из хаба — зачем этот урок стоит здесь */
  hook?: string;
  /** Название главы, из которой урок */
  chapterTitle?: string;
}

export interface DailyPlan {
  /** Что показать сегодня: сначала повторение, потом новое */
  items: DailyItem[];
  /** Сколько из items — повторение */
  dueCount: number;
  /** Сколько из items — новые карточки */
  newCount: number;
  /** Всего просроченных карточек, включая не влезшие в цель дня */
  dueTotal: number;
  /** Сколько новых карточек ещё осталось в запасе после сегодняшних */
  newAvailable: number;
  /** Заметка дня — то, что стоит прочитать */
  lesson: LessonOfDay | null;
  /** Всего карточек в колоде */
  deckSize: number;
  /** Сколько карточек уже заведено (то есть встречалось хоть раз) */
  seenSize: number;
  /** Карточки, чьи сущности исчезли из vault'а — их надо вычистить */
  dead: string[];
}

/** Доля цели, которую можно отдать новому материалу */
const NEW_SHARE = 3;

export function newPerDay(goal: number): number {
  return Math.max(3, Math.round(goal / NEW_SHARE));
}

/**
 * Заметки в учебном порядке: сначала уроки по осям хабов, затем всё
 * остальное. Так новые карточки выдаются по сюжету, а не вперемешку.
 */
export function curriculumOrder(notes: ArcheNote[]): ArcheNote[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const ordered: ArcheNote[] = [];
  const placed = new Set<string>();

  for (const course of buildCourses(notes)) {
    for (const chapter of course.chapters) {
      for (const lesson of chapter.lessons) {
        const note = byId.get(lesson.noteId);
        if (note && !placed.has(note.id)) {
          placed.add(note.id);
          ordered.push(note);
        }
      }
    }
  }

  // Остальное — по алфавиту: порядок должен быть устойчивым между сборками
  const rest = notes
    .filter((n) => !placed.has(n.id) && n.type !== 'hub' && n.type !== 'quiz')
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'));

  return [...ordered, ...rest];
}

function buildLessonOfDay(
  notes: ArcheNote[],
  lessonsRead: Record<string, string>
): LessonOfDay | null {
  const byId = new Map(notes.map((n) => [n.id, n]));

  for (const course of buildCourses(notes)) {
    for (const chapter of course.chapters) {
      for (const lesson of chapter.lessons) {
        if (lessonsRead[lesson.noteId]) continue;
        const note = byId.get(lesson.noteId);
        if (!note) continue;
        return {
          noteId: note.id,
          title: note.title,
          excerpt: excerptOf(note, 200),
          hook: lesson.hook,
          chapterTitle: chapter.title,
        };
      }
    }
  }

  // Курс пройден целиком — предлагаем любую непрочитанную заметку
  const leftover = curriculumOrder(notes).find((n) => !lessonsRead[n.id]);
  return leftover
    ? { noteId: leftover.id, title: leftover.title, excerpt: excerptOf(leftover, 200) }
    : null;
}

export interface DailyPlanInput {
  notes: ArcheNote[];
  graph: KnowledgeGraph;
  cards: Record<string, CardState>;
  lessonsRead: Record<string, string>;
  /** Сколько карточек показать всего */
  goal: number;
  /**
   * Сколько из них могут быть новыми. Считается от ПОЛНОЙ дневной нормы
   * за вычетом уже взятого сегодня — иначе, по мере того как остаток цели
   * убывает, лимит нового пересчитывался бы вниз и число «на сегодня»
   * менялось бы под руками.
   */
  newLimit?: number;
  now?: Date;
}

export function buildDailyPlan({
  notes,
  graph,
  cards,
  lessonsRead,
  goal,
  newLimit,
  now = new Date(),
}: DailyPlanInput): DailyPlan {
  const deck = buildDeck(notes, graph);
  const authored = buildAuthoredIndex(notes);

  const resolve = (cardId: string, isNew: boolean): DailyItem | null => {
    const card = deck.get(cardId);
    if (card) return { cardId, kind: 'card', card, isNew };

    const question = authored.get(cardId) ?? regenerateQuestion(graph, cardId);
    return question ? { cardId, kind: 'quiz', question, isNew } : null;
  };

  // ─── Повторение ───
  const dead: string[] = [];
  const dueItems: Array<{ item: DailyItem; dueAt: number; box: number }> = [];

  for (const [cardId, state] of Object.entries(cards)) {
    if (!isDue(state, now)) continue;
    const item = resolve(cardId, false);
    if (!item) {
      dead.push(cardId);
      continue;
    }
    dueItems.push({ item, dueAt: new Date(state.dueAt).getTime(), box: state.box });
  }

  // Сначала самые просроченные, среди равных — те, что хуже знаешь
  dueItems.sort((a, b) => a.dueAt - b.dueAt || a.box - b.box);
  const due = dueItems.map((d) => d.item);

  // ─── Новое ───
  const byNote = new Map<string, Flashcard[]>();
  for (const card of deck.values()) {
    const list = byNote.get(card.noteId);
    if (list) list.push(card);
    else byNote.set(card.noteId, [card]);
  }

  const freshAll: DailyItem[] = [];
  for (const note of curriculumOrder(notes)) {
    for (const card of byNote.get(note.id) ?? []) {
      if (cards[card.cardId]) continue;
      freshAll.push({ cardId: card.cardId, kind: 'card', card, isNew: true });
    }
  }

  const dueSlice = due.slice(0, goal);
  const freshLimit = Math.min(
    newLimit ?? newPerDay(goal),
    Math.max(0, goal - dueSlice.length)
  );
  const freshSlice = freshAll.slice(0, freshLimit);

  return {
    items: [...dueSlice, ...freshSlice],
    dueCount: dueSlice.length,
    newCount: freshSlice.length,
    dueTotal: due.length,
    newAvailable: Math.max(0, freshAll.length - freshSlice.length),
    lesson: buildLessonOfDay(notes, lessonsRead),
    deckSize: deck.size,
    seenSize: Object.keys(cards).filter((id) => deck.has(id) || authored.has(id)).length,
    dead,
  };
}

/** Ближайшая дата, когда снова появится повторение */
export function nextDueDate(cards: Record<string, CardState>, now = new Date()): Date | null {
  const times = Object.values(cards)
    .map((c) => new Date(c.dueAt).getTime())
    .filter((t) => t > now.getTime());
  return times.length ? new Date(Math.min(...times)) : null;
}
