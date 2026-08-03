import { useRef, useState } from 'react';
import { FlashcardView } from './FlashcardView';
import { QuizQuestionView } from './QuizQuestionView';
import type { DailyItem } from '@/arche/learning/daily';
import { toGrade, type ReviewGrade } from '@/arche/learning/srs';

export interface DailyMiss {
  cardId: string;
  noteId?: string;
  prompt: string;
}

export interface DailySessionStats {
  answered: number;
  remembered: number;
  missed: DailyMiss[];
}

interface DailySessionProps {
  items: DailyItem[];
  /** Сразу после ответа: начисляет XP и двигает интервал */
  onAnswer: (cardId: string, result: boolean | ReviewGrade) => void;
  onFinish: (stats: DailySessionStats) => void;
}

function promptOf(item: DailyItem): string {
  return item.kind === 'card' ? item.card.front : item.question.prompt;
}

function noteIdOf(item: DailyItem): string | undefined {
  return item.kind === 'card' ? item.card.noteId : item.question.noteId;
}

const emptyStats: DailySessionStats = { answered: 0, remembered: 0, missed: [] };

/**
 * Сессия дня: карточки на воспоминание и вопросы теста вперемешку.
 *
 * Забытое возвращается в конец очереди того же захода — по Лейтнеру
 * ошибка сбрасывает карточку в первую коробку, и откладывать её
 * на завтра значит закончить день на том, чего не помнишь.
 * Повторно карточка возвращается только один раз, иначе очередь
 * не закончится никогда.
 */
export function DailySession({ items, onAnswer, onFinish }: DailySessionProps) {
  const [queue, setQueue] = useState<DailyItem[]>(items);
  const [index, setIndex] = useState(0);

  // Счётчики держим в ref: они читаются в момент завершения сессии,
  // а не при отрисовке, и лишний рендер на каждый ответ здесь не нужен
  const stats = useRef<DailySessionStats>(emptyStats);
  const requeued = useRef<Set<string>>(new Set());
  const [remembered, setRemembered] = useState(0);

  const item = queue[index];
  if (!item) return null;

  /** Ответ засчитан: XP, интервал, статистика. Очередь пока не двигается. */
  const record = (current: DailyItem, result: boolean | ReviewGrade) => {
    const failed = toGrade(result) === 'again';
    onAnswer(current.cardId, result);

    const missed = stats.current.missed.filter((m) => m.cardId !== current.cardId);
    stats.current = {
      answered: stats.current.answered + 1,
      remembered: stats.current.remembered + (failed ? 0 : 1),
      missed: failed
        ? [...missed, { cardId: current.cardId, noteId: noteIdOf(current), prompt: promptOf(current) }]
        : missed,
    };
    if (!failed) setRemembered(stats.current.remembered);
  };

  /** Шаг очереди: забытое возвращается в конец, иначе идём дальше */
  const advance = (current: DailyItem, failed: boolean) => {
    if (failed && !requeued.current.has(current.cardId)) {
      requeued.current.add(current.cardId);
      setQueue((q) => [...q, { ...current, isNew: false }]);
      setIndex((i) => i + 1);
      return;
    }
    if (index + 1 >= queue.length) {
      onFinish(stats.current);
      return;
    }
    setIndex((i) => i + 1);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {index + 1} из {queue.length}
        </span>
        <span>{remembered} помню</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-border/40">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${(index / queue.length) * 100}%` }}
        />
      </div>

      {item.kind === 'card' ? (
        <FlashcardView
          key={`${item.cardId}-${index}`}
          card={item.card}
          isNew={item.isNew}
          onGrade={(grade) => {
            record(item, grade);
            advance(item, grade === 'again');
          }}
        />
      ) : (
        <QuizItem
          key={`${item.cardId}-${index}`}
          item={item}
          isLast={index + 1 >= queue.length}
          onRecord={record}
          onAdvance={advance}
        />
      )}
    </div>
  );
}

/**
 * У вопроса с вариантами ответ и переход разнесены во времени:
 * сначала выбор (его надо засчитать сразу), потом чтение объяснения
 * и кнопка «Дальше». Результат до перехода живёт здесь.
 */
function QuizItem({
  item,
  isLast,
  onRecord,
  onAdvance,
}: {
  item: Extract<DailyItem, { kind: 'quiz' }>;
  isLast: boolean;
  onRecord: (item: DailyItem, result: boolean) => void;
  onAdvance: (item: DailyItem, failed: boolean) => void;
}) {
  const correct = useRef(true);

  return (
    <QuizQuestionView
      question={item.question}
      nextLabel={isLast ? 'Завершить' : 'Дальше'}
      onAnswer={(wasCorrect) => {
        correct.current = wasCorrect;
        onRecord(item, wasCorrect);
      }}
      onNext={() => onAdvance(item, !correct.current)}
    />
  );
}
