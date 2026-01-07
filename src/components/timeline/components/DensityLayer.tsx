/**
 * DensityLayer - Слой отображения плотности данных на линейке
 * Показывает тонкие серые полоски/точки под линейкой для визуализации наличия данных
 */

import { useMemo } from 'react';
import { TimelineGeometry } from '../core/projection';
import { TimelineNote } from '../types';
import { yearToScreenX } from '../core/projection';

interface DensityLayerProps {
  notes: TimelineNote[];
  scrollYear: number; // состояние камеры
  geometry: TimelineGeometry;
}

export function DensityLayer({ notes, scrollYear, geometry }: DensityLayerProps) {
  // Вычисляем bins для всей временной шкалы (O(n) - один проход)
  const densityBins = useMemo(() => {
    const numBins = Math.min(400, Math.floor(geometry.viewportWidth / 2));
    const binSize = (geometry.endYear - geometry.startYear) / numBins;
    
    const bins: Array<{ startYear: number; endYear: number; count: number }> = [];
    
    // Инициализируем все bins
    for (let i = 0; i < numBins; i++) {
      bins.push({
        startYear: geometry.startYear + i * binSize,
        endYear: geometry.startYear + (i + 1) * binSize,
        count: 0,
      });
    }
    
    // Один проход по заметкам (O(n))
    notes.forEach(note => {
      const noteYear = note.timeline?.displayYear ?? 0;
      if (noteYear < geometry.startYear || noteYear >= geometry.endYear) return;
      
      const binIndex = Math.floor((noteYear - geometry.startYear) / binSize);
      if (binIndex >= 0 && binIndex < numBins) {
        bins[binIndex].count++;
      }
    });
    
    // Фильтруем только bins с данными
    return bins.filter(bin => bin.count > 0);
  }, [notes, geometry]);
  
  // Находим максимальное количество для нормализации
  const maxCount = useMemo(() => {
    return Math.max(...densityBins.map(b => b.count), 1);
  }, [densityBins]);
  
  // Вычисляем видимый диапазон для виртуализации
  const visibleRange = useMemo(() => {
    const viewportYears = geometry.viewportWidth / geometry.pxPerYear;
    const buffer = viewportYears * 0.3; // 30% buffer
    
    return {
      startYear: scrollYear - viewportYears / 2 - buffer,
      endYear: scrollYear + viewportYears / 2 + buffer,
    };
  }, [scrollYear, geometry]);
  
  // Фильтруем только видимые bins
  const visibleBins = useMemo(() => {
    return densityBins.filter(bin => 
      bin.endYear >= visibleRange.startYear && bin.startYear <= visibleRange.endYear
    );
  }, [densityBins, visibleRange]);
  
  // КРИТИЧНО: DensityLayer рендерится в Track Area (нижняя зона)
  return (
    <div className="absolute left-0 right-0 pointer-events-none" style={{ bottom: '2px', height: '4px' }}>
      {visibleBins.map((bin, index) => {
        const startX = yearToScreenX(bin.startYear, scrollYear, geometry);
        const endX = yearToScreenX(bin.endYear, scrollYear, geometry);
        const width = Math.max(1, endX - startX);
        
        // Пропускаем bins вне экрана
        if (endX < -10 || startX > geometry.viewportWidth + 10) return null;
        
        // Нормализуем высоту и прозрачность
        const normalizedCount = bin.count / maxCount;
        const height = 2 + normalizedCount * 2; // от 2px до 4px
        const opacity = 0.2 + normalizedCount * 0.4; // от 0.2 до 0.6
        
        return (
          <div
            key={index}
            className="absolute bottom-0 bg-foreground/40"
            style={{
              left: `${startX}px`,
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

