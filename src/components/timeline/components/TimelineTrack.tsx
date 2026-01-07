/**
 * TimelineTrack - Pixel-perfect трек с метками
 * ✅ FIX: все координаты снапнуты к device pixels
 * ✅ FIX: pointer-events: none (не перехватывает клики)
 */

import { useMemo } from 'react';
import { TimelineGeometry, generateTicks, hairlineOffset, getVisibleYearRange, yearToViewX } from '../core/timelineMath';
import { Epoch } from '../types';
import { cn } from '@/lib/utils';
import { snap } from '../utils/pixelSnap';

interface TimelineTrackProps {
  geometry: TimelineGeometry;
  epochs: Epoch[];
  className?: string;
}

export function TimelineTrack({ geometry, epochs, className }: TimelineTrackProps) {
  const dpr = geometry.dpr;
  const hairline = hairlineOffset(dpr);
  
  // Вычисляем видимый диапазон
  const visibleRange = useMemo(() => 
    getVisibleYearRange(geometry),
    [geometry]
  );
  
  // Генерируем тики
  const ticks = useMemo(() => 
    generateTicks(geometry, visibleRange),
    [geometry, visibleRange]
  );
  
  // Координата центральной линии (ЦЕЛОЕ число пикселей)
  const trackY = geometry.trackBaselineY;
  
  return (
    <div 
      className={cn('absolute left-0 right-0 top-0 bottom-0 pointer-events-none overflow-hidden w-full', className)}
      style={{ 
        willChange: 'contents' // оптимизация для анимаций
      }}
    >
      {/* Область трека с границами */}
      <div
        className="absolute left-0 right-0 bg-background/30 border-t border-b border-border/40"
        style={{
          top: `${trackY - 40}px`,
          height: '80px',
        }}
      />
      
      {/* Центральная линия времени - HAIRLINE */}
      <div
        className="absolute left-0 right-0 w-full bg-border"
        style={{
          top: `${trackY + hairline}px`,
          height: '2px',
          opacity: 0.6,
        }}
      />
      
      {/* Полосы эпох */}
      {epochs.map((epoch) => {
        const startX = yearToViewX(epoch.startYear, geometry);
        const endX = yearToViewX(epoch.endYear, geometry);
        const width = endX - startX;
        
        // Culling: не рендерим эпохи вне экрана
        if (endX < -100 || startX > geometry.viewportWidth + 100) {
          return null;
        }
        
        return (
          <div
            key={epoch.name}
            className="absolute top-0 bottom-0 bg-accent/5 border-r border-border/10"
            style={{
              left: `${snap(startX)}px`, // ← FIX: snap вместо Math.round
              width: `${snap(width)}px`,
            }}
          >
            {/* Название эпохи (только на крупном масштабе) */}
            {geometry.pxPerYear < 2 && width > 200 && (
              <div 
                className="absolute left-4 text-sm font-serif text-muted-foreground/60 select-none"
                style={{
                  top: `${snap(trackY - 40)}px`, // ← FIX: snap
                }}
              >
                {epoch.name}
              </div>
            )}
          </div>
        );
      })}
      
      {/* Метки времени (тики) */}
      {ticks.map((tick) => {
        const tickHeight = tick.isMajor ? 24 : 12;
        const tickTop = snap(trackY - tickHeight / 2); // ← FIX: snap
        
        return (
          <div
            key={`tick-${tick.year}`}
            className="absolute"
            style={{
              left: `${snap(tick.viewX)}px`, // ← FIX: snap
              top: `${tickTop}px`,
              transform: `translateX(${-hairline}px)`, // ← FIX: hairline центрирование
            }}
          >
            {/* Вертикальная риска - pixel-perfect */}
            <div
              className={cn(
                'absolute bg-border',
                tick.isMajor ? 'opacity-70' : 'opacity-40'
              )}
              style={{
                left: `${hairline}px`,
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
          left: '50%', // ВСЕГДА центр экрана
          width: '2px',
          transform: `translateX(-1px)`,
        }}
      >
        <div
          className="absolute left-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-md text-xs font-mono whitespace-nowrap shadow-lg pointer-events-none"
          style={{
            top: `${snap(trackY - 36)}px`,
            transform: 'translate(-50%, 0)',
          }}
        >
          {/* scrollYear передается отдельно */}
        </div>
      </div>
      
    </div>
  );
}

