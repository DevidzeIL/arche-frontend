/**
 * clampCameraPan.ts - Унифицированная логика ограничения pan для force-based графов
 * 
 * Для ForceGraph2D, где нет прямой year-based проекции, ограничиваем pan в пикселях
 * на основе year bounds с учетом overscroll.
 */

import { CAMERA_LIMITS } from './cameraLimits';

export interface ClampCameraPanOptions {
  viewportWidth: number;
  viewportHeight: number;
  zoom: number; // текущий масштаб (scale)
  minYearHard?: number;
  maxYearHard?: number;
  overscrollYears?: number;
  pxPerYear?: number; // если есть year-based проекция, иначе вычисляется из данных
}

/**
 * Ограничивает pan (cameraX) для force-based графа
 * 
 * @param cameraX - текущая позиция камеры по X (в пикселях world space)
 * @param opts - параметры для вычисления границ
 * @returns ограниченная позиция камеры
 */
export function clampCameraPan(
  cameraX: number,
  opts: ClampCameraPanOptions
): number {
  const {
    viewportWidth,
    zoom,
    minYearHard = CAMERA_LIMITS.minYearHard,
    maxYearHard = CAMERA_LIMITS.maxYearHard,
    overscrollYears = CAMERA_LIMITS.overscrollYears,
    pxPerYear = 1, // по умолчанию 1px = 1 год (можно настроить)
  } = opts;

  // Вычисляем границы world space в пикселях
  // Предполагаем, что год 0 соответствует X=0 в world space
  const worldMinX = minYearHard * pxPerYear;
  const worldMaxX = maxYearHard * pxPerYear;
  const overscrollPx = overscrollYears * pxPerYear;

  // Вычисляем половину viewport в world space с учетом zoom
  const halfViewportInWorld = viewportWidth / (2 * zoom);

  // Минимальная позиция камеры: левый край viewport не должен выходить за worldMinX - overscroll
  // cameraX - halfViewportInWorld >= worldMinX - overscrollPx
  // cameraX >= worldMinX - overscrollPx + halfViewportInWorld
  const minAllowed = worldMinX - overscrollPx + halfViewportInWorld;

  // Максимальная позиция камеры: правый край viewport не должен выходить за worldMaxX + overscroll
  // cameraX + halfViewportInWorld <= worldMaxX + overscrollPx
  // cameraX <= worldMaxX + overscrollPx - halfViewportInWorld
  const maxAllowed = worldMaxX + overscrollPx - halfViewportInWorld;

  // Clamp с учетом границ
  return Math.max(minAllowed, Math.min(maxAllowed, cameraX));
}

/**
 * Аналогично для Y (если нужен вертикальный overscroll)
 */
export function clampCameraPanY(
  cameraY: number,
  opts: ClampCameraPanOptions
): number {
  // Для вертикального pan можно использовать те же принципы
  // или просто не ограничивать, если нет year-based проекции по Y
  return cameraY;
}

