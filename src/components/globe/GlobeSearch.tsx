import { useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { normalizeTitle } from '@/arche/normalize';
import { formatYear } from '@/arche/timeSpan';
import { cn } from '@/lib/utils';

export type SearchKind = 'place' | 'note' | 'state' | 'event' | 'person' | 'kb' | 'city';

export interface SearchEntry {
  /** Уникальный ключ записи */
  key: string;
  title: string;
  kind: SearchKind;
  /** Подпись справа: «Государство · 1702–1863», «Сражение · 1757» */
  sub?: string;
  year?: number;
  /** Чем больше, тем выше в выдаче при равном совпадении */
  weight?: number;
}

const KIND_LABEL: Record<SearchKind, string> = {
  place: 'Место',
  note: 'Заметка',
  state: 'Государство',
  event: 'Событие',
  person: 'Человек',
  kb: 'Справка',
  city: 'Город',
};

const LIMIT = 12;

/**
 * Поиск по всему, что есть на глобусе: найти и перелететь.
 *
 * Своё — первым: заметка хранилища выше справки с тем же названием.
 * Совпадение с начала названия выше, чем совпадение в середине.
 */
export function GlobeSearch({
  entries,
  onPick,
  onFocus,
  className,
}: {
  entries: SearchEntry[];
  onPick: (entry: SearchEntry) => void;
  /** Поиск открыли — можно догрузить справочные данные */
  onFocus?: () => void;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = normalizeTitle(query);
    if (q.length < 2) return [];
    const own = (kind: SearchKind) => (kind === 'note' || kind === 'place' ? 2 : 0);
    return entries
      .map((entry) => {
        const title = normalizeTitle(entry.title);
        const at = title.indexOf(q);
        if (at < 0) return null;
        const score = (at === 0 ? 4 : title.includes(` ${q}`) ? 2 : 1) + own(entry.kind) + (entry.weight ?? 0);
        return { entry, score };
      })
      .filter((r): r is { entry: SearchEntry; score: number } => r !== null)
      .sort((a, b) => b.score - a.score || a.entry.title.length - b.entry.title.length)
      .slice(0, LIMIT)
      .map((r) => r.entry);
  }, [entries, query]);

  const pick = (entry: SearchEntry) => {
    onPick(entry);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className={cn('pointer-events-auto relative', className)}>
      <div className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-card/90 px-2.5 py-1.5 backdrop-blur-sm">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            onFocus?.();
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter' && results[active]) {
              pick(results[active]);
            } else if (e.key === 'Escape') {
              setQuery('');
              setOpen(false);
              inputRef.current?.blur();
            }
            // Стрелки и пробел глобуса здесь не нужны
            e.stopPropagation();
          }}
          placeholder="Найти страну, город, событие, человека…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Поиск по глобусу"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Очистить"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[50vh] overflow-y-auto rounded-xl border border-border/50 bg-card/97 py-1 shadow-xl backdrop-blur-sm"
          role="listbox"
        >
          {results.map((entry, i) => (
            <li key={entry.key} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(entry)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm',
                  i === active && 'bg-accent/60'
                )}
              >
                <span className="min-w-0 truncate">
                  {entry.title}
                  {entry.year !== undefined && (
                    <span className="ml-1.5 text-[12px] text-muted-foreground">{formatYear(entry.year)}</span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{entry.sub ?? KIND_LABEL[entry.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.length >= 2 && results.length === 0 && (
        <p className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-border/50 bg-card/97 px-3 py-2 text-sm text-muted-foreground">
          Ничего не нашлось
        </p>
      )}
    </div>
  );
}
