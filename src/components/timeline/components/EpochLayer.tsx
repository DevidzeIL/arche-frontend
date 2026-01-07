/**
 * EpochLayer - Слой отображения эпох
 * Виртуализация: рендерит только видимые сегменты эпох
 */

import { useMemo } from 'react';
import { TimelineGeometry, getVisibleYearRange } from '../core/projection';
import { yearToScreenX } from '../core/projection';
import { Epoch } from '../types';

interface EpochLayerProps {
  epochs: Epoch[];
  scrollYear: number; // состояние камеры
  geometry: TimelineGeometry;
}

export function EpochLayer({ epochs, scrollYear, geometry }: EpochLayerProps) {
  // КРИТИЧНО: EpochLayer рендерится в RowsArea (фон за строками)
  // Эпохи должны покрывать всю высоту RowsArea
  
  // Вычисляем видимый диапазон
  const visibleRange = useMemo(() => 
    getVisibleYearRange(scrollYear, geometry, 0.2),
    [scrollYear, geometry]
  );
  
  // Фильтруем и вычисляем видимые сегменты эпох
  const visibleEpochs = useMemo(() => {
    return epochs
      .map(epoch => {
        // Вычисляем пересечение эпохи с видимым диапазоном
        const visibleStart = Math.max(epoch.startYear, visibleRange.startYear);
        const visibleEnd = Math.min(epoch.endYear, visibleRange.endYear);
        
        // Пропускаем эпохи вне видимой области
        if (visibleEnd < visibleRange.startYear || visibleStart > visibleRange.endYear) {
          return null;
        }
        
        const startX = yearToScreenX(visibleStart, scrollYear, geometry);
        const endX = yearToScreenX(visibleEnd, scrollYear, geometry);
        const width = endX - startX;
        
        // Пропускаем слишком узкие сегменты
        if (width < 1) return null;
        
        return {
          ...epoch,
          visibleStart,
          visibleEnd,
          startX,
          endX,
          width,
        };
      })
      .filter((epoch): epoch is NonNullable<typeof epoch> => epoch !== null);
  }, [epochs, visibleRange, scrollYear, geometry]);
  
  return (
    <div className="absolute left-0 right-0 top-0 bottom-0 pointer-events-none w-full">
      {visibleEpochs.map((epoch) => (
        <div
          key={epoch.name}
          className="absolute top-0 bottom-0 bg-accent/5 border-r border-border/10"
          style={{
            left: `${epoch.startX}px`,
            width: `${epoch.width}px`,
          }}
        >
          {/* Название эпохи (только если достаточно широкая) */}
          {geometry.pxPerYear < 2 && epoch.width > 200 && (
            <div 
              className="absolute left-4 text-sm font-serif text-muted-foreground/60 select-none pointer-events-none"
              style={{
                top: '20px',
              }}
            >
              {epoch.name}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

