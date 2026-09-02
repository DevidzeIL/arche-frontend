import { useMemo } from 'react';
import { PenLine } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { useProgressStore, recallsOfNote, type RecallEntry } from '@/arche/learning/progressStore';
import { cardsOfNote } from '@/arche/learning/flashcards';
import { GRADE_META } from '@/arche/learning/srs';
import type { ArcheNote } from '@/arche/types';

interface NoteRecallsProps {
  note: ArcheNote;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Что вы сами писали про эту заметку.
 *
 * Ради этого блока письменный режим и затевался. Заметка показывает,
 * как автор объяснил тему; здесь видно, как её объясняли вы — и, если
 * попыток несколько, как формулировка менялась со временем. Заметка
 * стоит на месте, а этот список растёт: по нему видно движение, которого
 * ни стрик, ни XP не показывают.
 *
 * Если ваша формулировка оказалась точнее авторской — её стоит перенести
 * в заметку. Кнопка правки здесь же, в правом нижнем углу страницы.
 */
export function NoteRecalls({ note }: NoteRecallsProps) {
  const graph = useArcheStore((s) => s.knowledgeGraph);
  const recalls = useProgressStore((s) => s.recalls);

  const entries = useMemo(() => recallsOfNote(recalls, note.id), [recalls, note.id]);

  const questions = useMemo(
    () => new Map(cardsOfNote(note, graph).map((card) => [card.cardId, card.front])),
    [note, graph]
  );

  const grouped = useMemo(() => {
    const byCard = new Map<string, Array<RecallEntry & { cardId: string }>>();
    for (const entry of entries) {
      const list = byCard.get(entry.cardId);
      if (list) list.push(entry);
      else byCard.set(entry.cardId, [entry]);
    }
    return [...byCard.entries()];
  }, [entries]);

  if (grouped.length === 0) return null;

  return (
    <section className="space-y-4 border-t border-border/30 pt-8">
      <div>
        <h2 className="flex items-center gap-2 font-serif text-2xl text-foreground/90">
          <PenLine className="h-4 w-4 text-muted-foreground" aria-hidden />
          Своими словами
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ваши ответы из ежедневных занятий. Если формулировка вышла лучше той, что в заметке, —
          её стоит перенести в текст.
        </p>
      </div>

      <div className="space-y-4">
        {grouped.map(([cardId, list]) => (
          <div key={cardId} className="rounded-lg border border-border/40 bg-card/40 p-4">
            <p className="text-sm font-medium leading-snug text-foreground/90">
              {questions.get(cardId) ?? 'Вопрос из прошлой версии заметки'}
            </p>

            <ul className="mt-3 space-y-3">
              {list.map((entry) => (
                <li key={entry.at} className="border-l-2 border-border/50 pl-3">
                  <p className="text-xs text-muted-foreground">
                    {formatDay(entry.at)} · {GRADE_META[entry.grade].label.toLowerCase()}
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-[15px] leading-relaxed">
                    {entry.text}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
