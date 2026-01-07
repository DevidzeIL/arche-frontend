/**
 * RowsLayer - Слой семантических строк
 * КРИТИЧНО: Scrollable контейнер - строки не "размазаны" по пустоте
 */

import { useMemo } from 'react';
import { TimelineGeometry } from '../core/projection';
import { TimelineNote } from '../types';
import { ZoomLevel } from '../types';
import { RowKey, ROW_ORDER, groupNotesByRow, getRowConfig } from '../utils/rowTypes';
import { Row } from './Row';
import { DEFAULT_ROW_HEIGHT, MIN_ROW_HEIGHT } from '../constants';

interface RowsLayerProps {
  notes: TimelineNote[];
  scrollYear: number;
  geometry: TimelineGeometry;
  zoomLevel: ZoomLevel;
  activeRowKey: RowKey | null;
  focusedNoteId: string | null;
  hoveredNoteId: string | null;
  relatedNoteIds: Set<string>;
  focusMode: boolean;
  onCardClick: (noteId: string) => void;
  onCardHover: (noteId: string | null) => void;
  onRowClick?: (rowKey: RowKey) => void;
}

export function RowsLayer({
  notes,
  scrollYear,
  geometry,
  zoomLevel,
  activeRowKey,
  focusedNoteId,
  hoveredNoteId,
  relatedNoteIds,
  focusMode,
  onCardClick,
  onCardHover,
  onRowClick,
}: RowsLayerProps) {
  // Группируем заметки по строкам
  const notesByRow = useMemo(() => {
    return groupNotesByRow(notes);
  }, [notes]);
  
  // Вычисляем видимые строки и их позиции
  const { rowPositions, totalHeight, rowHeight } = useMemo(() => {
    const visibleRows: Array<{ rowKey: RowKey; top: number }> = [];
    let currentTop = 0;
    
    // Собираем только строки с заметками
    ROW_ORDER.forEach(rowKey => {
      if (notesByRow[rowKey].length > 0) {
        visibleRows.push({
          rowKey,
          top: currentTop,
        });
        currentTop += DEFAULT_ROW_HEIGHT;
      }
    });
    
    const totalHeight = visibleRows.length * DEFAULT_ROW_HEIGHT;
    
    // Компактный режим: если строк мало, уменьшаем высоту
    // Если строк много - используем стандартную высоту, появится scroll
    const compactRowHeight = totalHeight < geometry.cardsAreaHeight
      ? Math.max(MIN_ROW_HEIGHT, Math.floor(geometry.cardsAreaHeight / Math.max(1, visibleRows.length)))
      : DEFAULT_ROW_HEIGHT;
    
    // Пересчитываем позиции с учетом компактной высоты
    const positions = visibleRows.map((row, index) => ({
      ...row,
      top: index * compactRowHeight,
    }));
    
    return {
      rowPositions: positions,
      totalHeight: visibleRows.length * compactRowHeight,
      rowHeight: compactRowHeight,
    };
  }, [notesByRow, geometry.cardsAreaHeight]);
  
  // Нужен ли scroll
  const needsScroll = totalHeight > geometry.cardsAreaHeight;
  
  return (
    <div 
      className="absolute left-0 right-0 pointer-events-none overflow-visible"
      style={{
        top: 0,
        height: `${geometry.cardsAreaHeight}px`,
      }}
    >
      {/* Scrollable контейнер для строк */}
      <div
        className="relative w-full pointer-events-none overflow-visible"
        style={{
          height: needsScroll ? `${geometry.cardsAreaHeight}px` : 'auto',
          overflowY: needsScroll ? 'auto' : 'visible',
          overflowX: 'hidden',
        }}
      >
        {/* Внутренний контейнер со всеми строками */}
        <div
          className="relative w-full"
          style={{
            minHeight: `${totalHeight}px`,
            height: needsScroll ? `${totalHeight}px` : 'auto',
          }}
        >
          {rowPositions.map(({ rowKey, top }) => {
            const rowNotes = notesByRow[rowKey];
            const rowConfig = getRowConfig(rowKey);
            // Используем компактную высоту
            const adjustedConfig = { ...rowConfig, height: rowHeight };
            const isActive = activeRowKey === rowKey;
            
            return (
              <Row
                key={rowKey}
                rowConfig={adjustedConfig}
                notes={rowNotes}
                scrollYear={scrollYear}
                geometry={geometry}
                zoomLevel={zoomLevel}
                rowTop={top}
                isActive={isActive}
                focusedNoteId={focusedNoteId}
                hoveredNoteId={hoveredNoteId}
                relatedNoteIds={relatedNoteIds}
                focusMode={focusMode}
                onCardClick={onCardClick}
                onCardHover={onCardHover}
                onRowClick={() => onRowClick?.(rowKey)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

