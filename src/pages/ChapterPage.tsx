import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpenCheck, Circle, Play, RotateCcw } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { useProgressStore, PASS_SCORE } from '@/arche/learning/progressStore';
import { buildCourses } from '@/arche/learning/curriculum';
import { buildChapterQuiz, type QuizQuestion } from '@/arche/learning/quiz';
import { QuizSession, type QuizResult } from '@/components/study/QuizSession';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Phase = 'overview' | 'quiz' | 'result';

export function ChapterPage() {
  const { hubId, chapterIndex } = useParams<{ hubId: string; chapterIndex: string }>();
  const navigate = useNavigate();
  const notes = useArcheStore((s) => s.notes);
  const graph = useArcheStore((s) => s.knowledgeGraph);
  const progress = useProgressStore();

  const courses = useMemo(() => buildCourses(notes), [notes]);
  const course = courses.find((c) => c.hubId === hubId);
  const chapter = course?.chapters.find((ch) => ch.index === Number(chapterIndex));

  const [phase, setPhase] = useState<Phase>('overview');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [results, setResults] = useState<QuizResult[]>([]);

  if (!course || !chapter) {
    return (
      <div className="container mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="mb-4 font-serif text-2xl">Глава не найдена</h1>
        <Button asChild variant="outline">
          <Link to="/study">К списку глав</Link>
        </Button>
      </div>
    );
  }

  const chapterState = progress.chapters[chapter.id];
  const nextChapter = course.chapters.find((ch) => ch.index > chapter.index);

  const startQuiz = () => {
    const built = buildChapterQuiz(graph, chapter.lessons.map((l) => l.noteId), 8);
    setQuestions(built);
    setResults([]);
    setPhase(built.length >= 4 ? 'quiz' : 'overview');
    if (built.length < 4) {
      window.alert('Для теста пока мало связей между заметками этой главы.');
    }
  };

  const openLesson = (noteId: string) => {
    progress.markLessonRead(noteId);
    navigate(`/note/${noteId}`);
  };

  const finishQuiz = (r: QuizResult[]) => {
    setResults(r);
    const score = r.length ? r.filter((x) => x.correct).length / r.length : 0;
    progress.completeQuiz(chapter.id, score);
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
            Все главы
          </Link>
        </Button>

        {phase === 'overview' && (
          <>
            <header className="mb-6">
              {chapter.ordinal && (
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {chapter.ordinal}
                </p>
              )}
              <h1 className="font-serif text-3xl">{chapter.title}</h1>
              {chapter.intro && (
                <p className="mt-2 leading-relaxed text-muted-foreground">{chapter.intro}</p>
              )}
            </header>

            <ol className="space-y-1.5">
              {chapter.lessons.map((lesson, i) => {
                const read = Boolean(progress.lessonsRead[lesson.noteId]);
                return (
                  <li key={lesson.noteId}>
                    <button
                      type="button"
                      onClick={() => openLesson(lesson.noteId)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                        read
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : 'border-border/40 hover:border-primary/50 hover:bg-accent/40'
                      )}
                    >
                      {read ? (
                        <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                      ) : (
                        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
                      )}
                      <span className="min-w-0">
                        <span className="font-serif text-[16px]">
                          {i + 1}. {lesson.title}
                        </span>
                        {lesson.hook && (
                          <span className="mt-0.5 block text-sm text-muted-foreground">
                            {lesson.hook}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="mt-8 rounded-lg border border-border/40 bg-card/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Тест по главе</p>
                  <p className="text-sm text-muted-foreground">
                    Вопросы собираются из связей между этими заметками. Проходной балл —{' '}
                    {Math.round(PASS_SCORE * 100)}%.
                    {chapterState && chapterState.attempts > 0 && (
                      <> Лучший результат: {Math.round(chapterState.bestScore * 100)}%.</>
                    )}
                  </p>
                </div>
                <Button onClick={startQuiz} data-start-quiz>
                  <Play className="mr-2 h-4 w-4" aria-hidden />
                  {chapterState?.attempts ? 'Пройти ещё раз' : 'Начать тест'}
                </Button>
              </div>
            </div>
          </>
        )}

        {phase === 'quiz' && (
          <QuizSession
            questions={questions}
            onAnswer={(q, correct) => progress.recordAnswer(q.cardId, correct)}
            onFinish={finishQuiz}
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
                ? 'Глава пройдена. Вопросы ушли в интервальное повторение.'
                : `Нужно ${Math.round(PASS_SCORE * 100)}% — перечитайте уроки и попробуйте ещё раз.`}
            </p>

            {results.some((r) => !r.correct) && (
              <div className="space-y-3 text-left">
                <h2 className="text-sm uppercase tracking-wider text-muted-foreground">
                  Стоит перечитать
                </h2>
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
              <Button variant="outline" onClick={startQuiz}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                Ещё раз
              </Button>
              {passed && nextChapter ? (
                <Button asChild>
                  <Link to={`/study/${course.hubId}/${nextChapter.index}`} onClick={() => setPhase('overview')}>
                    Следующая глава
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/study">К списку глав</Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
