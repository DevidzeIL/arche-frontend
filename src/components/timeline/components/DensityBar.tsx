/**
 * DensityBar - Тепловая карта плотности контента на таймлайне
 * Показывает, где сконцентрированы события/заметки
 */

import { useMemo, useState, useRef, useEffect, memo } from 'react';
import { TimelineGeometry, yearToViewX } from '../core/timelineMath';
import { TimelineNote } from '../types';
import { calculateDensityBins, calculateDensityHeight, calculateDensityOpacity } from '../utils/densityUtils';
import { cn } from '@/lib/utils';

interface DensityBarProps {
  notes: TimelineNote[];
  geometry: TimelineGeometry;
  onBinClick?: (startYear: number, endYear: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const DensityBar = memo(function DensityBar({ notes, geometry, onBinClick, className, style }: DensityBarProps) {
  const [hoveredBinIndex, setHoveredBinIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Вычисляем bins
  const bins = useMemo(() => {
    const numBins = Math.min(300, Math.floor(geometry.viewportWidth / 3));
    return calculateDensityBins(notes, geometry, numBins);
  }, [notes, geometry]);
  
  // Находим максимальное количество для нормализации
  const maxCount = useMemo(() => {
    return Math.max(...bins.map(b => b.count), 1);
  }, [bins]);
  
  // Вычисляем визуальные параметры для каждого bin
  const visualBins = useMemo(() => {
    return bins.map((bin, index) => {
      const startX = yearToViewX(bin.startYear, geometry);
      const endX = yearToViewX(bin.endYear, geometry);
      const width = endX - startX;
      
      // Пропускаем bins вне экрана
      if (endX < -50 || startX > geometry.viewportWidth + 50) {
        return null;
      }
      
      const height = calculateDensityHeight(bin.count, maxCount);
      const opacity = calculateDensityOpacity(bin.count, maxCount);
      
      return {
        index,
        bin,
        startX,
        width,
        height,
        opacity,
      };
    }).filter(Boolean);
  }, [bins, geometry, maxCount]);
  
  // Обработка hover
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    // Находим bin под курсором
    const hoveredBin = visualBins.find(vb => 
      vb && x >= vb.startX && x < vb.startX + vb.width
    );
    
    setHoveredBinIndex(hoveredBin ? hoveredBin.index : null);
  };
  
  const handleMouseLeave = () => {
    setHoveredBinIndex(null);
  };
  
  const handleClick = () => {
    if (hoveredBinIndex === null || !onBinClick) return;
    
    const bin = bins[hoveredBinIndex];
    if (bin && bin.count > 0) {
      onBinClick(bin.startYear, bin.endYear);
    }
  };
  
  return (
    <div
      ref={containerRef}
      className={cn(
        'absolute left-0 right-0 w-full pointer-events-auto',
        onBinClick && 'cursor-pointer',
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{ height: '20px', ...style }}
    >
      {/* Density bars */}
      {visualBins.map(vb => {
        if (!vb || vb.height === 0) return null;
        
        const isHovered = vb.index === hoveredBinIndex;
        
        return (
          <div
            key={vb.index}
            className={cn(
              'absolute bottom-0 bg-foreground transition-all duration-150',
              isHovered && 'bg-primary'
            )}
            style={{
              left: `${vb.startX}px`,
              width: `${Math.max(vb.width, 1)}px`,
              height: `${vb.height}px`,
              opacity: isHovered ? 0.8 : vb.opacity,
            }}
          />
        );
      })}
      
      {/* Tooltip */}
      {hoveredBinIndex !== null && bins[hoveredBinIndex].count > 0 && (
        <DensityTooltip
          bin={bins[hoveredBinIndex]}
        />
      )}
    </div>
  );
});

interface DensityTooltipProps {
  bin: { startYear: number; endYear: number; count: number; items: TimelineNote[] };
}

function DensityTooltip({ bin }: DensityTooltipProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);
  
  // Форматируем годы
  const formatYear = (year: number) => {
    if (year < 0) return `${Math.abs(year)} до н.э.`;
    return year.toString();
  };
  
  const startLabel = formatYear(Math.floor(bin.startYear));
  const endLabel = formatYear(Math.floor(bin.endYear));
  
  return (
    <div
      className="fixed z-[100] bg-popover border border-border rounded-md px-3 py-2 text-xs shadow-lg pointer-events-none"
      style={{
        left: `${position.x + 12}px`,
        top: `${position.y + 12}px`,
      }}
    >
      <div className="font-medium mb-1">
        {startLabel} — {endLabel}
      </div>
      <div className="text-muted-foreground">
        {bin.count} {bin.count === 1 ? 'запись' : bin.count < 5 ? 'записи' : 'записей'}
      </div>
    </div>
  );
}

