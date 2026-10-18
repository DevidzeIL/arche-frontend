import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BookMarked, Check, ExternalLink } from 'lucide-react';
import { useProgressStore } from '@/arche/learning/progressStore';
import { useArcheStore } from '@/arche/state/store';
import { readingOf, needsSource, READING_META, type ReadingItem, type ReadingKind } from '@/arche/reading';
import { cn } from '@/lib/utils';
import type { ArcheNote } from '@/arche/types';

interface NoteReadingProps {
  note: ArcheNote;
}

const KIND_STYLE: Record<ReadingKind, string> = {
  первичный: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400',
  проводник: 'border-sky-500/50 text-sky-600 dark:text-sky-400',
  обзор: 'border-border/60 text-muted-foreground',
  контекст: 'border-border/40 text-muted-foreground/70',
};

/**
 * Литература по заметке.
 *
 * Раньше раздел «Источники» рендерился как обычный markdown-список внизу
 * страницы: без разделения на первоисточник и пересказ, без ссылок наружу
 * и без возможности отметить прочитанное. Здесь то же содержимое, но
 * как часть приложения, а не как хвост текста.
 */
/**
 * Подпись записи. Если запись — [[ссылка]] на заметку хранилища, она
 * ведёт туда; иначе скобки Obsidian попадали бы на страницу как есть
 */
export function ReadingText({ item }: { item: ReadingItem }) {
  const target = useArcheStore((s) => (item.target ? s.getNoteByTitle(item.target) : undefined));
  if (!target) return <>{item.text}</>;
  return (
    <Link to={`/note/${target.id}`} className="underline decoration-border underline-offset-2 hover:decoration-foreground">
      {item.text}
    </Link>
  );
}

export function NoteReading({ note }: NoteReadingProps) {
  const items = useMemo(() => readingOf(note), [note]);
  const readingDone = useProgressStore((s) => s.readingDone);
  const toggleReading = useProgressStore((s) => s.toggleReading);

  const missing = needsSource(note);
  if (items.length === 0 && !missing) return null;

  return (
    <section className="space-y-3 border-t border-border/30 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-serif text-2xl text-foreground/90">
          <BookMarked className="h-4 w-4 text-muted-foreground" aria-hidden />
          Что читать
        </h2>
        <Link
          to="/reading"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          Весь список
        </Link>
      </div>

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item) => {
            const done = Boolean(readingDone[item.id]);
            return (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded-lg px-1 py-1.5 hover:bg-accent/30"
              >
                <button
                  type="button"
                  onClick={() => toggleReading(item.id)}
                  aria-pressed={done}
                  aria-label={done ? 'Снять отметку «прочитано»' : 'Отметить прочитанным'}
                  className={cn(
                    'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                    done
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-500'
                      : 'border-border/70 hover:border-foreground/50'
                  )}
                >
                  {done && <Check className="h-3 w-3" aria-hidden />}
                </button>

                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-[15px] leading-snug',
                      done && 'text-muted-foreground line-through'
                    )}
                  >
                    <ReadingText item={item} />
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                    <span
                      className={cn('rounded-full border px-1.5 py-0.5', KIND_STYLE[item.kind])}
                      title={READING_META[item.kind].hint}
                    >
                      {READING_META[item.kind].label}
                    </span>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden />
                        {item.source ?? 'Открыть'}
                      </a>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {missing && (
        <p className="text-sm text-muted-foreground">
          Источник не указан — заметка написана по общим сведениям. Пока это так,
          её стоит читать с оговоркой.
        </p>
      )}
    </section>
  );
}
