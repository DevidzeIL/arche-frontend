/**
 * timelineLayout.ts - Стабильная укладка карточек в lanes
 * Гарантирует отсутствие "прыжков" при скролле/зуме
 */

import { TimelineGeometry, yearToViewX, laneToViewY, roundToDevicePixel } from './timelineMath';
import { TimelineNote } from '../types';

export interface CardLayoutItem {
  id: string;
  year: number;
  startYear: number;
  endYear: number;
  type: string;
  priority: number;
  
  // Computed layout
  laneIndex: number;
  viewX: number;
  viewY: number;
  width: number;
  height: number;
}

interface Lane {
  occupiedRanges: Array<{
    startYear: number;
    endYear: number;
    noteId: string;
  }>;
}

/**
 * Приоритет типов (чем выше, тем важнее)
 */
function getTypePriority(type?: string): number {
  const priorities: Record<string, number> = {
    hub: 10,
    time: 9,
    concept: 7,
    person: 5,
    work: 3,
    event: 3,
    place: 3,
    note: 1,
  };
  return priorities[type || 'note'] || 1;
}

/**
 * Проверка, свободен ли lane для размещения карточки
 * Возвращает true, если карточка НЕ пересекается с существующими
 */
function isLaneFree(
  lane: Lane,
  startYear: number,
  endYear: number,
  gapYears: number
): boolean {
  // Если lane пустой, он свободен
  if (lane.occupiedRanges.length === 0) {
    return true;
  }
  
  // Проверяем пересечение с учётом зазора
  // Карточки НЕ пересекаются, если:
  // - новая карточка заканчивается ДО начала существующей (с зазором)
  // - новая карточка начинается ПОСЛЕ конца существующей (с зазором)
  return !lane.occupiedRanges.some(range => {
    const hasOverlap = !(
      endYear + gapYears < range.startYear ||
      startYear - gapYears > range.endYear
    );
    return hasOverlap;
  });
}

/**
 * Главная функция: вычисляет стабильный layout для ВСЕХ заметок
 * ВАЖНО: вызывается один раз для всех заметок, а не только visible
 */
export function computeStableLayout(
  notes: TimelineNote[],
  geometry: TimelineGeometry
): Map<string, CardLayoutItem> {
  const layout = new Map<string, CardLayoutItem>();
  
  // 1. СТАБИЛЬНАЯ сортировка (один и тот же порядок всегда)
  const sorted = [...notes].sort((a, b) => {
    // Сначала по startYear
    if (a.timeline.startYear !== b.timeline.startYear) {
      return a.timeline.startYear - b.timeline.startYear;
    }
    
    // Затем по priority (важные выше)
    const priorityA = getTypePriority(a.type);
    const priorityB = getTypePriority(b.type);
    if (priorityA !== priorityB) {
      return priorityB - priorityA; // больший priority = выше
    }
    
    // Затем по важности timeline
    const impA = a.timeline.importance;
    const impB = b.timeline.importance;
    if (impA !== impB) {
      return impB - impA;
    }
    
    // Наконец, по id (гарантирует стабильность)
    return a.id.localeCompare(b.id);
  });
  
  // 2. Инициализируем lanes
  const lanes: Lane[] = Array.from({ length: geometry.maxLanes }, () => ({
    occupiedRanges: [],
  }));
  
  // Вычисляем зазор в годах (зависит от масштаба)
  const gapYears = geometry.cardGap / geometry.pxPerYear;
  
  // 3. Greedy lane packing
  sorted.forEach(note => {
    const startYear = note.timeline.startYear;
    const endYear = note.timeline.endYear || note.timeline.startYear;
    
    // Для карточек с одной датой добавляем ширину в годах
    const cardWidthYears = geometry.cardWidth / geometry.pxPerYear;
    const effectiveEndYear = endYear === startYear 
      ? endYear + cardWidthYears 
      : endYear;
    
    // Найти первый свободный lane
    let assignedLane = -1;
    
    for (let i = 0; i < geometry.maxLanes; i++) {
      if (isLaneFree(lanes[i], startYear, effectiveEndYear, gapYears)) {
        assignedLane = i;
        break;
      }
    }
    
    // Если все lanes заняты, используем тот, который освободится раньше
    if (assignedLane === -1) {
      // Находим lane с самым ранним окончанием последней карточки
      let earliestEnd = Infinity;
      for (let i = 0; i < geometry.maxLanes; i++) {
        if (lanes[i].occupiedRanges.length === 0) {
          assignedLane = i;
          break;
        }
        const lastRange = lanes[i].occupiedRanges[lanes[i].occupiedRanges.length - 1];
        if (lastRange.endYear < earliestEnd) {
          earliestEnd = lastRange.endYear;
          assignedLane = i;
        }
      }
    }
    
    // Занимаем lane (сортируем ranges по startYear для стабильности)
    lanes[assignedLane].occupiedRanges.push({
      startYear,
      endYear: effectiveEndYear,
      noteId: note.id,
    });
    
    // Сортируем ranges для корректной проверки пересечений
    lanes[assignedLane].occupiedRanges.sort((a, b) => a.startYear - b.startYear);
    
    // Вычисляем viewX и viewY (ОКРУГЛЯЕМ!)
    const rawViewX = yearToViewX(note.timeline.displayYear, geometry);
    const viewX = roundToDevicePixel(rawViewX, geometry.dpr);
    
    // Y позиция через единую функцию (центрирование lanes относительно трека)
    const viewY = laneToViewY(assignedLane, geometry);
    
    layout.set(note.id, {
      id: note.id,
      year: note.timeline.displayYear,
      startYear: note.timeline.startYear,
      endYear: note.timeline.endYear || note.timeline.startYear,
      type: note.type || 'note',
      priority: getTypePriority(note.type),
      laneIndex: assignedLane,
      viewX,
      viewY,
      width: geometry.cardWidth,
      height: 160, // фиксированная высота карточки
    });
  });
  
  return layout;
}

/**
 * Фильтрация layout по видимому диапазону (для рендеринга)
 */
export function filterVisibleCards(
  layout: Map<string, CardLayoutItem>,
  geometry: TimelineGeometry,
  bufferPx: number = 400 // buffer за краями экрана
): CardLayoutItem[] {
  const visible: CardLayoutItem[] = [];
  
  const minX = -bufferPx;
  const maxX = geometry.viewportWidth + bufferPx;
  
  layout.forEach(item => {
    // Проверяем, попадает ли карточка в видимую область
    const cardLeft = item.viewX - item.width / 2;
    const cardRight = item.viewX + item.width / 2;
    
    if (cardRight >= minX && cardLeft <= maxX) {
      visible.push(item);
    }
  });
  
  return visible;
}

/**
 * Обновление координат при изменении геометрии (без изменения lanes!)
 */
export function updateLayoutCoordinates(
  layout: Map<string, CardLayoutItem>,
  newGeometry: TimelineGeometry
): Map<string, CardLayoutItem> {
  const updated = new Map<string, CardLayoutItem>();
  
  layout.forEach((item, id) => {
    // Пересчитываем только X и Y, lane остаётся прежним
    const viewX = roundToDevicePixel(
      yearToViewX(item.year, newGeometry),
      newGeometry.dpr
    );
    const viewY = laneToViewY(item.laneIndex, newGeometry);
    
    updated.set(id, {
      ...item,
      viewX,
      viewY,
    });
  });
  
  return updated;
}

