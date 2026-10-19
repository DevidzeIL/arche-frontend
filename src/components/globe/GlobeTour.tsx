import { ArrowLeft, ArrowRight, BookOpen, Check, Crosshair, Eye, EyeOff, MapPin, X } from 'lucide-react';
import { formatYear } from '@/arche/timeSpan';
import type { Tour } from '@/arche/tours';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { plural } from '@/lib/plural';

/** Ближе этого — «попал»: в масштабе Европы это соседний город */
export const QUIZ_HIT_KM = 300;
export const QUIZ_SIZE = 5;

export interface TourQuiz {
  /** Номера шагов, о которых спрашиваем */
  steps: number[];
  index: number;
  /** Ответы: сколько километров мимо */
  answers: number[];
  /** Ответ на текущий вопрос уже дан — показываем, где на самом деле */
  revealed: boolean;
}

/**
 * Карточка маршрута поверх глобуса.
 *
 * Шаг маршрута сам двигает год и поворачивает шар — карточка только
 * говорит, что это и зачем, и даёт открыть заметку. В конце — короткая
 * самопроверка: где это было? Щелчок по карте, и видно, насколько мимо
 */
export function GlobeTour({
  tour,
  step,
  readIds,
  quiz,
  showRest,
  onToggleRest,
  onStep,
  onClose,
  onOpenNote,
  onDetails,
  onStartQuiz,
  onNextQuestion,
}: {
  tour: Tour;
  step: number;
  /** Прочитанные уроки: noteId → когда */
  readIds: Record<string, string>;
  quiz: TourQuiz | null;
  /** Показано ли на карте всё остальное, кроме маршрута */
  showRest: boolean;
  onToggleRest: () => void;
  onStep: (index: number) => void;
  onClose: () => void;
  onOpenNote: (noteId: string) => void;
  /** Открыть справку о том, что выделено */
  onDetails: () => void;
  onStartQuiz: () => void;
  onNextQuestion: () => void;
}) {
  const current = tour.steps[step];
  const last = step === tour.steps.length - 1;
  const placed = tour.steps.filter((s) => s.at && !s.via).length;

  return (
    <div className="pointer-events-auto w-full rounded-xl border border-border/50 bg-card/95 text-sm shadow-sm backdrop-blur-sm sm:w-[380px]">
      <header className="flex items-start gap-2 border-b border-border/40 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">{tour.kind}</p>
          <p className="truncate font-medium">{tour.title}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onToggleRest}
          aria-pressed={showRest}
          aria-label={showRest ? 'Оставить на карте только маршрут' : 'Показать на карте всё остальное'}
          title={showRest ? 'Оставить на карте только маршрут' : 'Показать на карте всё остальное'}
        >
          {showRest ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="-mr-1 h-7 w-7 shrink-0" onClick={onClose} aria-label="Закрыть маршрут">
          <X className="h-4 w-4" />
        </Button>
      </header>

      {quiz ? (
        <QuizBody tour={tour} quiz={quiz} onNext={onNextQuestion} onClose={onClose} />
      ) : (
        <div className="max-h-[38vh] space-y-2 overflow-y-auto px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-serif text-lg leading-tight">{current.title}</h3>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {step + 1} / {tour.steps.length}
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground">
            {current.year !== null && <span className="tabular-nums">{formatYear(current.year)}</span>}
            {current.sub && <> · {current.sub}</>}
            {current.via && <> · место — через «{current.via}»</>}
            {!current.at && <> · места на карте нет</>}
          </p>
          {current.hook && <p className="italic text-foreground/85">{current.hook}</p>}
          {current.text && <p className="leading-relaxed text-foreground/90">{current.text}</p>}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {current.noteId && (
              <Button size="sm" variant="outline" className="h-7" onClick={() => onOpenNote(current.noteId!)}>
                {readIds[current.noteId] ? <Check className="mr-1 h-3.5 w-3.5" aria-hidden /> : <BookOpen className="mr-1 h-3.5 w-3.5" aria-hidden />}
                {readIds[current.noteId] ? 'Прочитано' : 'Читать'}
              </Button>
            )}
            {current.selection && (
              <Button size="sm" variant="ghost" className="h-7" onClick={onDetails}>
                <MapPin className="mr-1 h-3.5 w-3.5" aria-hidden />
                Подробнее
              </Button>
            )}
          </div>
        </div>
      )}

      {!quiz && (
        <footer className="flex items-center gap-1 border-t border-border/40 px-2 py-1.5">
          <Button variant="ghost" size="sm" className="h-7" disabled={step === 0} onClick={() => onStep(step - 1)}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden />
            Назад
          </Button>
          {/* Точки шагов: видно, сколько осталось, и можно перепрыгнуть */}
          <div className="flex min-w-0 flex-1 flex-wrap justify-center gap-1">
            {tour.steps.length <= 24 &&
              tour.steps.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onStep(i)}
                  aria-label={`Шаг ${i + 1}: ${s.title}`}
                  className={cn(
                    'h-1.5 w-1.5 rounded-full transition-colors',
                    i === step ? 'bg-foreground' : s.noteId && readIds[s.noteId] ? 'bg-emerald-500/70' : 'bg-foreground/20 hover:bg-foreground/40'
                  )}
                />
              ))}
          </div>
          {last ? (
            placed >= 3 ? (
              <Button size="sm" className="h-7" onClick={onStartQuiz}>
                <Crosshair className="mr-1 h-3.5 w-3.5" aria-hidden />
                Где это?
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-7" onClick={onClose}>
                Готово
              </Button>
            )
          ) : (
            <Button size="sm" className="h-7" onClick={() => onStep(step + 1)}>
              Далее
              <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
            </Button>
          )}
        </footer>
      )}
    </div>
  );
}

