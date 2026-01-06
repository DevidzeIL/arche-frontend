/**
 * TimeRuler - Pixel-perfect Timeline с единой геометрией
 * Устраняет все проблемы позиционирования и дрожания
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useArcheStore } from '@/arche/state/store';
import { TimelineFilters } from './TimelineFilters';
import { TimelineMiniMap } from './TimelineMiniMap';
import { ConnectionLines } from './ConnectionLines';
import { TimelineTrack, TimelineCard, TimelineNavigation, TimelineNavButtons } from './components';
import { useTimelineGeometry, useStableLayout } from './hooks';
import { ScrollController } from './ScrollController';
import { ZoomLevel, FilterState, Epoch } from './types';
import {
  enrichAllNotes,
  generateSnapPoints,
  filterByLOD,
} from './utils';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';

const DEFAULT_EPOCHS: Epoch[] = [
  { name: 'Античность', startYear: -800, endYear: 500 },
  { name: 'Средневековье', startYear: 500, endYear: 1400 },
  { name: 'Возрождение', startYear: 1400, endYear: 1600 },
  { name: 'Новое время', startYear: 1600, endYear: 1800 },
  { name: 'Предмодерн', startYear: 1800, endYear: 1900 },
  { name: 'Модернизм', startYear: 1900, endYear: 1950 },
  { name: 'Постмодерн', startYear: 1950, endYear: 2025 },
];

const START_YEAR = -800;
const END_YEAR = 2025;

interface TimeRulerProps {
  onNoteClick?: (noteId: string) => void;
}

export function TimeRuler({ onNoteClick }: TimeRulerProps) {
  const notes = useArcheStore((state) => state.notes);
  
  // URL state
  const [searchParams, setSearchParams] = useSearchParams();
  const initialYear = parseInt(searchParams.get('year') || '1900', 10);
  const initialZoom = (searchParams.get('zoom') || 'mid') as ZoomLevel;
  
  // State
  const [currentPosition, setCurrentPosition] = useState(initialYear);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(initialZoom);
  const [filters, setFilters] = useState<FilterState>({
    types: [],
    domains: [],
    statuses: [],
  });
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  
  // Геометрия (СТАБИЛЬНАЯ через ResizeObserver)
  const { geometry, containerRef } = useTimelineGeometry({
    startYear: START_YEAR,
    endYear: END_YEAR,
    scrollYear: currentPosition,
    zoomLevel,
  });
  
  // Обогащаем заметки временными данными
  const timelineNotes = useMemo(() => {
    return enrichAllNotes(notes);
  }, [notes]);
  
  // Фильтрация по типам и доменам
  const filteredNotes = useMemo(() => {
    let result = timelineNotes;
    
    // Фильтр по типам
    if (filters.types.length > 0) {
      result = result.filter(note => filters.types.includes(note.type || ''));
    }
    
    // Фильтр по доменам
    if (filters.domains.length > 0) {
      result = result.filter(note => {
        if (!note.domain || note.domain.length === 0) return false;
        return note.domain.some(d => filters.domains.includes(d));
      });
    }
    
    // LOD фильтрация
    result = filterByLOD(result, zoomLevel);
    
    return result;
  }, [timelineNotes, filters, zoomLevel]);
  
  // Ограничения скролла по годам записей
  const minYear = useMemo(() => {
    if (filteredNotes.length === 0) return START_YEAR;
    return Math.min(...filteredNotes.map(n => n.timeline.displayYear));
  }, [filteredNotes]);
  
  const maxYear = useMemo(() => {
    if (filteredNotes.length === 0) return END_YEAR;
    return Math.max(...filteredNotes.map(n => n.timeline.displayYear));
  }, [filteredNotes]);
  
  // Стабильный layout (НЕ пересчитывается при скролле!)
  const { visibleCards } = useStableLayout(filteredNotes, geometry);
  
  // Scroll controller (snap)
  const [scrollController, setScrollController] = useState<ScrollController | null>(null);
  
  const snapPoints = useMemo(() => {
    return generateSnapPoints(filteredNotes);
  }, [filteredNotes]);
  
  useEffect(() => {
    const controller = new ScrollController(
      setCurrentPosition,
      { enabled: true, threshold: 10, strength: 0.7 },
      snapPoints
    );
    
    setScrollController(controller);
    
    return () => {
      controller.destroy();
    };
  }, [snapPoints]);
  
  // Обработка скролла колёсиком
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    scrollController?.handleWheel(e.deltaY, minYear, maxYear);
  }, [scrollController, minYear, maxYear]);
  
  // Синхронизация с URL (debounced)
  const updateURL = useDebouncedCallback((year: number, zoom: ZoomLevel) => {
    setSearchParams({
      year: Math.round(year).toString(),
      zoom,
    });
  }, 500);
  
  useEffect(() => {
    updateURL(currentPosition, zoomLevel);
  }, [currentPosition, zoomLevel, updateURL]);
  
  // Клик по карточке
  const handleCardClick = useCallback((noteId: string) => {
    if (focusMode && focusedNoteId === noteId) {
      // Выход из focus mode
      setFocusMode(false);
      setFocusedNoteId(null);
      onNoteClick?.(noteId);
    } else {
      // Вход в focus mode
      setFocusedNoteId(noteId);
      setFocusMode(true);
      
      // Центрируем на карточке
      const note = filteredNotes.find(n => n.id === noteId);
      if (note) {
        scrollController?.setTargetPosition(note.timeline.displayYear, false);
      }
    }
  }, [focusMode, focusedNoteId, filteredNotes, onNoteClick, scrollController]);
  
  // Hover карточки
  const handleCardHover = useCallback((noteId: string | null) => {
    if (!focusMode) {
      setHoveredNoteId(noteId);
    }
  }, [focusMode]);
  
  // Выход из focus mode
  const exitFocusMode = useCallback(() => {
    setFocusMode(false);
    setFocusedNoteId(null);
  }, []);
  
  // Связанные заметки
  const relatedNoteIds = useMemo(() => {
    const targetId = focusedNoteId || hoveredNoteId;
    if (!targetId) return new Set<string>();
    
    const targetNote = timelineNotes.find(n => n.id === targetId);
    if (!targetNote) return new Set<string>();
    
    const related = new Set<string>();
    
    // Ищем заметки, на которые ссылается targetNote
    targetNote.links?.forEach(linkTitle => {
      const linkedNote = timelineNotes.find(n => n.title === linkTitle);
      if (linkedNote && linkedNote.id !== targetId) {
        related.add(linkedNote.id);
      }
    });
    
    // Ищем заметки, которые ссылаются на targetNote
    timelineNotes.forEach(note => {
      if (note.id !== targetId && note.links?.includes(targetNote.title)) {
        related.add(note.id);
      }
    });
    
    return related;
  }, [focusedNoteId, hoveredNoteId, timelineNotes]);
  
  // Навигация по ближайшим карточкам (все записи, не только видимые)
  const allSortedNotes = useMemo(() => {
    return [...filteredNotes].sort((a, b) => a.timeline.displayYear - b.timeline.displayYear);
  }, [filteredNotes]);
  
  // Находим ближайшие записи к текущей позиции
  const findNearestNotes = useCallback(() => {
    const currentYear = currentPosition;
    
    // Находим ближайшую запись слева (раньше по времени)
    let previousNote = null;
    for (let i = allSortedNotes.length - 1; i >= 0; i--) {
      if (allSortedNotes[i].timeline.displayYear < currentYear) {
        previousNote = allSortedNotes[i];
        break;
      }
    }
    
    // Находим ближайшую запись справа (позже по времени)
    let nextNote = null;
    for (let i = 0; i < allSortedNotes.length; i++) {
      if (allSortedNotes[i].timeline.displayYear > currentYear) {
        nextNote = allSortedNotes[i];
        break;
      }
    }
    
    return { previousNote, nextNote };
  }, [currentPosition, allSortedNotes]);
  
  const { previousNote, nextNote } = useMemo(() => findNearestNotes(), [findNearestNotes]);
  
  const navigateToPrevious = useCallback(() => {
    if (previousNote) {
      scrollController?.setTargetPosition(previousNote.timeline.displayYear, false);
    }
  }, [previousNote, scrollController]);
  
  const navigateToNext = useCallback(() => {
    if (nextNote) {
      scrollController?.setTargetPosition(nextNote.timeline.displayYear, false);
    }
  }, [nextNote, scrollController]);
  
  // Для focus mode навигация
  const sortedVisibleCards = useMemo(() => {
    return [...visibleCards].sort((a, b) => a.year - b.year);
  }, [visibleCards]);
  
  const currentCardIndex = useMemo(() => {
    if (!focusedNoteId) return -1;
    return sortedVisibleCards.findIndex(card => card.id === focusedNoteId);
  }, [focusedNoteId, sortedVisibleCards]);
  
  const navigateToPreviousInFocus = useCallback(() => {
    if (currentCardIndex > 0) {
      const prevCard = sortedVisibleCards[currentCardIndex - 1];
      handleCardClick(prevCard.id);
    }
  }, [currentCardIndex, sortedVisibleCards, handleCardClick]);
  
  const navigateToNextInFocus = useCallback(() => {
    if (currentCardIndex < sortedVisibleCards.length - 1) {
      const nextCard = sortedVisibleCards[currentCardIndex + 1];
      handleCardClick(nextCard.id);
    }
  }, [currentCardIndex, sortedVisibleCards, handleCardClick]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focusMode) {
        exitFocusMode();
      }
      
      if (focusMode) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          navigateToPreviousInFocus();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          navigateToNextInFocus();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusMode, exitFocusMode, navigateToPreviousInFocus, navigateToNextInFocus]);
  
  return (
    <div className="flex flex-col h-full w-full bg-background relative">
      {/* Фильтры - фиксированные под навигацией */}
      <div className="sticky z-30 bg-background/95 backdrop-blur-sm border-b border-border/30">
        <TimelineFilters
          filters={filters}
          onFiltersChange={setFilters}
          zoomLevel={zoomLevel}
          onZoomChange={setZoomLevel}
        />
      </div>
      
      {/* Focus mode overlay */}
      {focusMode && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-10 cursor-pointer"
          onClick={exitFocusMode}
          style={{ pointerEvents: 'auto' }}
        >
          <div className="absolute top-4 right-4 text-sm text-muted-foreground">
            Press <kbd className="px-2 py-1 bg-muted rounded text-foreground">Esc</kbd> to exit
          </div>
        </div>
      )}
      
      {/* Основная область - РАЗДЕЛЕНА НА СЛОИ */}
      <div
        ref={containerRef}
        className={`flex-1 relative overflow-hidden ${focusMode ? 'z-20' : 'z-0'}`}
        onWheel={handleWheel}
      >
        {/* Кнопки навигации к ближайшим записям */}
        <TimelineNavButtons
          onPrevious={navigateToPrevious}
          onNext={navigateToNext}
          hasPrevious={previousNote !== null}
          hasNext={nextNote !== null}
        />
        
        {/* LAYER 1: Background + Track (pointer-events: none) */}
        <TimelineTrack geometry={geometry} epochs={DEFAULT_EPOCHS} />
        
        {/* LAYER 2: Cards (pointer-events: auto на каждой карточке) */}
        {visibleCards.map((layoutItem) => {
          const note = filteredNotes.find(n => n.id === layoutItem.id);
          if (!note) return null;
          
          const isFocused = note.id === focusedNoteId;
          const isHovered = note.id === hoveredNoteId;
          const isRelated = relatedNoteIds.has(note.id);
          
          // ИСПРАВЛЕНО: затемняем только если есть focus/hover и карточка НЕ является ни focused, ни hovered, ни related
          const isDimmed = (focusMode || hoveredNoteId !== null) && !isFocused && !isHovered && !isRelated;
          
          return (
            <TimelineCard
              key={note.id}
              note={note}
              layout={layoutItem}
              onClick={handleCardClick}
              onHover={handleCardHover}
              isFocused={isFocused}
              isHovered={isHovered}
              isRelated={isRelated}
              isDimmed={isDimmed}
              focusMode={focusMode}
            />
          );
        })}
        
        {/* LAYER 0: Connection lines (под карточками, pointer-events: none) */}
        {focusMode && focusedNoteId && (
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
            <ConnectionLines
              focusedNote={filteredNotes.find(n => n.id === focusedNoteId)!}
              relatedNotes={filteredNotes.filter(n => 
                relatedNoteIds.has(n.id) && n.id !== focusedNoteId
              )}
              yearToPixel={(year) => {
                const worldX = (year - START_YEAR) * geometry.pxPerYear;
                const scrollOffset = (geometry.scrollYear - START_YEAR) * geometry.pxPerYear;
                return worldX - scrollOffset;
              }}
              containerWidth={geometry.viewportWidth}
            />
          </div>
        )}
      </div>
      
      {/* Навигация по карточкам (в focus mode) */}
      {focusMode && currentCardIndex >= 0 && (
        <TimelineNavigation
          onPrevious={navigateToPreviousInFocus}
          onNext={navigateToNextInFocus}
          hasPrevious={currentCardIndex > 0}
          hasNext={currentCardIndex < sortedVisibleCards.length - 1}
          currentIndex={currentCardIndex}
          totalCount={sortedVisibleCards.length}
        />
      )}
      
      {/* Мини-карта */}
      <TimelineMiniMap
        startYear={START_YEAR}
        endYear={END_YEAR}
        currentPosition={currentPosition}
        visibleRangeWidth={geometry.viewportWidth / geometry.pxPerYear}
        epochs={DEFAULT_EPOCHS}
        onPositionChange={(year) => scrollController?.setTargetPosition(year, false)}
      />
    </div>
  );
}
