/**
 * pixelSnap.ts - Утилиты для pixel-perfect рендеринга
 * Устраняют субпиксельные артефакты и дрожание
 */

const dpr = window.devicePixelRatio || 1;

/**
 * Округление до device pixel
 * Использовать для всех вычисляемых координат
 */
export function snap(value: number): number {
  return Math.round(value * dpr) / dpr;
}

/**
 * Hairline offset для 1px линий на Retina
 */
export function hairline(): number {
  return dpr >= 2 ? 0.5 / dpr : 0;
}

/**
 * Snap для inline styles
 */
export function snapStyle(
  values: Record<string, number | string>
): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'number') {
      result[key] = `${snap(value)}px`;
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Transform с pixel snapping
 */
export function snapTransform(x: number, y: number, z: number = 0): string {
  return `translate3d(${snap(x)}px, ${snap(y)}px, ${snap(z)}px)`;
}


