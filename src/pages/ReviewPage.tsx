import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Brain, CheckCircle2 } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { useProgressStore } from '@/arche/learning/progressStore';
import { dueCardIds, regenerateQuestion, type QuizQuestion } from '@/arche/learning/quiz';
import { QuizSession, type QuizResult } from '@/components/study/QuizSession';
import { Button } from '@/components/ui/button';

const SESSION_LIMIT = 20;

/**
 * Ежедневное повторение: карточки, у которых подошёл срок.
 * Вопрос пересобирается из графа заново — неверные варианты
 * каждый раз другие, зубрить положение ответа не получится.
 */
export function ReviewPage() {
  const graph = useArcheStore((s) => s.knowledgeGraph);
  const cards = useProgressStore((s) => s.cards);
  const recordAnswer = useProgressStore((s) => s.recordAnswer);
  const pruneCards = useProgressStore((s) => s.pruneCards);

  const [finished, setFinished] = useState<QuizResult[] | null>(null);

  // Сессия фиксируется на входе: recordAnswer двигает dueAt,
  // и пересчёт на лету менял бы список под ногами
  const session = useMemo(() => {
    const due = dueCardIds(graph, cards).slice(0, SESSION_LIMIT);
    const questions: QuizQuestion[] = [];
    const dead: string[] = [];

    for (const cardId of due) {
      const q = regenerateQuestion(graph, cardId);
      if (q) questions.push(q);
      else dead.push(cardId);
    }
    return { questions, dead };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // Карточки, чьи сущности исчезли из vault'а, вычищаем
  useEffect(() => {
    if (session.dead.length) pruneCards(session.dead);
  }, [session.dead, pruneCards]);

  const nextDue = useMemo(() => {
    const dates = Object.values(cards).map((c) => new Date(c.dueAt).getTime());
    if (!dates.length) return null;
    const min = Math.min(...dates);
    return min > Date.now() ? new Date(min) : null;
  }, [cards]);

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="container mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Button variant="ghost" size="sm" className="-ml-2 mb-6" asChild>
          <Link to="/study">
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            Учёба
          </Link>
        </Button>

        {session.questions.length === 0 ? (
          <div className="py-16 text-center">
            <Brain className="mx-auto mb-4 h-10 w-10 text-muted-foreground/40" aria-hidden />
            <h1 className="mb-2 font-serif text-2xl">На сегодня всё повторено</h1>
            <p className="text-muted-foreground">
              {nextDue
                ? `Следующее повторение — ${nextDue.toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                  })}.`
                : 'Пройдите тест по любой главе — вопросы попадут в повторение.'}
            </p>
          </div>
        ) : finished ? (
          <div className="space-y-6 py-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
            <h1 className="font-serif text-2xl">Повторение завершено</h1>
            <p className="text-muted-foreground">
              {finished.filter((r) => r.correct).length} из {finished.length} верно. Ошибочные
              карточки вернутся завтра, верные уехали дальше по интервалам.
            </p>
            <Button asChild>
              <Link to="/study">К учёбе</Link>
            </Button>
          </div>
        ) : (
          <>
            <h1 className="mb-6 font-serif text-2xl">Повторение</h1>
            <QuizSession
              questions={session.questions}
              onAnswer={(q, correct) => recordAnswer(q.cardId, correct)}
              onFinish={setFinished}
            />
          </>
        )}
      </div>
    </div>
  );
}
