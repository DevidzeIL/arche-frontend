import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  Flame,
  GraduationCap,
  Layers,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import {
  useProgressStore,
  answeredToday,
  levelFromXp,
  DAILY_GOAL_CHOICES,
} from '@/arche/learning/progressStore';
import {
  buildDailyPlan,
  itemsForCards,
  newPerDay,
  nextDueDate,
  type DailyItem,
} from '@/arche/learning/daily';
import { findWeakSpots } from '@/arche/learning/weakSpots';
import { DailySession, type DailySessionStats } from '@/components/study/DailySession';
import { ActivityCalendar } from '@/components/study/ActivityCalendar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { plural } from '@/lib/plural';

type Phase = 'idle' | 'session' | 'done';

/** Сколько карточек добавляет кнопка «ещё» после выполненной нормы */
const EXTRA_SIZE = 10;

/**
 * Главный экран ежедневной привычки.
 *
 * Одна цель: зайти, увидеть маленькую понятную норму и закрыть её
 * за несколько минут. Поэтому здесь нет ни списка курсов, ни выбора —
 * есть сегодняшняя стопка, заметка дня и цепочка дней, которую жалко
 * прервать. Всё остальное живёт на странице «Учёба».
 */
export function TodayPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const notes = useArcheStore((s) => s.notes);
  const graph = useArcheStore((s) => s.knowledgeGraph);

  const history = useProgressStore((s) => s.history);
  const cards = useProgressStore((s) => s.cards);
  const streak = useProgressStore((s) => s.streak);
  const bestStreak = useProgressStore((s) => s.bestStreak);
  const xp = useProgressStore((s) => s.xp);
  const dailyGoal = useProgressStore((s) => s.dailyGoal);
  const setDailyGoal = useProgressStore((s) => s.setDailyGoal);
  const recordAnswer = useProgressStore((s) => s.recordAnswer);
  const markLessonRead = useProgressStore((s) => s.markLessonRead);
  const pruneCards = useProgressStore((s) => s.pruneCards);

  const [phase, setPhase] = useState<Phase>('idle');
  const [sessionItems, setSessionItems] = useState<DailyItem[]>([]);
  const [result, setResult] = useState<DailySessionStats | null>(null);
  // План пересобирается только по этому ключу: он зависит от карточек,
  // а те меняются на каждый ответ — иначе стопка тасовалась бы под руками
  const [planKey, setPlanKey] = useState(0);

  const doneToday = answeredToday(history);
  const remaining = Math.max(0, dailyGoal - doneToday);

  const plan = useMemo(() => {
    const state = useProgressStore.getState();
    return buildDailyPlan({
      notes,
      graph,
      cards: state.cards,
      lessonsRead: state.lessonsRead,
      goal: Math.max(0, state.dailyGoal - answeredToday(state.history)),
      newLimit: Math.max(0, newPerDay(state.dailyGoal) - answeredToday(state.newHistory)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, graph, dailyGoal, planKey]);

  // Карточки, чьи сущности исчезли из vault'а, вычищаем
  useEffect(() => {
    if (plan.dead.length) pruneCards(plan.dead);
  }, [plan.dead, pruneCards]);

  const nextDue = useMemo(() => nextDueDate(cards), [cards]);

  /** size задаётся только для добавки сверх нормы — там новое не ограничиваем */
  const startSession = (size?: number) => {
    const state = useProgressStore.getState();
    const built = buildDailyPlan({
      notes,
      graph,
      cards: state.cards,
      lessonsRead: state.lessonsRead,
      goal: size ?? Math.max(1, remaining),
      newLimit:
        size ?? Math.max(0, newPerDay(state.dailyGoal) - answeredToday(state.newHistory)),
    });
    if (built.items.length === 0) return;
    setSessionItems(built.items);
    setResult(null);
    setPhase('session');
  };

  const finishSession = (stats: DailySessionStats) => {
    setResult(stats);
    setPhase('done');
    setPlanKey((k) => k + 1);
  };

  // Стопка «повторить именно то, что не запоминается» приходит ссылкой
  // с «Учёбы». Параметр съедаем сразу, иначе обновление страницы
  // запускало бы ту же сессию заново
  useEffect(() => {
    if (searchParams.get('repeat') !== 'weak') return;
    setSearchParams({}, { replace: true });

    const state = useProgressStore.getState();
    const weak = findWeakSpots({ notes, graph, cards: state.cards })
      .flatMap((spot) => spot.cards.map((card) => card.cardId))
      .slice(0, 20);

    const built = itemsForCards(weak, notes, graph);
    if (built.length === 0) return;
    setSessionItems(built);
    setResult(null);
    setPhase('session');
  }, [searchParams, setSearchParams, notes, graph]);

  const openLesson = (noteId: string) => {
    markLessonRead(noteId);
    navigate(`/note/${noteId}`);
  };

  // Норма дня — это сегодняшняя стопка, а не круглое число: пока материала
  // мало, цель в 15 карточек недостижима, и шкала бы никогда не закрывалась
  const todayTarget = Math.max(1, doneToday + plan.items.length);
  const goalMet = plan.items.length === 0;
  const goalPct = goalMet ? 100 : Math.round((doneToday / todayTarget) * 100);

  if (phase === 'session') {
    return (
      <div className="h-full w-full overflow-y-auto">
        <div className="container mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
          <DailySession
            items={sessionItems}
            onAnswer={recordAnswer}
            onFinish={finishSession}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="container mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Норма дня */}
        <header className="mb-6 rounded-xl border border-border/40 bg-card/60 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {new Date().toLocaleDateString('ru-RU', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
              <h1 className="mt-1 font-serif text-3xl">Сегодня</h1>
            </div>

            <div className="flex items-center gap-4">
              <div
                className="flex items-center gap-1.5"
                title={bestStreak > 0 ? `Лучшая серия: ${bestStreak}` : 'Дней подряд'}
              >
                <Flame
                  className={cn(
                    'h-5 w-5',
                    streak > 0 ? 'text-orange-500' : 'text-muted-foreground/40'
                  )}
                  aria-hidden
                />
                <span className="text-lg font-medium">{streak}</span>
                <span className="text-sm text-muted-foreground">
                  {plural(streak, 'день', 'дня', 'дней')} подряд
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className={cn(goalMet && 'text-emerald-600 dark:text-emerald-400')}>
                {goalMet
                  ? `Норма закрыта${doneToday ? ` · ${doneToday} карточек` : ''}`
                  : `${doneToday} из ${todayTarget} карточек`}
              </span>
              <span className="text-muted-foreground">Уровень {levelFromXp(xp)} · {xp} XP</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border/40">
              <div
                className={cn(
                  'h-full transition-all duration-500',
                  goalMet ? 'bg-emerald-500' : 'bg-primary'
                )}
                style={{ width: `${goalPct}%` }}
              />
            </div>
          </div>

          {/* Итог только что законченной сессии */}
          {phase === 'done' && result && (
            <div className="mt-5 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
                {result.remembered} из {result.answered} вспомнили
              </p>
              {result.missed.length > 0 && (
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <p>Вернётся завтра:</p>
                  <ul className="space-y-0.5">
                    {result.missed.slice(0, 5).map((m) => (
                      <li key={m.cardId} className="truncate">
                        {m.noteId ? (
                          <Link to={`/note/${m.noteId}`} className="hover:text-foreground hover:underline">
                            {m.prompt}
                          </Link>
                        ) : (
                          m.prompt
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Кнопка занятия */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {plan.items.length > 0 ? (
              <Button size="lg" onClick={() => startSession()} data-start-daily>
                <Play className="mr-2 h-4 w-4" aria-hidden />
                {phase === 'done' ? 'Продолжить' : 'Заниматься'}
                <span className="ml-2 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs">
                  {plan.items.length}
                </span>
              </Button>
            ) : (
              <Button size="lg" variant="outline" onClick={() => startSession(EXTRA_SIZE)}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                Ещё {EXTRA_SIZE} карточек
              </Button>
            )}

            <p className="text-sm text-muted-foreground">
              {plan.items.length > 0 ? (
                <>
                  {plan.dueCount > 0 && <>{plan.dueCount} на повторение</>}
                  {plan.dueCount > 0 && plan.newCount > 0 && ' · '}
                  {plan.newCount > 0 && <>{plan.newCount} новых</>}
                  {plan.dueTotal > plan.dueCount && (
                    <> · ещё {plan.dueTotal - plan.dueCount} ждут очереди</>
                  )}
                </>
              ) : nextDue ? (
                <>
                  Следующее повторение —{' '}
                  {nextDue.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                </>
              ) : (
                'Карточки появятся, как только вы начнёте'
              )}
            </p>
          </div>
        </header>

        {/* Заметка дня */}
        {plan.lesson && (
          <section className="mb-6 rounded-xl border border-border/40 bg-card/40 p-5">
            <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Заметка дня
              {plan.lesson.chapterTitle && <span className="normal-case">· {plan.lesson.chapterTitle}</span>}
            </p>
            <h2 className="font-serif text-xl">{plan.lesson.title}</h2>
            {plan.lesson.hook && (
              <p className="mt-0.5 text-sm text-muted-foreground">{plan.lesson.hook}</p>
            )}
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {plan.lesson.excerpt}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => openLesson(plan.lesson!.noteId)}>
                <BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Прочитать
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/feed">
                  <Layers className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Или просто полистать
                </Link>
              </Button>
            </div>
          </section>
        )}

        {/* Цепочка дней */}
        <section className="mb-6 rounded-xl border border-border/40 bg-card/40 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
              Последние недели
            </p>
            <p className="text-xs text-muted-foreground">
              Лучшая серия: {Math.max(bestStreak, streak)}
            </p>
          </div>
          <ActivityCalendar history={history} goal={dailyGoal} />
        </section>

        {/* Колода и норма */}
        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/40 p-4">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <Layers className="h-3.5 w-3.5" aria-hidden />
              Колода
            </p>
            <p className="mt-1 font-serif text-2xl">
              {plan.seenSize}
              <span className="text-base text-muted-foreground"> / {plan.deckSize}</span>
            </p>
            <p className="text-xs text-muted-foreground">карточек в работе</p>
          </div>

          <div className="rounded-lg border border-border/40 p-4 sm:col-span-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Норма на день</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAILY_GOAL_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => {
                    setDailyGoal(choice);
                    setPlanKey((k) => k + 1);
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                    choice === dailyGoal
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border/50 text-muted-foreground hover:border-primary/50'
                  )}
                >
                  {choice}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Лучше маленькая норма каждый день, чем большая раз в неделю.
            </p>
          </div>
        </section>

        <Button variant="ghost" asChild className="-ml-2">
          <Link to="/study">
            <GraduationCap className="mr-2 h-4 w-4" aria-hidden />
            Курсы, тесты и экзамены
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}
