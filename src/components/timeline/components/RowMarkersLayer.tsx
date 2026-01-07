/**
 * RowMarkersLayer - Слой маркеров плотности для строки
 * Рендерит дешевые маркеры для ВСЕХ заметок в строке (не только видимых)
 * КРИТИЧНО: Маркеры должны быть заметными, чтобы пользователь видел наличие данных
 */

import { useMemo } from 'react';
import { TimelineGeometry, yearToScreenX, getVisibleYearRange } from '../core/projection';
import { TimelineNote } from '../types';
import { MARKER_HEIGHT, MARKER_BOTTOM_MARGIN } from '../constants';

interface RowMarkersLayerProps {
  notes: TimelineNote[];
  scrollYear: number;
  geometry: TimelineGeometry;
  rowTop: number;
  rowHeight: number;
}

/**
 * Вычисление density bins для заметок (O(n) - один проход)
 */
function computeDensityBins(
  notes: TimelineNote[],
  visibleRange: { startYear: number; endYear: number },
  numBins: number
): Array<{ startYear: number; endYear: number; count: number }> {
  const binSize = (visibleRange.endYear - visibleRange.startYear) / numBins;
  const bins: Array<{ startYear: number; endYear: number; count: number }> = [];
  
  // Инициализируем все bins
  for (let i = 0; i < numBins; i++) {
    bins.push({
      startYear: visibleRange.startYear + i * binSize,
      endYear: visibleRange.startYear + (i + 1) * binSize,
      count: 0,
    });
  }
  
  // Один проход по заметкам (O(n))
  notes.forEach(note => {
    const noteYear = note.timeline?.displayYear ?? 0;
    if (noteYear < visibleRange.startYear || noteYear >= visibleRange.endYear) return;
    
    const binIndex = Math.floor((noteYear - visibleRange.startYear) / binSize);
    if (binIndex >= 0 && binIndex < numBins) {
      bins[binIndex].count++;
    }
  });
  
  // Фильтруем только bins с данными
  return bins.filter(bin => bin.count > 0);
}

export function RowMarkersLayer({
  notes,
  scrollYear,
  geometry,
  rowTop,
  rowHeight,
}: RowMarkersLayerProps) {
  // Вычисляем видимый диапазон с большим буфером для маркеров
  // КРИТИЧНО: Маркеры должны показывать наличие данных даже вне видимого диапазона
  const visibleRange = useMemo(() => 
    getVisibleYearRange(scrollYear, geometry, 0.5), // Больший буфер для маркеров
    [scrollYear, geometry]
  );
  
  // Вычисляем density bins (O(n))
  // КРИТИЧНО: Используем весь видимый диапазон, не только focus window
  const densityBins = useMemo(() => {
    const numBins = Math.min(240, Math.floor(geometry.viewportWidth / 3));
    return computeDensityBins(notes, visibleRange, numBins);
  }, [notes, visibleRange, geometry.viewportWidth]);
  
  // Находим максимальное количество для нормализации
  const maxCount = useMemo(() => {
    return Math.max(...densityBins.map(b => b.count), 1);
  }, [densityBins]);
  
  // Позиция маркеров - внизу строки, с отступом
  const markerY = rowTop + rowHeight - MARKER_BOTTOM_MARGIN - MARKER_HEIGHT;
  
  return (
    <div 
      className="absolute left-0 right-0 pointer-events-none overflow-visible" 
      style={{ 
        top: `${rowTop}px`, 
        height: `${rowHeight}px`,
      }}
    >
      {densityBins.map((bin, index) => {
        const startX = yearToScreenX(bin.startYear, scrollYear, geometry);
        const endX = yearToScreenX(bin.endYear, scrollYear, geometry);
        const width = Math.max(1, endX - startX);
        
        // Пропускаем bins вне экрана (с небольшим буфером)
        if (endX < -50 || startX > geometry.viewportWidth + 50) return null;
        
        // Нормализуем высоту и прозрачность
        // КРИТИЧНО: Маркеры должны быть заметными (не слишком прозрачные)
        const normalizedCount = bin.count / maxCount;
        const height = MARKER_HEIGHT + normalizedCount * 2; // от 4px до 6px
        const opacity = 0.4 + normalizedCount * 0.4; // от 0.4 до 0.8 (более заметные)
        
        return (
          <div
            key={index}
            className="absolute bg-foreground/60 rounded-sm"
            style={{
              left: `${startX}px`,
              top: `${markerY}px`,
              width: `${width}px`,
              height: `${height}px`,
              opacity,
            }}
          />
        );
      })}
    </div>
  );
}