function QuizBody({
  tour,
  quiz,
  onNext,
  onClose,
}: {
  tour: Tour;
  quiz: TourQuiz;
  onNext: () => void;
  onClose: () => void;
}) {
  const done = quiz.index >= quiz.steps.length;
  if (done) {
    const hits = quiz.answers.filter((km) => km <= QUIZ_HIT_KM).length;
    return (
      <div className="space-y-2 px-3 py-3">
        <p className="font-serif text-lg">
          {hits} из {quiz.steps.length}
        </p>
        <p className="text-muted-foreground">
          {hits === quiz.steps.length
            ? 'Всё на своих местах.'
            : `Попадание — ближе ${QUIZ_HIT_KM} км. Мимо — повод пройти маршрут ещё раз.`}
        </p>
        <Button size="sm" variant="outline" className="h-7" onClick={onClose}>
          Закончить
        </Button>
      </div>
    );
  }
  const step = tour.steps[quiz.steps[quiz.index]];
  const km = quiz.revealed ? quiz.answers[quiz.index] : null;
  return (
    <div className="space-y-2 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Вопрос {quiz.index + 1} из {quiz.steps.length}
      </p>
      <p>
        Где на карте: <span className="font-medium">{step.title}</span>
        {step.year !== null && <span className="text-muted-foreground"> ({formatYear(step.year)})</span>}?
      </p>
      {km === null ? (
        <p className="text-[12px] text-muted-foreground">Щёлкните по карте.</p>
      ) : (
        <>
          <p className={cn('font-medium', km <= QUIZ_HIT_KM ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>
            {km <= QUIZ_HIT_KM ? 'Да, здесь' : `Мимо на ${Math.round(km).toLocaleString('ru-RU')} ${plural(Math.round(km), 'километр', 'километра', 'километров')}`}
            {' — '}место отмечено на карте.
          </p>
          <Button size="sm" className="h-7" onClick={onNext}>
            {quiz.index + 1 < quiz.steps.length ? 'Следующий' : 'Итог'}
            <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
          </Button>
        </>
      )}
    </div>
  );
}

export interface TourOption {
  id: string;
  title: string;
  sub: string;
}

/** Список маршрутов: главы курсов и маршруты из базы знаний */
export function GlobeTourMenu({
  groups,
  note,
  onPick,
}: {
  groups: Array<{ title: string; items: TourOption[] }>;
  /** Пояснение внизу: например, что база знаний ещё грузится */
  note?: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="pointer-events-auto max-h-[min(70vh,640px)] w-[min(340px,calc(100vw-24px))] space-y-3 overflow-y-auto rounded-xl border border-border/50 bg-card/95 p-3 text-sm backdrop-blur-sm">
      <p className="text-[12px] leading-snug text-muted-foreground">
        Маршрут ведёт по карте шаг за шагом: год, место и пара строк о том, что здесь было.
      </p>
      {groups
        .filter((g) => g.items.length > 0)
        .map((group) => (
          <section key={group.title} className="space-y-1">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">{group.title}</h3>
            <ul>
              {group.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onPick(item.id)}
                    className="w-full rounded-md px-1.5 py-1 text-left hover:bg-accent/50"
                  >
                    <span className="block leading-tight">{item.title}</span>
                    <span className="block text-[11px] text-muted-foreground">{item.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}
