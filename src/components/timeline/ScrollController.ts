import { SnapConfig, SnapPoint } from './types';
import { calculateSnap } from './utils';
import { clampScrollYear, ScrollClampParams } from './utils/scrollClamp';

/**
 * Контроллер скролла с инерцией и snap
 */
export class ScrollController {
  private velocity = 0;
  private position = 0;
  private targetPosition = 0;
  private isDragging = false;
  private lastTimestamp = 0;
  private friction = 0.92;
  private animationFrameId: number | null = null;
  
  constructor(
    private onPositionChange: (position: number) => void,
    private snapConfig: SnapConfig,
    private snapPoints: SnapPoint[] = []
  ) {
    this.startAnimation();
  }
  
  /**
   * Обновляет snap points
   */
  updateSnapPoints(snapPoints: SnapPoint[]): void {
    this.snapPoints = snapPoints;
  }
  
  /**
   * Обработка скролла колёсиком мыши
   * Использует правильный clamp для center-based камеры
   */
  handleWheel(deltaY: number, clampParams?: ScrollClampParams): void {
    // Конвертируем delta в изменение позиции (года)
    const yearsDelta = deltaY * 0.1; // настройка чувствительности
    let newTarget = this.targetPosition + yearsDelta;
    
    // Ограничиваем скролл правильными границами для center-based камеры
    if (clampParams) {
      newTarget = clampScrollYear(newTarget, clampParams);
    }
    
    this.targetPosition = newTarget;
    this.velocity = yearsDelta * 0.5; // добавляем инерцию
  }
  
  /**
   * Начало драга
   * @param initialPosition - начальная позиция в годах (опционально)
   */
  handleDragStart(initialPosition?: number): void {
    this.isDragging = true;
    this.velocity = 0;
    if (initialPosition !== undefined) {
      this.targetPosition = initialPosition;
      this.position = initialPosition;
    }
  }
  
  /**
   * Процесс драга
   * @param deltaX - изменение в пикселях по X
   * @param pxPerYear - пикселей на год для конвертации
   * @param clampParams - параметры для ограничения позиции (опционально)
   */
  handleDrag(deltaX: number, pxPerYear?: number, clampParams?: ScrollClampParams): void {
    if (!this.isDragging) return;
    
    // Конвертируем пиксели в годы
    const pxToYearRatio = pxPerYear ? 1 / pxPerYear : 0.05;
    const yearsDelta = -deltaX * pxToYearRatio; // минус: свайп вправо = камера в прошлое
    
    let newTarget = this.targetPosition + yearsDelta;
    
    // Применяем clamp если передан
    if (clampParams) {
      newTarget = clampScrollYear(newTarget, clampParams);
    }
    
    this.targetPosition = newTarget;
    this.position = this.targetPosition; // Мгновенное обновление при драге
  }
  
  /**
   * Конец драга с установкой скорости для инерции
   * @param velocityYearsPerMs - скорость в годах на миллисекунду
   */
  handleDragEnd(velocityYearsPerMs?: number): void {
    this.isDragging = false;
    if (velocityYearsPerMs !== undefined) {
      this.velocity = velocityYearsPerMs * 16; // конвертируем в годы на кадр (при 60fps)
    }
  }
  
  /**
   * Установить скорость для инерции (в годах на миллисекунду)
   */
  setVelocity(velocityYearsPerMs: number): void {
    this.velocity = velocityYearsPerMs * 16; // конвертируем в годы на кадр
  }
  
  /**
   * Установить целевую позицию (для программного перемещения)
   */
  setTargetPosition(year: number, immediate: boolean = false): void {
    this.targetPosition = year;
    if (immediate) {
      this.position = year;
      this.velocity = 0;
      this.onPositionChange(this.position);
    }
  }
  
  /**
   * Получить текущую позицию
   */
  getPosition(): number {
    return this.position;
  }
  
  /**
   * Запуск анимационного цикла
   */
  private startAnimation(): void {
    const animate = (timestamp: number) => {
      if (this.lastTimestamp === 0) {
        this.lastTimestamp = timestamp;
      }
      
      this.lastTimestamp = timestamp;
      
      if (!this.isDragging) {
        // Применяем инерцию
        this.velocity *= this.friction;
        
        // Двигаемся к целевой позиции с easing
        const diff = this.targetPosition - this.position;
        this.position += diff * 0.1 + this.velocity;
        
        // Snap к значимым точкам (только если движение почти остановилось)
        if (Math.abs(this.velocity) < 0.1 && Math.abs(diff) < 0.5) {
          const snappedPosition = calculateSnap(
            this.position,
            this.snapPoints,
            this.snapConfig
          );
          
          // Плавно двигаемся к snap point
          const snapDiff = snappedPosition - this.position;
          if (Math.abs(snapDiff) > 0.01) {
            this.position += snapDiff * 0.2;
          } else {
            this.position = snappedPosition;
            this.targetPosition = snappedPosition;
          }
        }
      }
      
      this.onPositionChange(this.position);
      this.animationFrameId = requestAnimationFrame(animate);
    };
    
    this.animationFrameId = requestAnimationFrame(animate);
  }
  
  /**
   * Остановка анимационного цикла
   */
  destroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}

