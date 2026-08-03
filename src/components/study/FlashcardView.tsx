import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Eye, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Flashcard } from '@/arche/learning/flashcards';
import { GRADE_META, type ReviewGrade } from '@/arche/learning/srs';

interface FlashcardViewProps {
  card: Flashcard;
  /** Впервые встречается — стоит сказать об этом, чтобы «не помню» не пугало */
  isNew?: boolean;
  onGrade: (grade: ReviewGrade) => void;
}

const GRADES: ReviewGrade[] = ['again', 'hard', 'good', 'easy'];

const GRADE_STYLE: Record<ReviewGrade, string> = {
  again: 'border-red-500/50 hover:bg-red-500/10 text-red-600 dark:text-red-400',
  hard: 'border-amber-500/50 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400',
  good: 'border-emerald-500/50 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  easy: 'border-sky-500/50 hover:bg-sky-500/10 text-sky-600 dark:text-sky-400',
};

/**
 * Карточка на воспоминание: вопрос → пауза → ответ → честная самооценка.
 *
 * Пауза здесь — не украшение. Оценка ставится только после того, как
 * ответ уже сформулирован про себя; иначе карточка вырождается
 * в перечитывание, а оно почти ничего не даёт.
 *
 * Состояние сбрасывается через key={card.cardId} снаружи.
 */
export function FlashcardView({ card, isNew, onGrade }: FlashcardViewProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      if (!revealed && (e.code === 'Space' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      if (revealed) {
        const index = Number(e.key) - 1;
        if (index >= 0 && index < GRADES.length) {
          e.preventDefault();
          onGrade(GRADES[index]);
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, onGrade]);

  return (
    <div className="space-y-5">
      <div className="min-h-[220px] rounded-xl border border-border/50 bg-card/60 p-6 sm:p-8">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full border border-border/50 px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {card.tag}
          </span>
          {isNew && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2 py-0.5 text-[11px] uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3" aria-hidden />
              впервые
            </span>
          )}
        </div>

        <p className="font-serif text-xl leading-relaxed sm:text-2xl">{card.front}</p>

        {revealed && (
          <div className="mt-5 border-t border-border/40 pt-5">
            <p className="whitespace-pre-line text-[15px] leading-relaxed">{card.back}</p>

            {card.details && card.details.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {card.details.map((line) => (
                  <li key={line} className="leading-snug">
                    — {line}
                  </li>
                ))}
              </ul>
            )}

            <Link
              to={`/note/${card.noteId}`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Открыть заметку
            </Link>
          </div>
        )}
      </div>

      {revealed ? (
        <div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GRADES.map((grade, i) => (
              <button
                key={grade}
                type="button"
                onClick={() => onGrade(grade)}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                  GRADE_STYLE[grade]
                )}
              >
                <span className="block">{GRADE_META[grade].label}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                  {i + 1} · {GRADE_META[grade].hint}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Оценивайте себя честно — от этого зависит, когда карточка вернётся
          </p>
        </div>
      ) : (
        <div className="text-center">
          <Button onClick={() => setRevealed(true)} size="lg" data-reveal>
            <Eye className="mr-2 h-4 w-4" aria-hidden />
            Показать ответ
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Сначала ответьте про себя. Пробел — показать
          </p>
        </div>
      )}
    </div>
  );
}
