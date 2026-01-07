/**
 * projection.ts - Чистые проекционные функции для конвертации year ↔ screen X
 * КРИТИЧНО: Geometry НЕ содержит scrollYear - это отдельное состояние Camera
 */

import { CARD_WIDTH, TRACK_AREA_HEIGHT } from '../constants';

export interface TimelineGeometry {
  // World space (неизменяемые параметры)
  startYear: number;
  endYear: number;
  totalYears: number;
  
  // View space (размеры viewport)
  viewportWidth: number; // реальная ширина viewport (100vw)
  viewportHeight: number;
  pxPerYear: number; // масштаб (зависит от zoom)
  
  // Layout constants (не зависят от scroll)
  trackBaselineY: number;
  trackAreaHeight: number; // высота области трека/линейки (нижняя зона)
  cardsAreaTop: number; // верхняя граница области карточек
  cardsAreaHeight: number; // высота области карточек (верхняя зона)
  laneHeight: number;
  maxLanes: number;
  cardWidth: number;
  cardGap: number;
  
  // Device
  dpr: number;
}

/**
 * Проекция: год → экранная координата X
 * КРИТИЧНО: scrollYear передается отдельно (это состояние Camera, не Geometry)
 */
export function yearToScreenX(
  year: number,
  scrollYear: number, // состояние камеры
  geometry: TimelineGeometry
): number {
  // Центр экрана всегда viewportWidth/2
  const centerX = geometry.viewportWidth / 2;
  
  // Смещение года относительно центра камеры
  const offsetYears = year - scrollYear;
  const offsetPx = offsetYears * geometry.pxPerYear;
  
  // Экранная координата
  const screenX = centerX + offsetPx;
  
  return Math.round(screenX * geometry.dpr) / geometry.dpr; // pixel-perfect
}

/**
 * Обратная проекция: экранная координата X → год
 */
export function screenXToYear(
  screenX: number,
  scrollYear: number, // состояние камеры
  geometry: TimelineGeometry
): number {
  const centerX = geometry.viewportWidth / 2;
  const offsetPx = screenX - centerX;
  const offsetYears = offsetPx / geometry.pxPerYear;
  return scrollYear + offsetYears;
}

/**
 * Вычисление видимого диапазона лет (для виртуализации)
 */
export function getVisibleYearRange(
  scrollYear: number,
  geometry: TimelineGeometry,
  bufferRatio: number = 0.2
): { startYear: number; endYear: number } {
  const viewportYears = geometry.viewportWidth / geometry.pxPerYear;
  const buffer = viewportYears * bufferRatio;
  
  return {
    startYear: Math.floor(scrollYear - viewportYears / 2 - buffer),
    endYear: Math.ceil(scrollYear + viewportYears / 2 + buffer),
  };
}

/**
 * Вычисление шага меток в зависимости от масштаба
 */
export function calculateTickStep(pxPerYear: number): number {
  if (pxPerYear < 0.5) return 500;
  if (pxPerYear < 1) return 200;
  if (pxPerYear < 2) return 100;
  if (pxPerYear < 4) return 50;
  if (pxPerYear < 8) return 20;
  if (pxPerYear < 14) return 10;
  if (pxPerYear < 30) return 5;
  if (pxPerYear < 60) return 2;
  return 1;
}

/**
 * Вычисление pxPerYear из ZoomLevel
 */
export function zoomLevelToPxPerYear(
  zoomLevel: 'out' | 'mid' | 'in',
  viewportWidth: number,
  totalYears: number
): number {
  const basePxPerYear = (viewportWidth * 3) / totalYears;
  
  const multipliers = {
    out: 0.3,
    mid: 1.0,
    in: 3.0,
  };
  
  return basePxPerYear * multipliers[zoomLevel];
}

/**
 * Создание геометрии (БЕЗ scrollYear - это состояние Camera)
 */
export function createGeometry(params: {
  startYear: number;
  endYear: number;
  viewportWidth: number;
  viewportHeight: number;
  zoomLevel: 'out' | 'mid' | 'in';
}): TimelineGeometry {
  const totalYears = params.endYear - params.startYear;
  const pxPerYear = zoomLevelToPxPerYear(params.zoomLevel, params.viewportWidth, totalYears);
  
  // Разделение на две зоны:
  // 1) Cards Area (верхняя, для карточек) - занимает всё пространство кроме трека
  // 2) Track Area (нижняя, для линейки/трека) - фиксированная высота
  const trackY = params.viewportHeight - TRACK_AREA_HEIGHT;
  const cardsAreaTop = 0;
  const cardsAreaHeight = params.viewportHeight - TRACK_AREA_HEIGHT;
  
  return {
    startYear: params.startYear,
    endYear: params.endYear,
    totalYears,
    viewportWidth: params.viewportWidth,
    viewportHeight: params.viewportHeight,
    pxPerYear,
    trackBaselineY: Math.round(trackY + TRACK_AREA_HEIGHT / 2), // центр области трека
    trackAreaHeight: TRACK_AREA_HEIGHT,
    cardsAreaTop,
    cardsAreaHeight,
    laneHeight: 180,
    maxLanes: 5,
    cardWidth: CARD_WIDTH,
    cardGap: 40,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
  };
}

