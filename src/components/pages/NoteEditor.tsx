import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useArcheStore } from '@/arche/state/store';
import { localDay } from '@/arche/learning/progressStore';
import {
  VAULT_WRITABLE,
  appendCard,
  saveNoteFile,
  validateNoteSource,
  withUpdatedDate,
} from '@/arche/vaultEdit';
import type { ArcheNote } from '@/arche/types';
import { cn } from '@/lib/utils';

interface NoteEditorProps {
  note: ArcheNote;
}

const draftKey = (noteId: string) => `arche-draft:${noteId}`;

function readDraft(noteId: string): string | null {
  try {
    return localStorage.getItem(draftKey(noteId));
  } catch {
    return null;
  }
}

function writeDraft(noteId: string, text: string | null) {
  try {
    if (text === null) localStorage.removeItem(draftKey(noteId));
    else localStorage.setItem(draftKey(noteId), text);
  } catch {
    // Приватный режим или переполненное хранилище — правку это не ломает
  }
}

/**
 * Правка заметки прямо со страницы.
 *
 * Кнопка появляется только на локальном сервере: в собранном приложении
 * ручки записи нет вовсе (см. vite/vault-write.ts), и предлагать правку,
 * которая заведомо не сработает, нечестно.
 *
 * Редактор показывает файл целиком, вместе с frontmatter. Прятать
 * служебные поля было бы заботливо ровно до первого случая, когда
 * понадобилось поправить start_year, — а заодно и опасно: незаметная
 * пересборка YAML при сохранении испортила бы diff в git.
 */
export function NoteEditor({ note }: NoteEditorProps) {
  const [open, setOpen] = useState(false);

  if (!VAULT_WRITABLE) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Править заметку (только на локальном сервере)"
        className={cn(
          'fixed bottom-20 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full',
          'border border-border/60 bg-card/90 text-muted-foreground shadow-lg backdrop-blur',
          'transition-colors hover:border-primary/60 hover:text-foreground sm:bottom-6 sm:right-6'
        )}
      >
        <Pencil className="h-4 w-4" aria-hidden />
        <span className="sr-only">Править заметку</span>
      </button>

      {open && <EditorPanel note={note} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditorPanel({ note, onClose }: { note: ArcheNote; onClose: () => void }) {
  const replaceNote = useArcheStore((s) => s.replaceNote);

  const draft = readDraft(note.id);
  const [text, setText] = useState(draft ?? note.rawContent);
  const [restored, setRestored] = useState(draft !== null && draft !== note.rawContent);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const textarea = useRef<HTMLTextAreaElement>(null);
  const dirty = text !== note.rawContent;

  useEffect(() => {
    textarea.current?.focus();
  }, []);

  // Черновик переживает и случайное закрытие, и полную перезагрузку,
  // которую роняет правка того же файла в Obsidian
  useEffect(() => {
    writeDraft(note.id, dirty ? text : null);
  }, [note.id, text, dirty]);

  const close = () => {
    if (dirty && !window.confirm('Закрыть без сохранения? Черновик останется в браузере.')) return;
    onClose();
  };

  const save = async () => {
    const problem = validateNoteSource(text, note);
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError(null);

    const content = withUpdatedDate(text, localDay());
    const failure = await saveNoteFile(note.path, content);

    setSaving(false);
    if (failure) {
      setError(failure);
      return;
    }

    // Файл записан — обновляем заметку в памяти, чтобы страница показала
    // новый текст сразу. Перезагрузку страницы плагин для своих записей
    // подавляет: она пришла бы к тому же результату, но рывком
    if (!replaceNote(note.path, content)) {
      setError('Файл сохранён, но разобрать его не удалось — проверьте frontmatter');
      return;
    }

    writeDraft(note.id, null);
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const words = text
    .replace(/^---[\s\S]*?---/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm sm:p-6">
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden border border-border/50 bg-card sm:h-auto sm:max-h-[90vh] sm:rounded-xl">
        <header className="flex items-start justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate font-serif text-lg">{note.title}</h2>
            <p className="truncate font-mono text-xs text-muted-foreground">{note.path}</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
            <span className="sr-only">Закрыть</span>
          </button>
        </header>

        {restored && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/5 px-4 py-2 text-sm sm:px-5">
            <span className="text-amber-600 dark:text-amber-400">
              Восстановлен несохранённый черновик
            </span>
            <button
              type="button"
              onClick={() => {
                setText(note.rawContent);
                setRestored(false);
              }}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Вернуть текст из файла
            </button>
          </div>
        )}

        <textarea
          ref={textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className={cn(
            'min-h-0 flex-1 resize-none bg-transparent px-4 py-4 font-mono text-[13px] leading-relaxed',
            'outline-none sm:h-[60vh] sm:px-5'
          )}
        />

        {adding && (
          <CardComposer
            onCancel={() => setAdding(false)}
            onAdd={(front, back) => {
              setText((t) => appendCard(t, front, back));
              setAdding(false);
            }}
          />
        )}

        {error && (
          <p className="flex items-start gap-2 border-t border-red-500/30 bg-red-500/5 px-4 py-2 text-sm text-red-600 dark:text-red-400 sm:px-5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{words} слов</span>
            {!adding && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Plus className="h-3 w-3" aria-hidden />
                карточка
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              Отмена
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * Быстрое добавление карточки.
 *
 * Строка дописывается в текст редактора, а не сразу в файл: видно, что
 * именно будет записано и куда. Раздел «## Карточки» создаётся перед
 * списком литературы, если его ещё нет.
 */
function CardComposer({
  onAdd,
  onCancel,
}: {
  onAdd: (front: string, back: string) => void;
  onCancel: () => void;
}) {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const ready = front.trim().length > 0 && back.trim().length > 0;

  return (
    <div className="space-y-2 border-t border-border/40 bg-muted/20 px-4 py-3 sm:px-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Новая карточка</p>
      <input
        autoFocus
        value={front}
        onChange={(e) => setFront(e.target.value)}
        placeholder="Вопрос — то, что нужно вспомнить"
        className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
      />
      <input
        value={back}
        onChange={(e) => setBack(e.target.value)}
        placeholder="Ответ — коротко, своими словами"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && ready) onAdd(front, back);
        }}
        className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!ready} onClick={() => onAdd(front, back)}>
          Добавить в текст
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  );
}
