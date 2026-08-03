import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Layers } from 'lucide-react';
import { authoredCardsOf } from '@/arche/learning/flashcards';
import { useProgressStore } from '@/arche/learning/progressStore';
import { daysUntilDue } from '@/arche/learning/srs';
import type { ArcheNote } from '@/arche/types';

interface NoteFlashcardsProps {
  note: ArcheNote;
}

/**
 * Карточки, написанные в самой заметке (раздел «## Карточки»).
 *
 * Показываются закрытыми: смысл карточки в том, чтобы вспомнить, а не
 * прочитать. Здесь это скорее памятка «что из заметки нужно унести» —
 * полноценная тренировка живёт на странице «Сегодня».
 */
export function NoteFlashcards({ note }: NoteFlashcardsProps) {
  const cards = useMemo(() => authoredCardsOf(note), [note]);
  const states = useProgressStore((s) => s.cards);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  if (cards.length === 0) return null;

  const reveal = (cardId: string) => setRevealed((r) => new Set(r).add(cardId));

  return (
    <section className="space-y-4 border-t border-border/30 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl text-foreground/90">Что запомнить</h2>
        <Link
          to="/study/today"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Layers className="h-3.5 w-3.5" aria-hidden />
          Тренировать
        </Link>
      </div>

      <ul className="space-y-2">
        {cards.map((card) => {
          const open = revealed.has(card.cardId);
          const state = states[card.cardId];
          const wait = state ? daysUntilDue(state) : null;

          return (
            <li key={card.cardId} className="rounded-lg border border-border/40 bg-card/40 p-4">
              <p className="font-medium leading-snug">{card.front}</p>

              {open ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.back}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => reveal(card.cardId)}
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                  Показать ответ
                </button>
              )}

              {state && (
                <p className="mt-2 text-xs text-muted-foreground/70">
                  {wait === 0 ? 'ждёт повторения сегодня' : `следующее повторение через ${wait} дн.`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
