/**
 * scrollClamp.ts - Правильное ограничение scrollYear для center-based камеры
 * 
 * КРИТИЧНО: Для center-based камеры scrollYear = год в центре экрана.
 * 
 * Теперь использует единую систему camera limits из @/arche/graph/cameraLimits
 * для обеспечения единообразного поведения во всех режимах графа.
 */

import { clampCameraYear, ClampCameraYearOptions } from '@/arche/graph/clampCameraYear';
import { CAMERA_LIMITS } from '@/arche/graph/cameraLimits';

export interface ScrollClampParams {
  viewportWidth: number;
  pxPerYear: number;
  minYear: number; // DEPRECATED: используется только для обратной совместимости
  maxYear: number; // DEPRECATED: используется только для обратной совместимости
}

/**
 * Вычисляет минимальный scrollYear, при котором левый край экрана виден
 * Теперь использует hard limits вместо minYear из данных
 */
export function getMinScrollYear(params: ScrollClampParams): number {
  const yearsPerScreen = params.viewportWidth / params.pxPerYear;
  const halfRange = yearsPerScreen / 2;
  return CAMERA_LIMITS.minYearHard - CAMERA_LIMITS.overscrollYears + halfRange;
}

/**
 * Вычисляет максимальный scrollYear, при котором правый край экрана виден
 * Теперь использует hard limits вместо maxYear из данных
 */
export function getMaxScrollYear(params: ScrollClampParams): number {
  const yearsPerScreen = params.viewportWidth / params.pxPerYear;
  const halfRange = yearsPerScreen / 2;
  return CAMERA_LIMITS.maxYearHard + CAMERA_LIMITS.overscrollYears - halfRange;
}

/**
 * Ограничивает scrollYear правильными границами для center-based камеры
 * Теперь использует hard limits с overscroll вместо границ данных
 */
export function clampScrollYear(
  scrollYear: number,
  params: ScrollClampParams
): number {
  const opts: ClampCameraYearOptions = {
    viewportWidth: params.viewportWidth,
    pxPerYear: params.pxPerYear,
  };
  return clampCameraYear(scrollYear, opts);
}

