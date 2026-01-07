/**
 * focusWindow.ts - Вычисление focus window для progressive disclosure
 */

import { ZoomLevel } from '../types';
import { TimelineGeometry } from '../core/projection';

/**
 * Размер focus window в годах в зависимости от уровня зума
 * Внутри этого окна рендерятся полные карточки, вне - только маркеры
 * КРИТИЧНО: Учитывает yearsPerScreen, чтобы окно было не меньше видимого диапазона
 */
export function getFocusWindowYears(
  zoomLevel: ZoomLevel,
  geometry?: TimelineGeometry
): number {
  // Базовые размеры по уровню зума
  let baseWindow: number;
  switch (zoomLevel) {
    case 'in':
      baseWindow = 80; // близкий зум - узкое окно
      break;
    case 'mid':
      baseWindow = 200; // средний зум - среднее окно
      break;
    case 'out':
      baseWindow = 600; // дальний зум - широкое окно
      break;
    default:
      baseWindow = 200;
  }
  
  // Если есть geometry, учитываем yearsPerScreen
  if (geometry) {
    const yearsPerScreen = geometry.viewportWidth / geometry.pxPerYear;
    // Окно должно быть минимум 1.2x от видимого диапазона
    const minWindow = yearsPerScreen * 1.2;
    return Math.max(baseWindow, minWindow);
  }
  
  return baseWindow;
}

/**
 * Проверка, находится ли год внутри focus window
 */
export function isInFocusWindow(
  noteYear: number,
  scrollYear: number,
  zoomLevel: ZoomLevel,
  geometry?: TimelineGeometry
): boolean {
  const windowSize = getFocusWindowYears(zoomLevel, geometry);
  const halfWindow = windowSize / 2;
  return Math.abs(noteYear - scrollYear) <= halfWindow;
}

/**
 * Получить границы focus window
 */
export function getFocusWindowBounds(
  scrollYear: number,
  zoomLevel: ZoomLevel,
  geometry?: TimelineGeometry
): { startYear: number; endYear: number } {
  const windowSize = getFocusWindowYears(zoomLevel, geometry);
  const halfWindow = windowSize / 2;
  
  return {
    startYear: scrollYear - halfWindow,
    endYear: scrollYear + halfWindow,
  };
}

