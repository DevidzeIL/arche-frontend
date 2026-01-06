import { TimelineNote, ZoomLevel } from '../types';

/**
 * Фильтрует заметки по уровню детализации (LOD)
 */
export function filterByLOD(
  notes: TimelineNote[],
  zoomLevel: ZoomLevel
): TimelineNote[] {
  const importanceThreshold = {
    out: 0.7,  // только важные (hub, time, крупные концепции)
    mid: 0.4,  // средние и важные
    in: 0,     // все
  }[zoomLevel];
  
  return notes.filter(note => note.timeline.importance >= importanceThreshold);
}

/**
 * Вычисляет параметры отображения карточки в зависимости от расстояния
 */
export function calculateLOD(
  note: TimelineNote,
  currentZoom: ZoomLevel,
  distanceFromCenter: number
): {
  visible: boolean;
  scale: number;
  opacity: number;
} {
  // Базовая видимость по важности
  const importanceThresholds = {
    out: 0.7,
    mid: 0.4,
    in: 0,
  };
  
  if (note.timeline.importance < importanceThresholds[currentZoom]) {
    return { visible: false, scale: 0, opacity: 0 };
  }
  
  // Дистанция влияет на размер и прозрачность (fog of war)
  const maxDistance = currentZoom === 'out' ? 100 : currentZoom === 'mid' ? 50 : 20;
  const distanceRatio = Math.min(1, Math.abs(distanceFromCenter) / maxDistance);
  
  const scale = 1 - distanceRatio * 0.3; // уменьшаем до 0.7
  const opacity = 1 - distanceRatio * 0.6; // fade до 0.4
  
  return {
    visible: true,
    scale: Math.max(0.5, scale),
    opacity: Math.max(0.3, opacity),
  };
}

/**
 * Определяет, должна ли карточка отображаться при текущем zoom
 */
export function shouldShowCard(
  note: TimelineNote,
  zoomLevel: ZoomLevel,
  distanceFromCenter: number
): boolean {
  const lod = calculateLOD(note, zoomLevel, distanceFromCenter);
  return lod.visible && lod.opacity > 0.3;
}


