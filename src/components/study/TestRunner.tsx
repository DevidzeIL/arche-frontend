import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, RotateCcw } from 'lucide-react';
import { useProgressStore, PASS_SCORE } from '@/arche/learning/progressStore';
import type { QuizQuestion } from '@/arche/learning/quiz';
import { QuizSession, type QuizResult } from '@/components/study/QuizSession';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TestRunnerProps {
  title: string;
  description?: string;
  /** Ключ в прогрессе: exam:{hubId} или quiz:{noteId} */
  progressId: string;
  /** Пересобирает вопросы на каждую попытку */
  buildQuestions: () => QuizQuestion[];
  questionCount: number;
}

/**
 * Общий каркас для экзаменов и авторских тестов:
 * старт → сессия → результат с разбором ошибок.
 */
export function TestRunner({
  title,
  description,
  progressId,
  buildQuestions,
  questionCount,
}: TestRunnerProps) {
  const progress = useProgressStore();
  const [phase, setPhase] = useState<'start' | 'run' | 'result'>('start');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [results, setResults] = useState<QuizResult[]>([]);

  const state = progress.chapters[progressId];

  const start = () => {
    const built = buildQuestions();
    if (built.length < 3) {
      window.alert('В этом тесте пока слишком мало вопросов.');
      return;
    }
    setQuestions(built);
    setResults([]);
    setPhase('run');
  };

  const finish = (r: QuizResult[]) => {
    setResults(r);
    const score = r.length ? r.filter((x) => x.correct).length / r.length : 0;
    progress.completeQuiz(progressId, score);
    setPhase('result');
  };

  const score = results.length ? results.filter((r) => r.correct).length / results.length : 0;
  const passed = score >= PASS_SCORE;

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="container mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Button variant="ghost" size="sm" className="-ml-2 mb-6" asChild>
          <Link to="/study">
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            Учёба
          </Link>
        </Button>

        {phase === 'start' && (
          <div className="mx-auto max-w-xl space-y-5 py-8 text-center">
            <h1 className="font-serif text-3xl">{title}</h1>
            {description && <p className="leading-relaxed text-muted-foreground">{description}</p>}
            <p className="text-sm text-muted-foreground">
              {questionCount} вопросов · проходной балл {Math.round(PASS_SCORE * 100)}%
              {state && state.attempts > 0 && (
                <>
                  {' '}
                  · лучший результат {Math.round(state.bestScore * 100)}%
                </>
              )}
            </p>
            <Button size="lg" onClick={start} data-start-quiz>
              <Play className="mr-2 h-4 w-4" aria-hidden />
              Начать
            </Button>
          </div>
        )}

        {phase === 'run' && (
          <QuizSession
            questions={questions}
            onAnswer={(q, correct) => progress.recordAnswer(q.cardId, correct)}
            onFinish={finish}
          />
        )}

        {phase === 'result' && (
          <div className="mx-auto max-w-xl space-y-6 text-center">
            <p className="font-serif text-6xl">{Math.round(score * 100)}%</p>
            <p
              className={cn(
                'text-lg',
                passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
              )}
            >
              {passed
                ? 'Сдано. Вопросы ушли в интервальное повторение.'
                : 'Пока не сдано — ошибки ниже, они вернутся в повторении.'}
            </p>

            {results.some((r) => !r.correct) && (
              <div className="space-y-3 text-left">
                <h2 className="text-sm uppercase tracking-wider text-muted-foreground">Ошибки</h2>
                {results
                  .filter((r) => !r.correct)
                  .map((r) => {
                    const correct = r.question.options.find((o) => o.id === r.question.correctId);
                    return (
                      <div
                        key={r.question.cardId}
                        className="rounded-lg border border-border/40 p-3 text-sm"
                      >
                        <p className="whitespace-pre-line">{r.question.prompt}</p>
                        <p className="mt-1 text-emerald-600 dark:text-emerald-400">
                          Верно: {correct?.label}
                        </p>
                        {r.question.explanation && (
                          <p className="mt-1 text-muted-foreground">{r.question.explanation}</p>
                        )}
                        {r.question.noteId && (
                          <Link
                            to={`/note/${r.question.noteId}`}
                            className="mt-1 inline-block text-primary hover:underline"
                          >
                            Открыть заметку
                          </Link>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={start}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                Ещё раз
              </Button>
              <Button asChild>
                <Link to="/study">К учёбе</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
