/**
 * Что не запоминается.
 *
 * Интервальное повторение уже копит по каждой карточке `lapses` — сколько
 * раз её забывали — и `box`, то есть насколько она выучена. Эти данные
 * не показывались нигде, хотя они самое ценное, что накапливается:
 * приложение знает, какие темы проседают, и молчит об этом.
 *
 * Здесь они превращаются в список «перечитать вот это», сгруппированный
 * по заметкам: забытая карточка сама по себе — не тема, а вот три забытые
 * карточки одной заметки говорят, что заметку стоит перечитать.
 */
import type { ArcheNote } from '../types';
import type { KnowledgeGraph } from '../knowledge';
import type { CardState } from './srs';
import { buildDeck, type Flashcard } from './flashcards';
import { buildAuthoredIndex } from './authoredQuiz';
import { regenerateQuestion } from './quiz';

export interface WeakCard {
  cardId: string;
  /** Формулировка — чтобы было видно, что именно не даётся */
  prompt: string;
  lapses: number;
  /** Коробка 1–6: чем ниже, тем хуже держится */
  box: number;
}

export interface WeakSpot {
  noteId: string | null;
  title: string;
  type?: string;
  cards: WeakCard[];
  /** Сумма забываний по заметке — по ней и сортируем */
  lapses: number;
}

/** Карточку считаем проблемной, начиная с этого числа забываний */
const MIN_LAPSES = 2;

export interface WeakSpotsInput {
  notes: ArcheNote[];
  graph: KnowledgeGraph;
  cards: Record<string, CardState>;
}

export function findWeakSpots({ notes, graph, cards }: WeakSpotsInput): WeakSpot[] {
  const deck = buildDeck(notes, graph);
  const authored = buildAuthoredIndex(notes);

  /** Заметка и формулировка, к которым относится карточка */
  const describe = (cardId: string): { noteId: string | null; prompt: string } | null => {
    const flashcard: Flashcard | undefined = deck.get(cardId);
    if (flashcard) return { noteId: flashcard.noteId, prompt: flashcard.front };

    const question = authored.get(cardId) ?? regenerateQuestion(graph, cardId);
    if (!question) return null;

    // У авторских тестов заметка зашита в самом идентификаторе
    const authoredNote = cardId.startsWith('aq:') ? cardId.split(':')[1] : null;
    return {
      noteId: question.noteId ?? authoredNote,
      prompt: question.prompt.split('\n')[0],
    };
  };

  const byNote = new Map<string, WeakSpot>();

  for (const [cardId, state] of Object.entries(cards)) {
    if (state.lapses < MIN_LAPSES) continue;

    const described = describe(cardId);
    if (!described) continue;

    const key = described.noteId ?? '—';
    const node = described.noteId ? graph.nodeById.get(described.noteId) : undefined;

    const spot =
      byNote.get(key) ??
      ({
        noteId: described.noteId,
        title: node?.title ?? 'Вне заметок',
        type: node?.type,
        cards: [],
        lapses: 0,
      } satisfies WeakSpot);

    spot.cards.push({
      cardId,
      prompt: described.prompt,
      lapses: state.lapses,
      box: state.box,
    });
    spot.lapses += state.lapses;
    byNote.set(key, spot);
  }

  for (const spot of byNote.values()) {
    spot.cards.sort((a, b) => b.lapses - a.lapses);
  }

  return [...byNote.values()].sort(
    (a, b) => b.lapses - a.lapses || b.cards.length - a.cards.length
  );
}
