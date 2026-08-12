import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  Download,
  Flame,
  Pencil,
  RotateCcw,
  Trophy,
  Upload,
} from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import {
  useProgressStore,
  answeredToday,
  levelFromXp,
  levelFloor,
  levelCeil,
  PASS_SCORE,
} from '@/arche/learning/progressStore';
import { buildCourses } from '@/arche/learning/curriculum';
import { listAuthoredQuizzes } from '@/arche/learning/authoredQuiz';
import { findWeakSpots } from '@/arche/learning/weakSpots';
import { firstImageOf } from '@/arche/images';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { plural } from '@/lib/plural';

export function StudyPage() {
  const notes = useArcheStore((s) => s.notes);
  const graph = useArcheStore((s) => s.knowledgeGraph);
  const progress = useProgressStore();

  const courses = useMemo(() => buildCourses(notes), [notes]);
  const quizzes = useMemo(() => listAuthoredQuizzes(notes), [notes]);
  const weakSpots = useMemo(
    () => findWeakSpots({ notes, graph, cards: progress.cards }),
    [notes, graph, progress.cards]
  );

  const doneToday = answeredToday(progress.history);
  const level = levelFromXp(progress.xp);
  const floor = levelFloor(level);
  const ceil = levelCeil(level);
  const levelPct = Math.min(100, Math.round(((progress.xp - floor) / (ceil - floor)) * 100));

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(progress.name);
  const fileRef = useRef<HTMLInputElement>(null);

  const completedChapters = Object.values(progress.chapters).filter((c) => c.completedAt).length;
  const allChapters = courses.reduce((sum, c) => sum + c.chapters.length, 0);

  const achievements = [
    { id: 'start', label: 'Первый ответ', done: progress.totals.answered > 0 },
    { id: 'chapter', label: 'Глава пройдена', done: completedChapters > 0 },
    { id: 'streak3', label: '3 дня подряд', done: progress.streak >= 3 },
    { id: 'streak7', label: '7 дней подряд', done: progress.streak >= 7 },
    { id: 'correct50', label: '50 верных', done: progress.totals.correct >= 50 },
    { id: 'course', label: 'Курс целиком', done: allChapters > 0 && completedChapters >= allChapters },
  ];

  const exportProgress = () => {
    const blob = new Blob([progress.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'arche-progress.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importProgress = async (file: File) => {
    const ok = progress.importData(await file.text());
    if (!ok) window.alert('Файл не похож на экспорт прогресса Arche.');
  };

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="container mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Профиль */}
        <header className="mb-8 rounded-xl border border-border/40 bg-card/60 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              {editingName ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    progress.rename(nameDraft);
                    setEditingName(false);
                  }}
                >
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    autoFocus
                    className="rounded-md border border-border bg-background px-2 py-1 font-serif text-2xl"
                    aria-label="Имя профиля"
                  />
                  <Button size="sm" type="submit">
                    Ок
                  </Button>
                </form>
              ) : (
                <h1 className="flex items-center gap-2 font-serif text-3xl">
                  {progress.name}
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(progress.name);
                      setEditingName(true);
                    }}
                    aria-label="Переименовать профиль"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                </h1>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                Уровень {level} · {progress.xp} XP
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-lg" title="Дней подряд">
                <Flame
                  className={cn('h-5 w-5', progress.streak > 0 ? 'text-orange-500' : 'text-muted-foreground/40')}
                  aria-hidden
                />
                <span className="font-medium">{progress.streak}</span>
              </div>
              <Button asChild>
                <Link to="/study/today">
                  <Flame className="mr-2 h-4 w-4" aria-hidden />
                  Сегодня{doneToday > 0 && ` · ${doneToday} карточек`}
                </Link>
              </Button>
            </div>
          </div>

          {/* Полоса уровня */}
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-border/40">
              <div className="h-full bg-primary transition-all" style={{ width: `${levelPct}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              До уровня {level + 1}: {ceil - progress.xp} XP
            </p>
          </div>

          {/* Достижения */}
          <div className="mt-4 flex flex-wrap gap-2">
            {achievements.map((a) => (
              <span
                key={a.id}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                  a.done
                    ? 'border-amber-500/50 text-amber-600 dark:text-amber-400'
                    : 'border-border/40 text-muted-foreground/50'
                )}
                title={a.done ? 'Получено' : 'Ещё не получено'}
              >
                <Trophy className="h-3 w-3" aria-hidden />
                {a.label}
              </span>
            ))}
          </div>
        </header>

        {/* Курсы */}
        {courses.length === 0 ? (
          <p className="text-muted-foreground">
            Пока нет ни одного курса. Курс появляется из хаба: добавьте в vault заметку типа hub
            с разделами-осями.
          </p>
        ) : (
          courses.map((course) => {
            const cover = firstImageOf(course.hub.body);
            return (
              <section key={course.hubId} className="mb-10">
                <div className="mb-4 flex items-center gap-4">
                  {cover && (
                    <img src={cover} alt="" className="h-14 w-14 rounded-lg object-cover" />
                  )}
                  <div>
                    <h2 className="font-serif text-2xl">{course.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {course.chapters.length} глав ·{' '}
                      {course.chapters.filter((ch) => progress.chapters[ch.id]?.completedAt).length}{' '}
                      пройдено
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {course.chapters.map((chapter) => {
                    const readCount = chapter.lessons.filter(
                      (l) => progress.lessonsRead[l.noteId]
                    ).length;
                    const chProgress = progress.chapters[chapter.id];
                    const completed = Boolean(chProgress?.completedAt);

                    return (
                      <Link
                        key={chapter.id}
                        to={`/study/${course.hubId}/${chapter.index}`}
                        className={cn(
                          'group rounded-lg border p-4 transition-colors',
                          completed
                            ? 'border-emerald-500/40 bg-emerald-500/5'
                            : 'border-border/40 bg-card/50 hover:border-primary/50'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {chapter.ordinal && (
                              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                {chapter.ordinal}
                              </p>
                            )}
                            <h3 className="font-serif text-lg leading-snug group-hover:underline">
                              {chapter.title}
                            </h3>
                          </div>
                          {completed && (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
                          )}
                        </div>

                        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <BookOpen className="h-3.5 w-3.5" aria-hidden />
                            {readCount}/{chapter.lessons.length}
                          </span>
                          {chProgress && chProgress.attempts > 0 && (
                            <span
                              className={cn(
                                chProgress.bestScore >= PASS_SCORE && 'text-emerald-600 dark:text-emerald-400'
                              )}
                            >
                              тест: {Math.round(chProgress.bestScore * 100)}%
                            </span>
                          )}
                        </div>

                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/40">
                          <div
                            className="h-full bg-primary/70"
                            style={{ width: `${(readCount / chapter.lessons.length) * 100}%` }}
                          />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}

        {/* Что не запоминается: данные копились в карточках и не показывались */}
        {weakSpots.length > 0 && (
          <section className="mb-10">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl">Что даётся тяжело</h2>
                <p className="text-sm text-muted-foreground">
                  Темы, которые чаще всего забываются. Перечитайте — или прогоните
                  отдельной стопкой.
                </p>
              </div>
              <Button asChild size="sm">
                <Link to="/study/today?repeat=weak">
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Повторить это
                </Link>
              </Button>
            </div>

            <ul className="space-y-2">
              {weakSpots.slice(0, 6).map((spot) => (
                <li
                  key={spot.noteId ?? spot.title}
                  className="rounded-lg border border-border/40 bg-card/40 p-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    {spot.noteId ? (
                      <Link
                        to={`/note/${spot.noteId}`}
                        className="min-w-0 truncate font-serif text-[15px] hover:underline"
                      >
                        {spot.title}
                      </Link>
                    ) : (
                      <span className="font-serif text-[15px]">{spot.title}</span>
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      забыто {spot.lapses} {plural(spot.lapses, 'раз', 'раза', 'раз')}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {spot.cards.slice(0, 2).map((card) => (
                      <li key={card.cardId} className="truncate text-[13px] text-muted-foreground">
                        {card.prompt}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Тесты и экзамены */}
        {(quizzes.length > 0 || courses.length > 0) && (
          <section className="mb-10">
            <h2 className="mb-4 font-serif text-2xl">Тесты и экзамены</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {courses.map((course) => {
                const state = progress.chapters[`exam:${course.hubId}`];
                const passed = Boolean(state?.completedAt);
                return (
                  <Link
                    key={`exam-${course.hubId}`}
                    to={`/study/${course.hubId}/exam`}
                    className={cn(
                      'group rounded-lg border p-4 transition-colors',
                      passed
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-amber-500/40 bg-amber-500/5 hover:border-amber-500/70'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-serif text-lg leading-snug group-hover:underline">
                        Экзамен: {course.title}
                      </h3>
                      {passed && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      20 вопросов со всех глав
                      {state && state.attempts > 0 && <> · лучший: {Math.round(state.bestScore * 100)}%</>}
                    </p>
                  </Link>
                );
              })}

              {quizzes.map((quiz) => {
                const state = progress.chapters[`quiz:${quiz.noteId}`];
                const passed = Boolean(state?.completedAt);
                return (
                  <Link
                    key={quiz.noteId}
                    to={`/study/quiz/${quiz.noteId}`}
                    className={cn(
                      'group rounded-lg border p-4 transition-colors',
                      passed
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-border/40 bg-card/50 hover:border-primary/50'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-serif text-lg leading-snug group-hover:underline">
                        {quiz.title}
                      </h3>
                      {passed && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {quiz.questions.length} вопросов
                      {state && state.attempts > 0 && <> · лучший: {Math.round(state.bestScore * 100)}%</>}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Данные: перенос между устройствами, пока аккаунт локальный */}
        <footer className="mt-4 border-t border-border/30 pt-4">
          <p className="mb-2 text-xs text-muted-foreground">
            Прогресс хранится в этом браузере. Для переноса на другое устройство — экспорт и импорт
            файла.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportProgress}>
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Экспорт
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Импорт
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importProgress(file);
                e.target.value = '';
              }}
            />
          </div>
        </footer>
      </div>
    </div>
  );
}
