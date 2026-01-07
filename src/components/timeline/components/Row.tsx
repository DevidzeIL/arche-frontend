/**
 * Row - Компонент одной семантической строки
 * КРИТИЧНО: Показывает счетчики заметок в заголовке (total + inFocus)
 */

import { TimelineNote } from '../types';
import { RowConfig } from '../utils/rowTypes';
import { RowMarkersLayer } from './RowMarkersLayer';
import { RowCardsLayer } from './RowCardsLayer';
import { TimelineGeometry } from '../core/projection';
import { ZoomLevel } from '../types';
import { ROW_HEADER_WIDTH } from '../constants';

interface RowProps {
  rowConfig: RowConfig;
  notes: TimelineNote[];
  scrollYear: number;
  geometry: TimelineGeometry;
  zoomLevel: ZoomLevel;
  rowTop: number;
  focusedNoteId: string | null;
  hoveredNoteId: string | null;
  relatedNoteIds: Set<string>;
  focusMode: boolean;
  onCardClick: (noteId: string) => void;
  onCardHover: (noteId: string | null) => void;
}

export function Row({
  rowConfig,
  notes,
  scrollYear,
  geometry,
  zoomLevel,
  rowTop,
  focusedNoteId,
  hoveredNoteId,
  relatedNoteIds,
  focusMode,
  onCardClick,
  onCardHover,
}: RowProps) {
  const rowHeight = rowConfig.height;
  
  return (
    <div
      className="absolute left-0 right-0 pointer-events-none overflow-visible"
      style={{
        top: `${rowTop}px`,
        height: `${rowHeight}px`,
      }}
    >
      {/* Разделительная линия между строками */}
      <div
        className="absolute left-0 right-0 border-t border-border/20"
        style={{
          top: `${rowHeight - 1}px`,
        }}
      />
      
      {/* Заголовок строки (слева, sticky) */}
      {/* <div
        className={cn(
          "absolute left-0 flex flex-col items-start justify-center px-4 pointer-events-auto cursor-pointer",
          "transition-colors duration-200",
          isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'
        )}
        style={{
          top: 0,
          width: `${ROW_HEADER_WIDTH}px`,
          height: `${rowHeight}px`,
        }}
        onClick={onRowClick}
      >
        <span className="text-sm font-medium">{rowConfig.label}</span>
        <span className="text-xs mt-0.5 opacity-70">
          {totalCount} {hasMoreNotes && `(${inFocusCount} в фокусе)`}
        </span>
        {hasMoreNotes && (
          <span className="text-[10px] mt-1 text-primary/70" title="Увеличьте зум чтобы увидеть больше карточек">
            🔍 zoom in
          </span>
        )}
      </div> */}
      
      {/* Контент строки (справа от заголовка) */}
      <div
        className="absolute left-0 right-0 overflow-visible"
        style={{
          left: `${ROW_HEADER_WIDTH}px`,
          top: 0,
          height: `${rowHeight}px`,
        }}
      >
        {/* Маркеры плотности (всегда рендерятся для ВСЕХ заметок) */}
        <RowMarkersLayer
          notes={notes}
          scrollYear={scrollYear}
          geometry={geometry}
          rowTop={0}
          rowHeight={rowHeight}
        />
        
        {/* Карточки (только в focus window) */}
        <RowCardsLayer
          notes={notes}
          scrollYear={scrollYear}
          geometry={geometry}
          zoomLevel={zoomLevel}
          rowTop={0}
          rowHeight={rowHeight}
          focusedNoteId={focusedNoteId}
          hoveredNoteId={hoveredNoteId}
          relatedNoteIds={relatedNoteIds}
          focusMode={focusMode}
          onCardClick={onCardClick}
          onCardHover={onCardHover}
        />
      </div>
    </div>
  );
}

