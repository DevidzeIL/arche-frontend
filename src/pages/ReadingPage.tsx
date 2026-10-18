import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookMarked, Check, ExternalLink, Filter } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { useProgressStore } from '@/arche/learning/progressStore';
import { buildCourses } from '@/arche/learning/curriculum';
import { readingOf, READING_META, type ReadingItem, type ReadingKind } from '@/arche/reading';
import { Button } from '@/components/ui/button';
import { ReadingText } from '@/components/pages/NoteReading';
import { cn } from '@/lib/utils';
import { plural } from '@/lib/plural';

interface Section {
  key: string;
  title: string;
  /** Порядковый номер оси — «Первая ось» и так далее */
  ordinal?: string;
  items: ReadingItem[];
}

/**
 * План чтения, собранный из самого хранилища.
 *
 * Литература лежит в заметках и до сих пор была видна только внутри
 * каждой по отдельности — то есть как раз тогда, когда читать уже поздно.
 * Здесь она собрана в один список и разложена по осям вектора: видно,
 * что читать по теме, которой занимаешься сейчас, и чего в ней не хватает.
 */
export function ReadingPage() {
  const notes = useArcheStore((s) => s.notes);
  const readingDone = useProgressStore((s) => s.readingDone);
  const toggleReading = useProgressStore((s) => s.toggleReading);

  const [primaryOnly, setPrimaryOnly] = useState(false);

  const sections = useMemo<Section[]>(() => {
    const byNote = new Map(notes.map((note) => [note.id, readingOf(note)]));
    const used = new Set<string>();
    const result: Section[] = [];

    for (const course of buildCourses(notes)) {
      for (const chapter of course.chapters) {
        const items: ReadingItem[] = [];
        for (const lesson of chapter.lessons) {
          const found = byNote.get(lesson.noteId);
          if (!found || found.length === 0) continue;
          used.add(lesson.noteId);
          items.push(...found);
        }
        if (items.length > 0) {
          result.push({
            key: `${course.hubId}:${chapter.index}`,
            title: chapter.title,
            ordinal: chapter.ordinal,
            items,
          });
        }
      }
    }

    // Заметки вне осей: места, служебное, всё, что ещё не попало в курс
    const rest: ReadingItem[] = [];
    for (const [noteId, items] of byNote) {
      if (used.has(noteId)) continue;
      rest.push(...items);
    }
    if (rest.length > 0) {
      result.push({ key: 'rest', title: 'Вне осей', items: rest });
    }

    return result;
  }, [notes]);

  const visible = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          items: primaryOnly
            ? section.items.filter((item) => item.kind === 'первичный')
            : section.items,
        }))
        .filter((section) => section.items.length > 0),
    [sections, primaryOnly]
  );

  const primary = sections.flatMap((s) => s.items).filter((i) => i.kind === 'первичный');
  const primaryRead = primary.filter((item) => readingDone[item.id]).length;

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="container mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <BookMarked className="h-3.5 w-3.5" aria-hidden />
            Хранилище
          </p>
          <h1 className="mt-1 font-serif text-3xl">Что читать</h1>
          <p className="mt-2 max-w-xl leading-relaxed text-muted-foreground">
            Литература из ваших заметок, разложенная по осям вектора. Первоисточник —
            это сам текст, проводник помогает в него войти. Отмечайте прочитанное:
            заметку после этого стоит переписать заново.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="rounded-lg border border-border/40 px-3 py-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Первоисточники
              </p>
              <p className="font-serif text-xl">
                {primaryRead}
                <span className="text-sm text-muted-foreground"> / {primary.length}</span>
              </p>
            </div>

            <Button
              variant={primaryOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPrimaryOnly((v) => !v)}
            >
              <Filter className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Только первоисточники
            </Button>
          </div>
        </header>

        {visible.length === 0 ? (
          <p className="text-muted-foreground">
            В заметках пока нет разделов «Что читать» или «Источники».
          </p>
        ) : (
          <div className="space-y-6">
            {visible.map((section) => {
              const done = section.items.filter((item) => readingDone[item.id]).length;

              return (
                <section key={section.key}>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <h2 className="font-serif text-xl">
                      {section.ordinal && (
                        <span className="text-muted-foreground">{section.ordinal}: </span>
                      )}
                      {section.title}
                    </h2>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {done} из {section.items.length}
                    </span>
                  </div>

                  <ul className="space-y-1">
                    {section.items.map((item) => (
                      <ReadingRow
                        key={item.id}
                        item={item}
                        done={Boolean(readingDone[item.id])}
                        onToggle={() => toggleReading(item.id)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        <p className="mt-10 text-sm text-muted-foreground">
          Всего записей: {sections.reduce((sum, s) => sum + s.items.length, 0)}, из них{' '}
          {primary.length}{' '}
          {plural(primary.length, 'первоисточник', 'первоисточника', 'первоисточников')}.
        </p>
      </div>
    </div>
  );
}

const KIND_STYLE: Record<ReadingKind, string> = {
  первичный: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400',
  проводник: 'border-sky-500/50 text-sky-600 dark:text-sky-400',
  обзор: 'border-border/60 text-muted-foreground',
  контекст: 'border-border/40 text-muted-foreground/70',
};

function ReadingRow({
  item,
  done,
  onToggle,
}: {
  item: ReadingItem;
  done: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/30">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={done ? 'Снять отметку «прочитано»' : 'Отметить прочитанным'}
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
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
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span
            className={cn('rounded-full border px-1.5 py-0.5', KIND_STYLE[item.kind])}
            title={READING_META[item.kind].hint}
          >
            {READING_META[item.kind].label}
          </span>
          <Link
            to={`/note/${item.noteId}`}
            className="text-muted-foreground hover:text-foreground"
          >
            {item.noteTitle}
          </Link>
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
}
