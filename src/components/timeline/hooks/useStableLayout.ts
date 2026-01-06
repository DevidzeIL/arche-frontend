/**
 * useStableLayout - Hook для вычисления стабильного layout
 * Layout НЕ меняется при скролле, только при изменении списка заметок
 */

import { useMemo } from 'react';
import { TimelineGeometry } from '../core/timelineMath';
import { TimelineNote } from '../types';
import {
  computeStableLayout,
  filterVisibleCards,
  updateLayoutCoordinates,
  CardLayoutItem,
} from '../core/timelineLayout';

export function useStableLayout(
  notes: TimelineNote[],
  geometry: TimelineGeometry
) {
  // 1. Вычисляем lane assignment (ОДИН РАЗ для всех заметок)
  const baseLayout = useMemo(() => {
    console.log('[useStableLayout] Computing base layout for', notes.length, 'notes');
    return computeStableLayout(notes, geometry);
  }, [notes]); // зависит ТОЛЬКО от notes, не от geometry!
  
  // 2. Обновляем координаты при изменении geometry (но lanes остаются!)
  const layout = useMemo(() => {
    console.log('[useStableLayout] Updating coordinates for geometry');
    return updateLayoutCoordinates(baseLayout, geometry);
  }, [baseLayout, geometry]);
  
  // 3. Фильтруем видимые карточки
  const visibleCards = useMemo(() => {
    const visible = filterVisibleCards(layout, geometry);
    console.log('[useStableLayout] Visible cards:', visible.length);
    return visible;
  }, [layout, geometry]);
  
  return {
    layout,
    visibleCards,
  };
}

