import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ArcheNote, AppSettings } from '../types';
import { loadNotes } from '../parser';
import { buildKnowledgeGraph, type KnowledgeGraph } from '../knowledge';

export { normalizeTitle } from '../normalize';
import { normalizeTitle } from '../normalize';

interface ArcheStore {
  notes: ArcheNote[];
  notesById: Map<string, ArcheNote>;
  notesByTitle: Map<string, ArcheNote>;
  /** noteId -> заметки, которые на неё ссылаются */
  backlinks: Map<string, ArcheNote[]>;
  /** Граф знаний строится один раз при загрузке: он нужен и карте, и страницам заметок */
  knowledgeGraph: KnowledgeGraph;
  loaded: boolean;

  // Settings
  settings: AppSettings;

  // Actions
  loadNotes: () => Promise<void>;
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

export const useArcheStore = create<ArcheStore>()(
  persist(
    (set, get) => ({
      notes: [],
      notesById: new Map(),
      notesByTitle: new Map(),
      backlinks: new Map(),
      knowledgeGraph: buildKnowledgeGraph([]),
      loaded: false,
      settings: defaultSettings(),

      loadNotes: async () => {
        const notes = await loadNotes();
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

        set({
          notes,
          notesById,
          notesByTitle,
          backlinks,
          knowledgeGraph: buildKnowledgeGraph(notes),
          loaded: true,
        });
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
