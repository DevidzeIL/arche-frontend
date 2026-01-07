import { useMemo } from 'react';
import { Epoch, TimelineNote } from './types';
import { cn } from '@/lib/utils';
import { calculateDensityHeight, calculateDensityOpacity } from './utils/densityUtils';

interface TimelineMiniMapProps {
  startYear: number;
  endYear: number;
  currentPosition: number;
  visibleRangeWidth: number; // в годах
  epochs: Epoch[];
  notes: TimelineNote[];
  onPositionChange: (year: number) => void;
  onBinClick?: (startYear: number, endYear: number) => void;
  className?: string;
}

export function TimelineMiniMap({
  startYear,
  endYear,
  currentPosition,
  visibleRangeWidth,
  epochs,
  notes,
  onPositionChange,
  onBinClick,
  className,
}: TimelineMiniMapProps) {
  const totalYears = endYear - startYear;

  // Конвертация года в позицию на мини-карте (проценты)
  const yearToPercent = (year: number): number => {
    return ((year - startYear) / totalYears) * 100;
  };

  // Вычисляем bins для всей временной шкалы (не только видимой области)
  const densityBins = useMemo(() => {
    // Используем фиксированное количество bins для всей шкалы
    const numBins = 200;
    const binSize = totalYears / numBins;
    
    const bins: Array<{ startYear: number; endYear: number; count: number }> = [];
    
    for (let i = 0; i < numBins; i++) {
      const binStartYear = startYear + i * binSize;
      const binEndYear = startYear + (i + 1) * binSize;
      
      // Считаем количество записей в этом диапазоне
      const count = notes.filter(note => {
        const noteYear = note.timeline?.displayYear ?? 0;
        return noteYear >= binStartYear && noteYear < binEndYear;
      }).length;
      
      if (count > 0) {
        bins.push({ startYear: binStartYear, endYear: binEndYear, count });
      }
    }
    
    return bins;
  }, [notes, startYear, endYear, totalYears]);

  // Находим максимальное количество для нормализации
  const maxCount = useMemo(() => {
    return Math.max(...densityBins.map(b => b.count), 1);
  }, [densityBins]);

  // Обработка клика по мини-карте
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = clickX / rect.width;
    const targetYear = startYear + clickRatio * totalYears;
    
    onPositionChange(targetYear);
  };

  // Текущая позиция курсора (визуальный индикатор)
  const currentPercent = yearToPercent(currentPosition);
  const rangePercent = (visibleRangeWidth / totalYears) * 100;

  return (
    <div
      className={cn(
        'relative h-16 w-full bg-card border-t border-border/30 cursor-pointer select-none',
        className
      )}
      onClick={handleClick}
    >
      {/* Эпохи на мини-карте */}
      {epochs.map((epoch) => {
        const startPercent = yearToPercent(epoch.startYear);
        const endPercent = yearToPercent(epoch.endYear);
        const widthPercent = endPercent - startPercent;

        return (
          <div
            key={epoch.name}
            className="absolute top-0 bottom-0 bg-accent/10 border-r border-border/20 hover:bg-accent/20 transition-colors"
            style={{
              left: `${startPercent}%`,
              width: `${widthPercent}%`,
            }}
            title={`${epoch.name}: ${epoch.startYear} — ${epoch.endYear}`}
          >
            {/* Название эпохи (только если достаточно широкая) */}
            {widthPercent > 10 && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <div className="text-[10px] text-muted-foreground whitespace-nowrap opacity-60">
                  {epoch.name}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Индикатор текущей позиции и видимого диапазона */}
      <div
        className="absolute top-0 bottom-0 bg-primary/20 border-x-2 border-primary/60 transition-all duration-200"
        style={{
          left: `${Math.max(0, currentPercent - rangePercent / 2)}%`,
          width: `${Math.min(100, rangePercent)}%`,
        }}
      >
        {/* Центральная линия (текущая позиция) */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary left-1/2 transform -translate-x-1/2"
        />
      </div>

      {/* Индикаторы плотности (серые блоки) */}
      <div className="absolute inset-0 pointer-events-auto">
        {densityBins.map((bin, index) => {
          const startPercent = yearToPercent(bin.startYear);
          const endPercent = yearToPercent(bin.endYear);
          const widthPercent = endPercent - startPercent;
          
          const height = calculateDensityHeight(bin.count, maxCount);
          const opacity = calculateDensityOpacity(bin.count, maxCount);
          
          return (
            <div
              key={index}
              className="absolute bottom-0 bg-foreground/40 transition-opacity hover:opacity-80 cursor-pointer"
              style={{
                left: `${startPercent}%`,
                width: `${widthPercent}%`,
                height: `${Math.max(height * 0.3, 2)}px`, // Меньшая высота для мини-карты
                opacity: opacity * 0.6, // Немного прозрачнее
              }}
              title={`${Math.floor(bin.startYear)} — ${Math.floor(bin.endYear)}: ${bin.count} ${bin.count === 1 ? 'запись' : bin.count < 5 ? 'записи' : 'записей'}`}
              onClick={(e) => {
                e.stopPropagation();
                onBinClick?.(bin.startYear, bin.endYear);
              }}
            />
          );
        })}
      </div>

      {/* Метки веков */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: Math.ceil(totalYears / 100) }, (_, i) => {
          const year = Math.ceil(startYear / 100) * 100 + i * 100;
          if (year < startYear || year > endYear) return null;

          const percent = yearToPercent(year);

          return (
            <div
              key={year}
              className="absolute top-0 bottom-0 w-px bg-border/30"
              style={{ left: `${percent}%` }}
            />
          );
        })}
      </div>

      {/* Подсказка с текущим годом */}
      <div className="absolute bottom-2 left-4 text-xs font-mono text-muted-foreground">
        {Math.round(currentPosition)}
      </div>
    </div>
  );
}


