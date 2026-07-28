import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { searchNotes } from '@/arche/search';
import { noteTypeLabel } from '@/arche/noteTypes';
import { cn } from '@/lib/utils';

const MAX_RESULTS = 12;

/** Открыт ли сейчас ввод текста — тогда «/» не должен перехватываться */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const notes = useArcheStore((state) => state.notes);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => searchNotes(notes, query, MAX_RESULTS), [notes, query]);

  // Сбрасываем состояние при каждом открытии
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // autoFocus не срабатывает, потому что элемент только что смонтирован
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Держим подсвеченный пункт в поле зрения при навигации стрелками
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const openNote = useCallback(
    (noteId: string) => {
      onOpenChange(false);
      navigate(`/note/${noteId}`);
    },
    [navigate, onOpenChange]
  );

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (results.length ? (index + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (results.length ? (index - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const note = results[activeIndex];
      if (note) openNote(note.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Поиск по заметкам"
    >
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => onOpenChange(false)} />

      <div className="relative w-full max-w-xl rounded-lg border border-border/60 bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-border/40">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Найти заметку..."
            aria-label="Найти заметку"
            aria-controls="command-palette-results"
            className="flex-1 bg-transparent py-4 text-base outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground">
            Esc
          </kbd>
        </div>

        {results.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {query.trim() ? 'Ничего не найдено' : 'Начните вводить название'}
          </p>
        ) : (
          <ul ref={listRef} id="command-palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto py-2">
            {results.map((note, index) => (
              <li key={note.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  data-active={index === activeIndex}
                  onClick={() => openNote(note.id)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'w-full text-left px-4 py-2.5 flex items-baseline justify-between gap-3 transition-colors',
                    index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                  )}
                >
                  <span className="font-serif truncate">{note.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{noteTypeLabel(note.type)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Глобальные горячие клавиши палитры: Cmd/Ctrl+K и «/».
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isShortcut = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
      const isSlash = event.key === '/' && !isTypingTarget(event.target);

      if (isShortcut || isSlash) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { open, setOpen };
}
