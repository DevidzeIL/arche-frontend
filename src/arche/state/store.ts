import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ArcheNote, Tab, AppSettings } from '../types';
import { loadNotes } from '../parser';

// Нормализация title для строгого матчинга
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' '); // Заменяем множественные пробелы на один
}

interface ArcheStore {
  notes: ArcheNote[];
  notesById: Map<string, ArcheNote>;
  notesByTitle: Map<string, ArcheNote>;
  /** noteId -> заметки, которые на неё ссылаются */
  backlinks: Map<string, ArcheNote[]>;
  loaded: boolean;
  
  // Settings
  settings: AppSettings;
  
  // Actions
  loadNotes: () => Promise<void>;
  setTheme: (theme: 'light' | 'dark') => void;
  setSidebarOpen: (open: boolean) => void;
  openNote: (noteId: string) => void;
  closeTab: (tabId: string) => void;
  pinTab: (tabId: string) => void;
  unpinTab: (tabId: string) => void;
  setActiveTab: (tabId: string | null) => void;
  
  // Getters
  getNote: (id: string) => ArcheNote | undefined;
  getNoteByTitle: (title: string) => ArcheNote | undefined;
  getBacklinks: (noteId: string) => ArcheNote[];
  getCurrentNote: () => ArcheNote | undefined;
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  sidebarOpen: true,
  tabs: [],
  activeTabId: null,
};

export const useArcheStore = create<ArcheStore>()(
  persist(
    (set, get) => ({
      notes: [],
      notesById: new Map(),
      notesByTitle: new Map(),
      backlinks: new Map(),
      loaded: false,
      settings: defaultSettings,

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

        set({ notes, notesById, notesByTitle, backlinks, loaded: true });
      },

      // Запись в localStorage делает zustand persist; здесь только состояние.
      // Класс на <html> вешает единственный эффект в App.
      setTheme: (theme) => {
        set((state) => ({
          settings: { ...state.settings, theme },
        }));
      },

      setSidebarOpen: (open) => {
        set((state) => ({
          settings: { ...state.settings, sidebarOpen: open },
        }));
      },

      openNote: (noteId) => {
        const note = get().notesById.get(noteId);
        if (!note) return;

        const state = get();
        const existingTab = state.settings.tabs.find(
          (tab) => tab.noteId === noteId
        );

        if (existingTab) {
          set({
            settings: {
              ...state.settings,
              activeTabId: existingTab.id,
            },
          });
          return;
        }

        const newTab: Tab = {
          id: `tab-${Date.now()}-${Math.random()}`,
          noteId: note.id,
          title: note.title,
          pinned: false,
        };

        set({
          settings: {
            ...state.settings,
            tabs: [...state.settings.tabs, newTab],
            activeTabId: newTab.id,
          },
        });
      },

      closeTab: (tabId) => {
        const state = get();
        const tabs = state.settings.tabs.filter((tab) => tab.id !== tabId);
        const activeTabId =
          state.settings.activeTabId === tabId
            ? tabs.length > 0
              ? tabs[tabs.length - 1].id
              : null
            : state.settings.activeTabId;

        set({
          settings: {
            ...state.settings,
            tabs,
            activeTabId,
          },
        });
      },

      pinTab: (tabId) => {
        const state = get();
        const tabs = state.settings.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, pinned: true } : tab
        );

        set({
          settings: {
            ...state.settings,
            tabs,
          },
        });
      },

      unpinTab: (tabId) => {
        const state = get();
        const tabs = state.settings.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, pinned: false } : tab
        );

        set({
          settings: {
            ...state.settings,
            tabs,
          },
        });
      },

      setActiveTab: (tabId) => {
        set((state) => ({
          settings: {
            ...state.settings,
            activeTabId: tabId,
          },
        }));
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

      getCurrentNote: () => {
        const state = get();
        if (!state.settings.activeTabId) return undefined;

        const activeTab = state.settings.tabs.find(
          (tab) => tab.id === state.settings.activeTabId
        );
        if (!activeTab) return undefined;

        return state.notesById.get(activeTab.noteId);
      },
    }),
    {
      name: 'arche-storage',
      partialize: (state) => ({
        settings: state.settings,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as ArcheStore;
        return {
          ...currentState,
          settings: {
            ...currentState.settings,
            ...persisted.settings,
          },
        };
      },
    }
  )
);


