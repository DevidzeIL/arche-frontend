/**
 * TimeRuler - Apple-quality Semantic Rows + Progressive Disclosure Timeline
 * КРИТИЧНО: Geometry НЕ содержит scrollYear, используется yearToScreenX для проекции
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useArcheStore } from '@/arche/state/store';
import { TimelineFilters } from './TimelineFilters';
import { TimelineMiniMap } from './TimelineMiniMap';
import { ConnectionLines } from './ConnectionLines';
import { TimelineNavButtons } from './components';
import { RulerLayer } from './components/RulerLayer';
import { EpochLayer } from './components/EpochLayer';
import { DensityLayer } from './components/DensityLayer';
import { RowsLayer } from './components/RowsLayer';
import { useTimelineGeometry } from './hooks/useTimelineGeometry';
import { ScrollController } from './ScrollController';
import { ZoomLevel, FilterState, Epoch } from './types';
import {
  enrichAllNotes,
  generateSnapPoints,
  filterByLOD,
} from './utils';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { clampScrollYear, ScrollClampParams, getMinScrollYear, getMaxScrollYear } from './utils/scrollClamp';
import { yearToScreenX } from './core/projection';
import { RowKey } from './utils/rowTypes';
import { findPreviousNoteInRow, findNextNoteInRow } from './utils/rowNavigation';
import { CAMERA_LIMITS } from '@/arche/graph/cameraLimits';

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
  
  // Camera state (scrollYear - отдельно от Geometry)
  const [scrollYear, setScrollYear] = useState(initialYear);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(initialZoom);
  const [filters, setFilters] = useState<FilterState>({
    types: [],
    domains: [],
    statuses: [],
  });
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [activeRowKey, setActiveRowKey] = useState<RowKey | null>(null);
  
  // Geometry (НЕ содержит scrollYear!)
  const { geometry, containerRef } = useTimelineGeometry({
    startYear: START_YEAR,
    endYear: END_YEAR,
    zoomLevel,
  });
  
  // Обогащаем заметки временными данными
  const timelineNotes = useMemo(() => {
    return enrichAllNotes(notes);
  }, [notes]);
  
  // Фильтрация по типам и доменам
  const filteredNotes = useMemo(() => {
    let result = timelineNotes;
    
    if (filters.types.length > 0) {
      result = result.filter(note => filters.types.includes(note.type || ''));
    }
    
    if (filters.domains.length > 0) {
      result = result.filter(note => {
        if (!note.domain || note.domain.length === 0) return false;
        return note.domain.some(d => filters.domains.includes(d));
      });
    }
    
    result = filterByLOD(result, zoomLevel);
    
    return result;
  }, [timelineNotes, filters, zoomLevel]);
  
  // Ограничения скролла по годам записей (используются только для подсказок, миникарты и автофокуса, не для clamp)
  // КРИТИЧНО: clamp теперь использует hard limits из CAMERA_LIMITS, а не эти значения
  // Удалены minYear/maxYear так как они не используются (clamp использует hard limits)

  // Scroll controller (snap)
  const [scrollController, setScrollController] = useState<ScrollController | null>(null);

  const snapPoints = useMemo(() => {
    return generateSnapPoints(filteredNotes);
  }, [filteredNotes]);

  // Параметры для правильного clamp scrollYear (center-based камера)
  // КРИТИЧНО: Теперь использует hard limits вместо minYear/maxYear из данных
  // minYear/maxYear используются только для подсказок и автофокуса, но не для ограничения камеры
  const scrollClampParams = useMemo<ScrollClampParams>(() => {
    return {
      viewportWidth: geometry.viewportWidth,
      pxPerYear: geometry.pxPerYear,
      // minYear/maxYear оставлены для обратной совместимости, но не используются в clamp
      minYear: START_YEAR,
      maxYear: END_YEAR,
    };
  }, [geometry.viewportWidth, geometry.pxPerYear]);
  
  useEffect(() => {
    const controller = new ScrollController(
      (newYear: number) => {
        // Ограничиваем scrollYear правильными границами для center-based камеры
        // Теперь использует hard limits с overscroll
        const constrainedYear = clampScrollYear(newYear, scrollClampParams);
        setScrollYear(constrainedYear);
      },
      { enabled: true, threshold: 10, strength: 0.7 },
      snapPoints
    );
    
    setScrollController(controller);
    
    return () => {
      controller.destroy();
    };
  }, [snapPoints, scrollClampParams]);
  
  // Обработка скролла колёсиком
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    scrollController?.handleWheel(e.deltaY, scrollClampParams);
  }, [scrollController, scrollClampParams]);
  
  // Синхронизация с URL (debounced)
  const updateURL = useDebouncedCallback((year: number, zoom: ZoomLevel) => {
    setSearchParams({
      year: Math.round(year).toString(),
      zoom,
    });
  }, 500);

  useEffect(() => {
    updateURL(scrollYear, zoomLevel);
  }, [scrollYear, zoomLevel, updateURL]);

  // Dev-log для отладки camera limits (только в dev режиме)
  useEffect(() => {
    if (import.meta.env.DEV) {
      const minAllowed = getMinScrollYear(scrollClampParams);
      const maxAllowed = getMaxScrollYear(scrollClampParams);
      const isNearMin = Math.abs(scrollYear - minAllowed) < 10;
      const isNearMax = Math.abs(scrollYear - maxAllowed) < 10;
      
      if (isNearMin || isNearMax) {
        console.log('[Camera Debug]', {
          scrollYear: Math.round(scrollYear),
          minAllowed: Math.round(minAllowed),
          maxAllowed: Math.round(maxAllowed),
          hardLimits: {
            min: CAMERA_LIMITS.minYearHard,
            max: CAMERA_LIMITS.maxYearHard,
          },
          overscroll: CAMERA_LIMITS.overscrollYears,
          nearEdge: isNearMin ? 'min' : isNearMax ? 'max' : null,
        });
      }
    }
  }, [scrollYear, scrollClampParams]);
  
  // Клик по карточке
  const handleCardClick = useCallback((noteId: string) => {
    if (focusMode && focusedNoteId === noteId) {
      setFocusMode(false);
      setFocusedNoteId(null);
      onNoteClick?.(noteId);
    } else {
      setFocusedNoteId(noteId);
      setFocusMode(true);
      
      const note = filteredNotes.find(n => n.id === noteId);
      if (note) {
        // Ограничиваем позицию правильными границами для center-based камеры
        // Теперь использует hard limits с overscroll
        const targetYear = note.timeline.displayYear;
        const constrainedYear = clampScrollYear(targetYear, scrollClampParams);
        scrollController?.setTargetPosition(constrainedYear, false);
      }
    }
  }, [focusMode, focusedNoteId, filteredNotes, onNoteClick, scrollController, scrollClampParams]);
  
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
    
    targetNote.links?.forEach(linkTitle => {
      const linkedNote = timelineNotes.find(n => n.title === linkTitle);
      if (linkedNote && linkedNote.id !== targetId) {
        related.add(linkedNote.id);
      }
    });
    
    timelineNotes.forEach(note => {
      if (note.id !== targetId && note.links?.includes(targetNote.title)) {
        related.add(note.id);
      }
    });
    
    return related;
  }, [focusedNoteId, hoveredNoteId, timelineNotes]);
  
  // Навигация с учетом активной строки
  const sortedNotes = useMemo(() => {
    return [...filteredNotes].sort((a, b) => a.timeline.displayYear - b.timeline.displayYear);
  }, [filteredNotes]);
  
  const previousNote = useMemo(() => 
    findPreviousNoteInRow(sortedNotes, scrollYear, activeRowKey),
    [sortedNotes, scrollYear, activeRowKey]
  );
  
  const nextNote = useMemo(() => 
    findNextNoteInRow(sortedNotes, scrollYear, activeRowKey),
    [sortedNotes, scrollYear, activeRowKey]
  );
  
  const navigateToPrevious = useCallback(() => {
    if (previousNote) {
      const targetYear = previousNote.timeline.displayYear;
      const constrainedYear = clampScrollYear(targetYear, scrollClampParams);
      scrollController?.setTargetPosition(constrainedYear, false);
    }
  }, [previousNote, scrollController, scrollClampParams]);

  const navigateToNext = useCallback(() => {
    if (nextNote) {
      const targetYear = nextNote.timeline.displayYear;
      const constrainedYear = clampScrollYear(targetYear, scrollClampParams);
      scrollController?.setTargetPosition(constrainedYear, false);
    }
  }, [nextNote, scrollController, scrollClampParams]);
  
  // Обработчик клика по строке
  const handleRowClick = useCallback((rowKey: RowKey) => {
    if (activeRowKey === rowKey) {
      setActiveRowKey(null); // Снимаем выделение
    } else {
      setActiveRowKey(rowKey);
    }
  }, [activeRowKey]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focusMode) {
        exitFocusMode();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusMode, exitFocusMode]);
  
  return (
    <div className="flex flex-col h-full w-full max-w-none bg-background relative" style={{ width: '100vw' }}>
      {/* Фильтры */}
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
      
      {/* Основная область - СЛОИ */}
      {/* КРИТИЧНО: Разделение на RowsArea (верх) и TrackArea (низ) */}
      <div
        ref={containerRef}
        className={`flex-1 relative w-full ${focusMode ? 'z-20' : 'z-0'}`}
        onWheel={handleWheel}
        style={{ width: `${geometry.viewportWidth}px` }}
      >
        {/* RowsArea - верхняя зона для семантических строк */}
        <div 
          className="absolute left-0 right-0 overflow-visible"
          style={{
            top: 0,
            height: `${geometry.cardsAreaHeight}px`,
          }}
        >
          {/* LAYER 0: Epochs (фон за строками) */}
          <EpochLayer epochs={DEFAULT_EPOCHS} scrollYear={scrollYear} geometry={geometry} />
          
          {/* LAYER 1: Semantic Rows (маркеры + карточки) */}
          <RowsLayer
            notes={filteredNotes}
            scrollYear={scrollYear}
            geometry={geometry}
            zoomLevel={zoomLevel}
            activeRowKey={activeRowKey}
            focusedNoteId={focusedNoteId}
            hoveredNoteId={hoveredNoteId}
            relatedNoteIds={relatedNoteIds}
            focusMode={focusMode}
            onCardClick={handleCardClick}
            onCardHover={handleCardHover}
            onRowClick={handleRowClick}
          />
          
          {/* LAYER 2: Connection lines (в focus mode) */}
          {focusMode && focusedNoteId && (
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
              <ConnectionLines
                focusedNote={filteredNotes.find(n => n.id === focusedNoteId)!}
                relatedNotes={filteredNotes.filter(n => 
                  relatedNoteIds.has(n.id) && n.id !== focusedNoteId
                )}
                yearToPixel={(year) => yearToScreenX(year, scrollYear, geometry)}
                containerWidth={geometry.viewportWidth}
              />
            </div>
          )}
        </div>
        
        {/* TrackArea - нижняя зона для линейки/трека */}
        <div 
          className="absolute left-0 right-0 overflow-hidden"
          style={{
            top: `${geometry.cardsAreaHeight}px`,
            height: `${geometry.trackAreaHeight}px`,
          }}
        >
          {/* LAYER 0: Ruler (полноэкранная линейка) */}
          <RulerLayer scrollYear={scrollYear} geometry={geometry} />
          
          {/* LAYER 1: Global density markers (под линейкой) */}
          <DensityLayer notes={filteredNotes} scrollYear={scrollYear} geometry={geometry} />
        </div>
        
        {/* LAYER 3: Navigation buttons (поверх всего) */}
        <TimelineNavButtons
          onPrevious={navigateToPrevious}
          onNext={navigateToNext}
          hasPrevious={previousNote !== null}
          hasNext={nextNote !== null}
        />
      </div>
      
      {/* Мини-карта с индикаторами плотности */}
      <TimelineMiniMap
        startYear={START_YEAR}
        endYear={END_YEAR}
        currentPosition={scrollYear}
        visibleRangeWidth={geometry.viewportWidth / geometry.pxPerYear}
        epochs={DEFAULT_EPOCHS}
        notes={filteredNotes}
        onPositionChange={(year) => {
          const constrainedYear = clampScrollYear(year, scrollClampParams);
          scrollController?.setTargetPosition(constrainedYear, false);
        }}
        onBinClick={(startYear, endYear) => {
          const midYear = (startYear + endYear) / 2;
          const constrainedYear = clampScrollYear(midYear, scrollClampParams);
          scrollController?.setTargetPosition(constrainedYear, true);
        }}
      />
    </div>
  );
}
