/**
 * timelineMath.ts - Единая система координат для Timeline
 * Устраняет субпиксельные артефакты и нестабильность позиционирования
 */

export interface TimelineGeometry {
  // World space (виртуальные координаты)
  startYear: number;
  endYear: number;
  totalYears: number;
  
  // View space (экранные координаты)
  viewportWidth: number;
  viewportHeight: number;
  scrollYear: number; // текущая позиция скролла в годах
  pxPerYear: number; // масштаб (зависит от zoom)
  
  // Layout constants
  trackBaselineY: number; // фиксированная Y центральной линии
  laneHeight: number; // высота одной полосы
  maxLanes: number; // максимум полос
  cardWidth: number; // ширина карточки
  cardGap: number; // отступ между карточками
  
  // Device
  dpr: number; // devicePixelRatio для pixel-perfect рендеринга
}

/**
 * Округление до device pixel (устраняет субпиксельные артефакты)
 */
export function roundToDevicePixel(px: number, dpr: number = window.devicePixelRatio): number {
  return Math.round(px * dpr) / dpr;
}

/**
 * Offset для 1px hairline на Retina дисплеях
 */
export function hairlineOffset(dpr: number = window.devicePixelRatio): number {
  // На 2x/3x дисплеях сдвигаем на 0.5px для чёткости 1px линий
  return dpr >= 2 ? 0.5 / dpr : 0;
}

/**
 * Конвертация year → screen pixel X
 * ЕДИНСТВЕННАЯ функция для вычисления X-координат
 * Исправлено: начало линейки (startYear) всегда в начале окна (x=0) при scrollYear = startYear
 */
export function yearToViewX(
  year: number,
  geometry: TimelineGeometry
): number {
  // 1. World coordinate (относительно startYear)
  const worldX = (year - geometry.startYear) * geometry.pxPerYear;
  
  // 2. Apply scroll (scrollYear - startYear = смещение от начала)
  const scrollOffset = (geometry.scrollYear - geometry.startYear) * geometry.pxPerYear;
  
  // 3. viewX = worldX - scrollOffset (начало линейки всегда в начале окна)
  const viewX = worldX - scrollOffset;
  
  // 4. Round to device pixel
  return roundToDevicePixel(viewX, geometry.dpr);
}

/**
 * Обратная конвертация: screen pixel X → year
 */
export function viewXToYear(
  viewX: number,
  geometry: TimelineGeometry
): number {
  const scrollOffset = (geometry.scrollYear - geometry.startYear) * geometry.pxPerYear;
  const worldX = viewX + scrollOffset;
  return geometry.startYear + worldX / geometry.pxPerYear;
}

/**
 * Вычисление Y-координаты для lane
 * Lanes располагаются ВЫШЕ трека, идут вверх
 */
export function laneToViewY(
  laneIndex: number,
  geometry: TimelineGeometry
): number {
  // Lanes идут вверх от трека
  // laneIndex 0 = ближайший к треку, laneIndex max = самый дальний
  const offsetFromTrack = (laneIndex + 1) * geometry.laneHeight;
  const y = geometry.trackBaselineY - offsetFromTrack;
  
  return roundToDevicePixel(y, geometry.dpr);
}

/**
 * Вычисление видимого диапазона лет (для виртуализации)
 */
export function getVisibleYearRange(
  geometry: TimelineGeometry,
  bufferRatio: number = 0.2 // 20% buffer за краями экрана
): { startYear: number; endYear: number } {
  const viewportYears = geometry.viewportWidth / geometry.pxPerYear;
  const buffer = viewportYears * bufferRatio;
  
  return {
    startYear: Math.floor(geometry.scrollYear - viewportYears / 2 - buffer),
    endYear: Math.ceil(geometry.scrollYear + viewportYears / 2 + buffer),
  };
}

/**
 * Вычисление шага меток (ticks) в зависимости от масштаба
 */
export function calculateTickStep(pxPerYear: number): number {
  if (pxPerYear < 0.5) return 500; // очень далёкий zoom
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
 * Генерация меток времени с правильными координатами
 */
export interface TickMark {
  year: number;
  viewX: number;
  label: string;
  isMajor: boolean; // каждая 100 лет или смена эпохи
}

export function generateTicks(
  geometry: TimelineGeometry,
  visibleRange: { startYear: number; endYear: number }
): TickMark[] {
  const step = calculateTickStep(geometry.pxPerYear);
  const ticks: TickMark[] = [];
  
  // Округляем startYear до ближайшего шага
  const firstYear = Math.ceil(visibleRange.startYear / step) * step;
  
  for (let year = firstYear; year <= visibleRange.endYear; year += step) {
    const viewX = yearToViewX(year, geometry);
    
    // Пропускаем тики вне экрана
    if (viewX < -50 || viewX > geometry.viewportWidth + 50) continue;
    
    ticks.push({
      year,
      viewX,
      label: formatTickLabel(year, step),
      isMajor: year % 100 === 0 || year === 0,
    });
  }
  
  return ticks;
}

/**
 * Форматирование года для метки
 */
function formatTickLabel(year: number, step: number): string {
  if (year < 0) {
    return `${Math.abs(year)} до н.э.`;
  }
  
  // Для крупного шага показываем века
  if (step >= 100 && year % 100 === 0) {
    const century = Math.floor(year / 100) + 1;
    return `${century} век`;
  }
  
  return year.toString();
}

/**
 * Вычисление pxPerYear из ZoomLevel
 */
export function zoomLevelToPxPerYear(
  zoomLevel: 'out' | 'mid' | 'in',
  viewportWidth: number,
  totalYears: number
): number {
  // Базовый масштаб: весь временной диапазон влезает в 3 экрана
  const basePxPerYear = (viewportWidth * 3) / totalYears;
  
  const multipliers = {
    out: 0.3,  // 10x zoom out
    mid: 1.0,  // базовый
    in: 3.0,   // 3x zoom in
  };
  
  return basePxPerYear * multipliers[zoomLevel];
}

/**
 * Создание геометрии из параметров
 */
export function createGeometry(params: {
  startYear: number;
  endYear: number;
  viewportWidth: number;
  viewportHeight: number;
  scrollYear: number;
  zoomLevel: 'out' | 'mid' | 'in';
}): TimelineGeometry {
  const totalYears = params.endYear - params.startYear;
  const pxPerYear = zoomLevelToPxPerYear(params.zoomLevel, params.viewportWidth, totalYears);
  
  // Трек внизу экрана (80px от низа)
  const trackY = params.viewportHeight - 80;
  
  return {
    startYear: params.startYear,
    endYear: params.endYear,
    totalYears,
    viewportWidth: params.viewportWidth,
    viewportHeight: params.viewportHeight,
    scrollYear: params.scrollYear,
    pxPerYear,
    trackBaselineY: roundToDevicePixel(trackY),
    laneHeight: 180, // уменьшена высота для размещения сверху
    maxLanes: 5,
    cardWidth: 320,
    cardGap: 40,
    dpr: window.devicePixelRatio,
  };
}

