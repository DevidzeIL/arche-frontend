/**
 * clampCameraYear.ts - Унифицированная логика ограничения камеры для year-based проекции
 * 
 * Правильная формула для center-based камеры:
 * - scrollYear = год в центре экрана
 * - Чтобы край экрана не выходил за hard limits, нужно учитывать halfRange
 */

import { CAMERA_LIMITS } from './cameraLimits';

export interface ClampCameraYearOptions {
  viewportWidth: number;
  pxPerYear: number;
  minYearHard?: number;
  maxYearHard?: number;
  overscrollYears?: number;
}

/**
 * Ограничивает scrollYear правильными границами для center-based камеры
 * с учетом hard limits и overscroll
 * 
 * @param targetYear - целевой год (scrollYear, год в центре экрана)
 * @param opts - параметры для вычисления границ
 * @returns ограниченный год
 */
export function clampCameraYear(
  targetYear: number,
  opts: ClampCameraYearOptions
): number {
  const {
    viewportWidth,
    pxPerYear,
    minYearHard = CAMERA_LIMITS.minYearHard,
    maxYearHard = CAMERA_LIMITS.maxYearHard,
    overscrollYears = CAMERA_LIMITS.overscrollYears,
  } = opts;

  // Вычисляем сколько лет видно на экране
  const yearsPerScreen = viewportWidth / pxPerYear;
  const halfRange = yearsPerScreen / 2;

  // Минимальный scrollYear: левый край экрана не должен выходить за minYearHard - overscroll
  // scrollYear - halfRange >= minYearHard - overscrollYears
  // scrollYear >= minYearHard - overscrollYears + halfRange
  const minAllowed = minYearHard - overscrollYears + halfRange;

  // Максимальный scrollYear: правый край экрана не должен выходить за maxYearHard + overscroll
  // scrollYear + halfRange <= maxYearHard + overscrollYears
  // scrollYear <= maxYearHard + overscrollYears - halfRange
  const maxAllowed = maxYearHard + overscrollYears - halfRange;

  // Clamp с учетом границ
  return Math.max(minAllowed, Math.min(maxAllowed, targetYear));
}

/**
 * Вычисляет минимальный scrollYear, при котором левый край экрана виден
 */
export function getMinScrollYear(opts: ClampCameraYearOptions): number {
  const {
    viewportWidth,
    pxPerYear,
    minYearHard = CAMERA_LIMITS.minYearHard,
    overscrollYears = CAMERA_LIMITS.overscrollYears,
  } = opts;

  const yearsPerScreen = viewportWidth / pxPerYear;
  const halfRange = yearsPerScreen / 2;
  return minYearHard - overscrollYears + halfRange;
}

/**
 * Вычисляет максимальный scrollYear, при котором правый край экрана виден
 */
export function getMaxScrollYear(opts: ClampCameraYearOptions): number {
  const {
    viewportWidth,
    pxPerYear,
    maxYearHard = CAMERA_LIMITS.maxYearHard,
    overscrollYears = CAMERA_LIMITS.overscrollYears,
  } = opts;

  const yearsPerScreen = viewportWidth / pxPerYear;
  const halfRange = yearsPerScreen / 2;
  return maxYearHard + overscrollYears - halfRange;
}

