/**
 * Интервальное повторение: упрощённая система Лейтнера.
 *
 * Карточка живёт в «коробке» 1–6. Правильный ответ двигает её выше —
 * интервал до следующего показа растёт; ошибка сбрасывает в первую
 * коробку, и карточка возвращается в сегодняшнее повторение.
 *
 * У тестов ответ бинарный (попал в вариант или нет), у карточек на
 * запоминание — самооценка из четырёх градаций. Обе формы приходят
 * в reviewCard: boolean разворачивается в 'good' / 'again'.
 */

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

export interface CardState {
  box: number;
  dueAt: string;
  reps: number;
  lapses: number;
}

/** Интервалы по коробкам, в днях. Индекс 0 не используется. */
export const BOX_INTERVALS_DAYS = [0, 1, 3, 7, 14, 30, 60];

const MAX_BOX = BOX_INTERVALS_DAYS.length - 1;
const DAY_MS = 24 * 60 * 60 * 1000;

export const GRADE_META: Record<ReviewGrade, { label: string; hint: string; correct: boolean }> = {
  again: { label: 'Не помню', hint: 'вернётся сегодня же', correct: false },
  hard: { label: 'С трудом', hint: 'интервал не растёт', correct: true },
  good: { label: 'Помню', hint: 'следующая коробка', correct: true },
  easy: { label: 'Легко', hint: 'сразу через одну', correct: true },
};

function nextBox(prevBox: number, grade: ReviewGrade): number {
  switch (grade) {
    case 'again':
      return 1;
    // «С трудом» не роняет карточку в начало, но и не двигает вперёд:
    // повторить через тот же интервал, что и в прошлый раз
    case 'hard':
      return Math.max(1, prevBox);
    case 'good':
      return Math.min(prevBox + 1, MAX_BOX);
    case 'easy':
      return Math.min(prevBox + 2, MAX_BOX);
  }
}

export function toGrade(result: boolean | ReviewGrade): ReviewGrade {
  if (typeof result !== 'boolean') return result;
  return result ? 'good' : 'again';
}

export function reviewCard(
  prev: CardState | undefined,
  result: boolean | ReviewGrade,
  now = new Date()
): CardState {
  const grade = toGrade(result);
  const box = nextBox(prev?.box ?? 0, grade);
  const days = grade === 'again' ? 0 : BOX_INTERVALS_DAYS[box];

  return {
    box,
    dueAt: new Date(now.getTime() + days * DAY_MS).toISOString(),
    reps: (prev?.reps ?? 0) + 1,
    lapses: (prev?.lapses ?? 0) + (grade === 'again' ? 1 : 0),
  };
}

export function isDue(card: CardState, now = new Date()): boolean {
  return new Date(card.dueAt).getTime() <= now.getTime();
}

/** Сколько дней осталось до показа; 0 — сегодня или уже просрочена */
export function daysUntilDue(card: CardState, now = new Date()): number {
  const diff = new Date(card.dueAt).getTime() - now.getTime();
  return diff <= 0 ? 0 : Math.ceil(diff / DAY_MS);
}
