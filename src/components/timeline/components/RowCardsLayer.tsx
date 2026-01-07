/**
 * RowCardsLayer - Слой карточек для строки
 * Рендерит полные карточки только для заметок в focus window
 * КРИТИЧНО: Один источник позиционирования (wrapper div), TimelineCard не делает absolute
 */

import { useMemo, useState } from 'react';
import { TimelineGeometry, yearToScreenX } from '../core/projection';
import { TimelineNote } from '../types';
import { ZoomLevel } from '../types';
import { isInFocusWindow } from '../utils/focusWindow';
import { computeBucketLayout } from '../utils/bucketLayout';
import { TimelineCard } from './TimelineCard';
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  CARD_GAP,
  CARD_BOTTOM_MARGIN,
  CARD_HORIZONTAL_GAP,
} from '../constants';
import { cn } from '@/lib/utils';

interface RowCardsLayerProps {
  notes: TimelineNote[];
  scrollYear: number;
  geometry: TimelineGeometry;
  zoomLevel: ZoomLevel;
  rowTop: number;
  rowHeight: number;
  focusedNoteId: string | null;
  hoveredNoteId: string | null;
  relatedNoteIds: Set<string>;
  focusMode: boolean;
  onCardClick: (noteId: string) => void;
  onCardHover: (noteId: string | null) => void;
}

