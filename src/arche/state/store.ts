import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ArcheNote, AppSettings } from '../types';
import { loadNotes, parseNote } from '../parser';
import { buildKnowledgeGraph, type KnowledgeGraph } from '../knowledge';

export { normalizeTitle } from '../normalize';
import { normalizeTitle } from '../normalize';

/** Всё, что пересчитывается по списку заметок */
interface NoteIndex {
  notes: ArcheNote[];
  notesById: Map<string, ArcheNote>;
  notesByTitle: Map<string, ArcheNote>;
  backlinks: Map<string, ArcheNote[]>;
  knowledgeGraph: KnowledgeGraph;
}

interface ArcheStore extends NoteIndex {
  loaded: boolean;

  // Settings
  settings: AppSettings;

  // Actions
  loadNotes: () => Promise<void>;
  /**
   * Заменить одну заметку разобранным содержимым файла.
   *
   * Нужно после правки из редактора: файл уже записан, и страница должна
   * показать новый текст сразу. Индексы и граф пересобираются целиком —
   * при полутора сотнях заметок это доли миллисекунды, а частичное
   * обновление обратных ссылок пришлось бы держать в голове вечно.
   *
   * Возвращает false, если файл перестал разбираться.
   */
  replaceNote: (path: string, rawContent: string) => boolean;
  setTheme: (theme: 'light' | 'dark') => void;
  /** Запомнить, что заметку открывали: из этого строится «недавнее» */
  rememberVisit: (noteId: string) => void;

  // Getters
  getNote: (id: string) => ArcheNote | undefined;
  getNoteByTitle: (title: string) => ArcheNote | undefined;
  getBacklinks: (noteId: string) => ArcheNote[];
  /** Недавно открытые заметки, свежие первыми; исчезнувшие отсеиваются */
  getRecentNotes: () => ArcheNote[];
}

/** Сколько заметок держим в истории: это список «продолжить», а не архив */
const RECENT_LIMIT = 12;

/**
 * Тема по умолчанию берётся из системной, а не назначается тёмной.
 * Явный выбор сохраняется и системную перекрывает.
 */
function preferredTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

const defaultSettings = (): AppSettings => ({
  theme: preferredTheme(),
  recent: [],
});

function indexNotes(notes: ArcheNote[]): NoteIndex {
  const notesById = new Map<string, ArcheNote>();
  const notesByTitle = new Map<string, ArcheNote>();

  notes.forEach((note) => {
    notesById.set(note.id, note);
    // Индекс по нормализованному title для строгого матчинга
    notesByTitle.set(normalizeTitle(note.title), note);
  });

  // Обратные ссылки считаем один раз при загрузке:
  // иначе каждый вызов getBacklinks — полный проход по всем заметкам
  const backlinks = new Map<string, ArcheNote[]>();
  notes.forEach((note) => {
    note.links.forEach((linkTitle) => {
      const target = notesByTitle.get(normalizeTitle(linkTitle));
      if (!target || target.id === note.id) return;
      const list = backlinks.get(target.id) ?? [];
      if (!list.some((n) => n.id === note.id)) list.push(note);
      backlinks.set(target.id, list);
    });
  });

  return { notes, notesById, notesByTitle, backlinks, knowledgeGraph: buildKnowledgeGraph(notes) };
}

export const useArcheStore = create<ArcheStore>()(
  persist(
    (set, get) => ({
      ...indexNotes([]),
      loaded: false,
      settings: defaultSettings(),

      loadNotes: async () => {
        const notes = await loadNotes();
        set({ ...indexNotes(notes), loaded: true });
      },

      replaceNote: (path, rawContent) => {
        const parsed = parseNote(path, rawContent);
        if (!parsed) return false;

        const current = get().notes;
        const at = current.findIndex((n) => n.path === path);
        const notes =
          at >= 0 ? current.map((n, i) => (i === at ? parsed : n)) : [...current, parsed];

        set(indexNotes(notes));
        return true;
      },

      setTheme: (theme) => {
        set((state) => ({
          settings: { ...state.settings, theme },
        }));
      },

      rememberVisit: (noteId) => {
        set((state) => {
          if (!state.notesById.has(noteId)) return {};
          const { recent } = state.settings;
          // Повторный заход поднимает заметку наверх, а не плодит запись
          if (recent[0] === noteId) return {};
          return {
            settings: {
              ...state.settings,
              recent: [noteId, ...recent.filter((id) => id !== noteId)].slice(0, RECENT_LIMIT),
            },
          };
        });
      },

      getNote: (id) => {
        return get().notesById.get(id);
      },

      getNoteByTitle: (title) => {
        const normalized = normalizeTitle(title);
        return get().notesByTitle.get(normalized);
      },

      getBacklinks: (noteId) => {
        return get().backlinks.get(noteId) ?? [];
      },

      getRecentNotes: () => {
        const state = get();
        return state.settings.recent
          .map((id) => state.notesById.get(id))
          .filter((note): note is ArcheNote => note !== undefined);
      },
    }),
    {
      name: 'arche-storage',
      partialize: (state) => ({
        settings: state.settings,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ArcheStore> | undefined;
        return {
          ...currentState,
          settings: {
            ...currentState.settings,
            ...persisted?.settings,
            // Список вкладок из старой версии хранилища сюда не переносится:
            // поле другое, и мусор из localStorage не должен всплывать
            recent: persisted?.settings?.recent ?? [],
          },
        };
      },
    }
  )
);
