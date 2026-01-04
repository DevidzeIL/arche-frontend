export interface ArcheNote {
  id: string;
  path: string;
  title: string;
  type?: string;
  domain?: string[];
  status?: string;
  group?: string;
  created?: string | Date;
  updated?: string | Date;
  folder: string; // top-level folder (00_HUB, 01_Time, etc.)
  rawContent: string;
  body: string; // markdown без frontmatter
  plainText: string; // для поиска
  links: string[]; // все [[wikilinks]] из тела
}

export interface NoteLink {
  source: string; // id заметки
  target: string; // id заметки (или null если не найдена)
  targetTitle: string; // название из ссылки
}

export interface Tab {
  id: string;
  noteId: string;
  title: string;
  pinned: boolean;
}

export interface GraphSettings {
  nodeColors: Record<string, string>;
  nodeSizeBy: 'links' | 'fixed';
  linkDistance: number;
  chargeStrength: number;
  filters: {
    types: string[];
    domains: string[];
    statuses: string[];
    folders: string[];
  };
  showOnlyConnected: boolean;
  selectedNodeId: string | null;
  showArrows: boolean;
  textFadeThreshold: number; // 0..1
  linkThickness: number;
  nodeSize: number; // базовый размер ноды
  centerForce: number;
  repelForce: number;
  linkForce: number;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  tabs: Tab[];
  activeTabId: string | null;
  graphSettings: GraphSettings;
}

