import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronRight, Copy, Stethoscope } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { buildPlaceIndex, resolveAllPlaces } from '@/arche/geo';
import { buildHealthReport, fixSnippet, GAP_META, type GapKind } from '@/arche/health';
import { noteTypeLabel, noteTypeMeta } from '@/arche/noteTypes';
import { cn } from '@/lib/utils';

/** Сколько заметок в списке показывать до нажатия «ещё» */
const PREVIEW = 12;

/**
 * Кладёт в буфер путь к файлу и заготовку строки.
 *
 * Приложение остаётся read-only: править хранилище всё равно в Obsidian.
 * Но искать файл и вспоминать название поля больше не нужно.
 */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.setTimeout(() => setDone(false), 1600);
    } catch {
      // Буфер недоступен (нет разрешения или небезопасный контекст) —
      // молча ничего не делаем, вместо того чтобы пугать ошибкой
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={done ? 'Скопировано' : 'Скопировать путь и заготовку'}
      title={text}
      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {done ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}

/**
 * Что в хранилище стоит дописать.
 *
 * Список не про ошибки, а про пробелы: заметка без датировки не сломана,
 * она просто не видна на карте. Понять это, глядя на саму заметку, нельзя —
 * поэтому она и попадает сюда.
 */
export function HealthPage() {
  const notes = useArcheStore((s) => s.notes);
  const graph = useArcheStore((s) => s.knowledgeGraph);
  const getBacklinks = useArcheStore((s) => s.getBacklinks);

  const report = useMemo(() => {
    const placeIndex = buildPlaceIndex(notes);
    const placesOf = resolveAllPlaces(notes, placeIndex, (noteId) =>
      (graph.adjacent.get(noteId) ?? [])
        .filter((edge) => edge.kind === 'author')
        .map((edge) => (edge.sourceId === noteId ? edge.targetId : edge.sourceId))
        .filter((id) => graph.nodeById.get(id)?.type === 'person')
    );

    return buildHealthReport({
      notes,
      graph,
      placeIndex,
      placesOf,
      backlinksOf: getBacklinks,
    });
  }, [notes, graph, getBacklinks]);

  const [expanded, setExpanded] = useState<Set<GapKind>>(new Set());
  const toggle = (kind: GapKind) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="container mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <Stethoscope className="h-3.5 w-3.5" aria-hidden />
            Хранилище
          </p>
          <h1 className="mt-1 font-serif text-3xl">Что стоит дописать</h1>
          <p className="mt-2 max-w-xl leading-relaxed text-muted-foreground">
            Каждая возможность приложения чем-то питается: карта — датировкой,
            глобус — географией, родословная и вопросы тестов — причинными связями.
            Здесь видно, где этого не хватает. Это список пробелов, а не ошибок.
          </p>
        </header>

        {/* Охват */}
        <section className="mb-8 grid gap-3 sm:grid-cols-3">
          {report.coverage.map((item) => {
            const percent = item.total > 0 ? Math.round((item.covered / item.total) * 100) : 100;
            return (
              <div key={item.label} className="rounded-lg border border-border/40 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-1 font-serif text-2xl">
                  {item.covered}
                  <span className="text-base text-muted-foreground"> / {item.total}</span>
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/40">
                  <div
                    className={cn('h-full', percent >= 80 ? 'bg-emerald-500' : 'bg-primary')}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </section>

        {report.gaps.length === 0 ? (
          <p className="text-muted-foreground">
            Пробелов не нашлось — все {report.checked} заметок заполнены полностью.
          </p>
        ) : (
          <div className="space-y-3">
            {report.gaps.map((gap) => {
              const meta = GAP_META[gap.kind];
              const open = expanded.has(gap.kind);
              const shown = open ? gap.items : gap.items.slice(0, PREVIEW);

              return (
                <section
                  key={gap.kind}
                  className="rounded-xl border border-border/40 bg-card/40 p-4 sm:p-5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-serif text-xl">{meta.title}</h2>
                    <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
                      {gap.items.length}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{meta.consequence}</p>

                  <ul className="mt-3 space-y-0.5">
                    {shown.map((item) => (
                      <li
                        key={item.noteId}
                        className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/30"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: noteTypeMeta(item.type).graphColor }}
                          aria-hidden
                        />
                        <Link
                          to={`/note/${item.noteId}`}
                          className="min-w-0 flex-1 truncate text-[14px] hover:underline"
                          title={noteTypeLabel(item.type)}
                        >
                          {item.title}
                        </Link>
                        <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground/60 sm:inline">
                          {item.path}
                        </span>
                        <CopyButton text={fixSnippet(gap.kind, item)} />
                      </li>
                    ))}
                  </ul>

                  {gap.items.length > PREVIEW && (
                    <button
                      type="button"
                      onClick={() => toggle(gap.kind)}
                      className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                      {open ? (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {open ? 'Свернуть' : `Ещё ${gap.items.length - PREVIEW}`}
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
