/**
 * densityUtils.ts - Вычисление плотности контента для density marks
 */

import { TimelineNote } from '../types';
import { TimelineGeometry } from '../core/timelineMath';

export interface DensityBin {
  startYear: number;
  endYear: number;
  count: number;
  items: TimelineNote[];
}

/**
 * Разбивает временной диапазон на bins и считает количество событий в каждом
 */
export function calculateDensityBins(
  notes: TimelineNote[],
  geometry: TimelineGeometry,
  numBins: number = 200
): DensityBin[] {
  const { startYear, endYear } = geometry;
  const binSize = (endYear - startYear) / numBins;
  
  // Инициализируем bins
  const bins: DensityBin[] = Array.from({ length: numBins }, (_, i) => ({
    startYear: startYear + i * binSize,
    endYear: startYear + (i + 1) * binSize,
    count: 0,
    items: [],
  }));
  
  // Распределяем заметки по bins
  notes.forEach(note => {
    const year = note.timeline.displayYear;
    
    // Находим подходящий bin
    const binIndex = Math.floor((year - startYear) / binSize);
    
    if (binIndex >= 0 && binIndex < numBins) {
      bins[binIndex].count++;
      bins[binIndex].items.push(note);
    }
  });
  
  return bins;
}

/**
 * Вычисляет высоту density bar для bin
 */
export function calculateDensityHeight(
  count: number,
  maxCount: number,
  minHeight: number = 2,
  maxHeight: number = 16
): number {
  if (count === 0) return 0;
  if (maxCount === 0) return minHeight;
  
  // Логарифмическая шкала для лучшей визуализации
  const normalized = Math.log(count + 1) / Math.log(maxCount + 1);
  
  return minHeight + normalized * (maxHeight - minHeight);
}

/**
 * Вычисляет opacity для density bar
 */
export function calculateDensityOpacity(
  count: number,
  maxCount: number,
  minOpacity: number = 0.15,
  maxOpacity: number = 0.6
): number {
  if (count === 0) return 0;
  if (maxCount === 0) return minOpacity;
  
  const normalized = count / maxCount;
  
  return minOpacity + normalized * (maxOpacity - minOpacity);
}


