import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ArcheNote, Tab, GraphSettings, AppSettings } from '../types';
import { loadNotes, extractWikilinks, normalizeWikilinkTarget, EXCLUDED_FOLDERS } from '../parser';

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
  updateGraphSettings: (settings: Partial<GraphSettings>) => void;
  
  // Getters
  getNote: (id: string) => ArcheNote | undefined;
  getNoteByTitle: (title: string) => ArcheNote | undefined;
  getBacklinks: (noteId: string) => ArcheNote[];
  getCurrentNote: () => ArcheNote | undefined;
}

const defaultGraphSettings: GraphSettings = {
  nodeColors: {},
  nodeSizeBy: 'links',
  linkDistance: 90, // Зафиксировано для Obsidian-like поведения
  chargeStrength: -300,
  filters: {
    types: [],
    domains: [],
    statuses: [],
    folders: [],
  },
  showOnlyConnected: false,
  selectedNodeId: null,
  showArrows: true,
  textFadeThreshold: 0.6,
  linkThickness: 1.5,
  nodeSize: 5,
  centerForce: 0.1, // Зафиксировано для Obsidian-like поведения
  repelForce: -180, // Зафиксировано для Obsidian-like поведения
  linkForce: 0.35, // Зафиксировано для Obsidian-like поведения
};

const defaultSettings: AppSettings = {
  theme: 'light',
  sidebarOpen: true,
  tabs: [],
  activeTabId: null,
  graphSettings: defaultGraphSettings,
};

export const useArcheStore = create<ArcheStore>()(
  persist(
    (set, get) => ({
      notes: [],
      notesById: new Map(),
      notesByTitle: new Map(),
      loaded: false,
      settings: defaultSettings,

      loadNotes: async () => {
        const notes = await loadNotes();
        const notesById = new Map<string, ArcheNote>();
        const notesByTitle = new Map<string, ArcheNote>();

        notes.forEach((note) => {
          notesById.set(note.id, note);
          // Индекс по нормализованному title для строгого матчинга
          const normalizedTitle = normalizeTitle(note.title);
          notesByTitle.set(normalizedTitle, note);
        });

        set({ notes, notesById, notesByTitle, loaded: true });
      },

      setTheme: (theme) => {
        set((state) => ({
          settings: { ...state.settings, theme },
        }));
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
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

      updateGraphSettings: (partial) => {
        set((state) => ({
          settings: {
            ...state.settings,
            graphSettings: {
              ...state.settings.graphSettings,
              ...partial,
            },
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
        const note = get().notesById.get(noteId);
        if (!note) return [];

        return get().notes.filter((n) => n.links.includes(note.title));
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
            graphSettings: {
              ...defaultGraphSettings,
              ...currentState.settings.graphSettings,
              ...persisted.settings?.graphSettings,
              filters: {
                ...defaultGraphSettings.filters,
                ...currentState.settings.graphSettings.filters,
                ...persisted.settings?.graphSettings?.filters,
              },
            },
          },
        };
      },
    }
  )
);


