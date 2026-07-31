/**
 * Интервальное повторение: упрощённая система Лейтнера.
 *
 * Карточка живёт в «коробке» 1–6. Правильный ответ двигает её выше —
 * интервал до следующего показа растёт; ошибка сбрасывает в первую
 * коробку, и карточка возвращается в сегодняшнее повторение.
 */

export interface CardState {
  box: number;
  dueAt: string;
  reps: number;
  lapses: number;
}

/** Интервалы по коробкам, в днях. Индекс 0 не используется. */
export const BOX_INTERVALS_DAYS = [0, 1, 3, 7, 14, 30, 60];

const DAY_MS = 24 * 60 * 60 * 1000;

export function reviewCard(prev: CardState | undefined, correct: boolean, now = new Date()): CardState {
  const box = correct ? Math.min((prev?.box ?? 0) + 1, BOX_INTERVALS_DAYS.length - 1) : 1;
  const dueAt = correct ? new Date(now.getTime() + BOX_INTERVALS_DAYS[box] * DAY_MS) : now;

  return {
    box,
    dueAt: dueAt.toISOString(),
    reps: (prev?.reps ?? 0) + 1,
    lapses: (prev?.lapses ?? 0) + (correct ? 0 : 1),
  };
}

export function isDue(card: CardState, now = new Date()): boolean {
  return new Date(card.dueAt).getTime() <= now.getTime();
}
