import { TimelineNote, SnapPoint, SnapConfig } from '../types';

/**
 * Генерирует snap points из заметок
 */
export function generateSnapPoints(notes: TimelineNote[]): SnapPoint[] {
  const points: SnapPoint[] = [];
  
  notes.forEach(note => {
    const { timeline } = note;
    
    // Персоны: рождение и смерть
    if (note.type === 'person' && timeline.startYear) {
      points.push({
        year: timeline.startYear,
        label: `${note.title} родился`,
        importance: timeline.importance > 0.7 ? 'high' : 'medium',
        noteId: note.id,
      });
      
      if (timeline.endYear) {
        points.push({
          year: timeline.endYear,
          label: `${note.title} умер`,
          importance: 'low',
          noteId: note.id,
        });
      }
    }
    
    // Работы: публикация
    if (note.type === 'work' && timeline.startYear) {
      points.push({
        year: timeline.startYear,
        label: note.title,
        importance: timeline.importance > 0.6 ? 'high' : 'medium',
        noteId: note.id,
      });
    }
    
    // Эпохи: начало и конец
    if (note.type === 'time' && timeline.startYear && timeline.endYear) {
      points.push({
        year: timeline.startYear,
        label: `Начало: ${note.title}`,
        importance: 'high',
        noteId: note.id,
      });
      points.push({
        year: timeline.endYear,
        label: `Конец: ${note.title}`,
        importance: 'high',
        noteId: note.id,
      });
    }
    
    // Концепции и события
    if ((note.type === 'concept' || note.type === 'event') && timeline.startYear) {
      points.push({
        year: timeline.startYear,
        label: note.title,
        importance: timeline.importance > 0.5 ? 'medium' : 'low',
        noteId: note.id,
      });
    }
  });
  
  // Сортируем по году
  return points.sort((a, b) => a.year - b.year);
}

/**
 * Вычисляет snap к ближайшей значимой точке
 */
export function calculateSnap(
  targetPosition: number,
  snapPoints: SnapPoint[],
  config: SnapConfig
): number {
  if (!config.enabled || snapPoints.length === 0) {
    return targetPosition;
  }
  
  // Находим ближайший snap point
  let closestSnap: SnapPoint | null = null;
  let minDistance = Infinity;
  
  for (const snapPoint of snapPoints) {
    const distance = Math.abs(snapPoint.year - targetPosition);
    
    // Учитываем важность точки при выборе threshold
    const importanceMultiplier = 
      snapPoint.importance === 'high' ? 1.5 :
      snapPoint.importance === 'medium' ? 1.0 : 0.5;
    
    const effectiveThreshold = config.threshold * importanceMultiplier;
    
    if (distance < minDistance && distance < effectiveThreshold) {
      minDistance = distance;
      closestSnap = snapPoint;
    }
  }
  
  if (!closestSnap) {
    return targetPosition;
  }
  
  // Применяем snap с easing (чем ближе, тем сильнее притяжение)
  const snapStrength = config.strength * (1 - minDistance / config.threshold);
  return lerp(targetPosition, closestSnap.year, snapStrength);
}

/**
 * Линейная интерполяция
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Находит ближайший snap point для отображения подсказки
 */
export function findNearestSnapPoint(
  year: number,
  snapPoints: SnapPoint[],
  threshold: number = 10
): SnapPoint | null {
  let nearest: SnapPoint | null = null;
  let minDistance = threshold;
  
  for (const snapPoint of snapPoints) {
    const distance = Math.abs(snapPoint.year - year);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = snapPoint;
    }
  }
  
  return nearest;
}