export function RowCardsLayer({
  notes,
  scrollYear,
  geometry,
  zoomLevel,
  rowTop,
  rowHeight,
  focusedNoteId,
  hoveredNoteId,
  relatedNoteIds,
  focusMode,
  onCardClick,
  onCardHover,
}: RowCardsLayerProps) {
  // State для расширенных buckets (интерактивные overflow indicators)
  const [expandedBuckets, setExpandedBuckets] = useState<Set<number>>(new Set());
  
  // Фильтруем заметки в focus window
  // КРИТИЧНО: Передаем geometry для правильного расчета размера окна
  const notesInFocus = useMemo(() => {
    return notes.filter(note => {
      const year = note.timeline?.displayYear ?? 0;
      return isInFocusWindow(year, scrollYear, zoomLevel, geometry);
    });
  }, [notes, scrollYear, zoomLevel, geometry]);
  
  // Вычисляем bucket layout с учетом расширенных buckets
  const bucketLayout = useMemo(() => {
    return computeBucketLayout(notesInFocus, zoomLevel, 3, expandedBuckets);
  }, [notesInFocus, zoomLevel, expandedBuckets]);
  
  // Создаем map для быстрого поиска заметок
  const notesMap = useMemo(() => {
    return new Map(notes.map(note => [note.id, note]));
  }, [notes]);
  
  // Вычисляем позиции карточек с защитой от горизонтальных overlaps
  const cardPositions = useMemo(() => {
    // Сначала вычисляем все позиции
    const positions = bucketLayout.items.map(item => {
      const note = notesMap.get(item.noteId);
      if (!note) return null;
      
      // X позиция - центр карточки на году заметки
      const centerX = yearToScreenX(item.year, scrollYear, geometry);
      const cardLeft = centerX - CARD_WIDTH / 2;
      
      // Y позиция - от низа строки, с учетом stack index
      const baseY = rowTop + rowHeight - CARD_BOTTOM_MARGIN - CARD_HEIGHT;
      const cardTop = baseY - item.stackIndex * (CARD_HEIGHT + CARD_GAP);
      
      // Убеждаемся, что карточка не выходит за границы строки
      if (cardTop < rowTop) return null;
      
      return {
        note,
        item,
        cardLeft,
        cardTop,
        centerX, // Сохраняем для сортировки
      };
    }).filter((pos): pos is NonNullable<typeof pos> => pos !== null);
    
    // Сортируем по X позиции (слева направо)
    positions.sort((a, b) => a.centerX - b.centerX);
    
    // Защита от горизонтальных overlaps: сдвигаем карточки вправо если нужно
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1];
      const curr = positions[i];
      
      const minDistance = CARD_WIDTH + CARD_HORIZONTAL_GAP;
      const actualDistance = curr.cardLeft - (prev.cardLeft + CARD_WIDTH);
      
      if (actualDistance < minDistance) {
        // Сдвигаем текущую карточку вправо
        curr.cardLeft = prev.cardLeft + CARD_WIDTH + CARD_HORIZONTAL_GAP;
        curr.centerX = curr.cardLeft + CARD_WIDTH / 2;
      }
    }
    
    return positions;
  }, [bucketLayout.items, notesMap, scrollYear, geometry, rowTop, rowHeight]);
  
  // Overflow indicators (интерактивные)
  const overflowIndicators = useMemo(() => {
    const bucketSizeYears = zoomLevel === 'in' ? 1 : zoomLevel === 'mid' ? 5 : 25;
    
    return Array.from(bucketLayout.overflowCounts.entries())
      .filter(([bucketIndex]) => !expandedBuckets.has(bucketIndex)) // Показываем только нерасширенные
      .map(([bucketIndex, count]) => {
        // Находим год для bucket (приблизительно)
        const bucketCenterYear = bucketIndex * bucketSizeYears + bucketSizeYears / 2;
        const centerX = yearToScreenX(bucketCenterYear, scrollYear, geometry);
        
        // Y позиция - на уровне последней видимой карточки в stack
        const baseY = rowTop + rowHeight - CARD_BOTTOM_MARGIN - CARD_HEIGHT;
        const indicatorTop = baseY - 2 * (CARD_HEIGHT + CARD_GAP); // на уровне 3-й карточки
        
        return {
          bucketIndex,
          count,
          centerX,
          indicatorTop,
        };
      });
  }, [bucketLayout.overflowCounts, scrollYear, geometry, rowTop, rowHeight, zoomLevel, expandedBuckets]);
  
  // Обработчик клика по overflow indicator
  const handleOverflowClick = (bucketIndex: number) => {
    setExpandedBuckets(prev => {
      const next = new Set(prev);
      if (next.has(bucketIndex)) {
        next.delete(bucketIndex);
      } else {
        next.add(bucketIndex);
      }
      return next;
    });
  };
  
  return (
    <div 
      className="absolute left-0 right-0 pointer-events-none overflow-visible" 
      style={{ 
        top: `${rowTop}px`, 
        height: `${rowHeight}px`,
      }}
    >
      {/* Карточки */}
      {/* КРИТИЧНО: Позиционирование происходит ТОЛЬКО через wrapper div */}
      {cardPositions.map(({ note, cardLeft, cardTop }) => {
        const isFocused = note.id === focusedNoteId;
        const isHovered = note.id === hoveredNoteId;
        const isRelated = relatedNoteIds.has(note.id);
        const isDimmed = (focusMode || hoveredNoteId !== null) && !isFocused && !isHovered && !isRelated;
        
        // Legacy layout для совместимости с TimelineCard
        // КРИТИЧНО: TimelineCard НЕ использует layout для позиционирования
        const legacyLayout = {
          id: note.id,
          year: note.timeline?.displayYear ?? 0,
          startYear: note.timeline?.startYear ?? 0,
          endYear: note.timeline?.endYear ?? 0,
          type: note.type || 'note',
          priority: 0,
          laneIndex: 0,
          viewX: 0,
          viewY: 0,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
        };
        
        return (
          <div
            key={note.id}
            className="absolute pointer-events-auto"
            style={{
              left: `${cardLeft}px`,
              top: `${cardTop}px`,
              width: `${CARD_WIDTH}px`,
              height: `${CARD_HEIGHT}px`,
            }}
          >
            <TimelineCard
              note={note}
              layout={legacyLayout}
              onClick={onCardClick}
              onHover={onCardHover}
              isFocused={isFocused}
              isHovered={isHovered}
              isRelated={isRelated}
              isDimmed={isDimmed}
            />
          </div>
        );
      })}
      
      {/* Overflow indicators (интерактивные) */}
      {overflowIndicators.map(({ bucketIndex, count, centerX, indicatorTop }) => (
        <div
          key={`overflow-${bucketIndex}`}
          className={cn(
            "absolute pointer-events-auto cursor-pointer",
            "bg-primary/80 text-primary-foreground text-xs font-mono px-2 py-1 rounded-full shadow-sm",
            "flex items-center justify-center",
            "hover:bg-primary hover:scale-105 transition-all"
          )}
          style={{
            left: `${centerX}px`,
            top: `${indicatorTop}px`,
            transform: 'translateX(-50%)',
            minWidth: '40px',
            height: '24px',
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleOverflowClick(bucketIndex);
          }}
          title={`Еще ${count} заметок. Кликните чтобы развернуть.`}
        >
          +{count}
        </div>
      ))}
    </div>
  );
}

