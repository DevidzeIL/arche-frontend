/**
 * RulerLayer - Полноэкранная линейка времени (100vw)
 * КРИТИЧНО: Центр всегда в viewportWidth/2, использует yearToScreenX для проекции
 */

import { useMemo } from 'react';
import { TimelineGeometry, calculateTickStep, getVisibleYearRange } from '../core/projection';
import { yearToScreenX } from '../core/projection';
import { formatYear } from '../utils';
import { cn } from '@/lib/utils';

interface RulerLayerProps {
  scrollYear: number; // состояние камеры
  geometry: TimelineGeometry;
}

function formatTickLabel(year: number, step: number): string {
  if (year < 0) {
    return `${Math.abs(year)} до н.э.`;
  }
  
  if (step >= 100 && year % 100 === 0) {
    const century = Math.floor(year / 100) + 1;
    return `${century} век`;
  }
  
  return year.toString();
}

export function RulerLayer({ scrollYear, geometry }: RulerLayerProps) {
  // КРИТИЧНО: RulerLayer рендерится в Track Area (нижняя зона)
  // trackBaselineY - это центр Track Area, но мы рендерим относительно верхней границы Track Area
  const trackY = geometry.trackAreaHeight / 2; // центр Track Area относительно его верхней границы
  const centerX = geometry.viewportWidth / 2; // ✅ ВСЕГДА центр экрана
  
  // Вычисляем видимый диапазон
  const visibleRange = useMemo(() => 
    getVisibleYearRange(scrollYear, geometry),
    [scrollYear, geometry]
  );
  
  // Генерируем тики
  const ticks = useMemo(() => {
    const step = calculateTickStep(geometry.pxPerYear);
    const ticks: Array<{ year: number; x: number; isMajor: boolean; label: string }> = [];
    
    const firstYear = Math.ceil(visibleRange.startYear / step) * step;
    
    for (let year = firstYear; year <= visibleRange.endYear; year += step) {
      const x = yearToScreenX(year, scrollYear, geometry);
      
      // Пропускаем тики вне экрана
      if (x < -50 || x > geometry.viewportWidth + 50) continue;
      
      const isMajor = year % 100 === 0 || year === 0;
      
      ticks.push({
        year,
        x,
        isMajor,
        label: formatTickLabel(year, step),
      });
    }
    
    return ticks;
  }, [visibleRange, scrollYear, geometry]);
  
  return (
    <div 
      className="absolute left-0 right-0 top-0 bottom-0 pointer-events-none w-full"
      style={{ 
        width: `${geometry.viewportWidth}px`, // ✅ явная ширина viewport
      }}
    >
      {/* Центральная линия времени */}
      <div
        className="absolute top-0 bottom-0 bg-border/60"
        style={{
          left: `${centerX}px`,
          width: '1px',
        }}
      />
      
      {/* Метки времени (тики) */}
      {ticks.map((tick) => {
        const tickHeight = tick.isMajor ? 24 : 12;
        const tickTop = trackY - tickHeight / 2;
        
        return (
          <div
            key={`tick-${tick.year}`}
            className="absolute"
            style={{
              left: `${tick.x}px`,
              top: `${tickTop}px`,
              transform: 'translateX(-0.5px)', // центрирование 1px линии
            }}
          >
            {/* Вертикальная риска */}
            <div
              className={cn(
                'absolute bg-border',
                tick.isMajor ? 'opacity-70' : 'opacity-40'
              )}
              style={{
                left: '0.5px',
                width: '1px',
                height: `${tickHeight}px`,
              }}
            />
            
            {/* Лейбл года */}
            {tick.isMajor && (
              <div
                className="absolute whitespace-nowrap text-xs font-mono text-muted-foreground select-none pointer-events-none"
                style={{
                  top: `${tickHeight + 6}px`,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  letterSpacing: '0.03em',
                }}
              >
                {tick.label}
              </div>
            )}
          </div>
        );
      })}
      
      {/* Индикатор текущей позиции - ВСЕГДА ПО ЦЕНТРУ VIEWPORT */}
      <div
        className="absolute top-0 bottom-0 bg-primary/50 pointer-events-none"
        style={{
          left: `${centerX}px`,
          width: '2px',
          transform: 'translateX(-1px)',
        }}
      >
        <div
          className="absolute left-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-md text-xs font-mono whitespace-nowrap shadow-lg pointer-events-none"
          style={{
            top: `${trackY - 36}px`,
            transform: 'translate(-50%, 0)',
          }}
        >
          {formatYear(Math.round(scrollYear))}
        </div>
      </div>
    </div>
  );
}

