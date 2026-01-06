import { ArcheNote } from '@/arche/types';

export type ZoomLevel = 'out' | 'mid' | 'in';

export interface TimelineMetadata {
  startYear: number;
  endYear?: number;
  displayYear: number;
  importance: number; // 0-1
  precision: 'exact' | 'approximate' | 'century';
}

export interface TimelineNote extends ArcheNote {
  timeline: TimelineMetadata;
}

export interface SnapPoint {
  year: number;
  label: string;
  importance: 'high' | 'medium' | 'low';
  noteId?: string;
}

export interface Epoch {
  name: string;
  startYear: number;
  endYear: number;
  color?: string;
}

// TickMark теперь экспортируется из core/timelineMath.ts

export interface FilterState {
  types: string[];
  domains: string[];
  statuses: string[];
}

export interface SnapConfig {
  enabled: boolean;
  threshold: number; // пиксели
  strength: number; // 0-1
}

export interface TimeRulerState {
  currentPosition: number; // текущий год
  zoomLevel: ZoomLevel;
  filters: FilterState;
  focusedNoteId: string | null;
  snapPoints: SnapPoint[];
  visibleRange: { start: number; end: number };
}

