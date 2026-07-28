import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MapLayout, Camera } from './mapLayout';
import { worldXToScreen, screenXToYear } from './mapLayout';
import {
  renderMap,
  readThemeColors,
  AXIS_HEIGHT,
  type Epoch,
  type MapVisualState,
  type ThemeColors,
} from './mapRender';

const MIN_PX_PER_YEAR = 0.05;
const MAX_PX_PER_YEAR = 60;
const HIT_RADIUS = 12;

interface MapCanvasProps {
  layout: MapLayout;
  camera: Camera;
  onCameraChange: (camera: Camera) => void;
  epochs: Epoch[];
  visual: MapVisualState;
  onHover: (nodeId: string | null) => void;
  onSelect: (nodeId: string | null) => void;
  /** Двойной клик — открыть заметку */
  onOpen: (nodeId: string) => void;
  /** Размер области рисования — нужен родителю, чтобы вписать камеру в данные */
  onViewportChange?: (size: { width: number; height: number }) => void;
}

export function MapCanvas({
  layout,
  camera,
  onCameraChange,
  epochs,
  visual,
  onHover,
  onSelect,
  onOpen,
  onViewportChange,
}: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrollY, setScrollY] = useState(0);
  const [colors, setColors] = useState<ThemeColors | null>(null);

  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    startCenterYear: number;
    startScrollY: number;
    moved: boolean;
  } | null>(null);

  // Размер канваса
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const next = { width: Math.round(width), height: Math.round(height) };
      setSize(next);
      onViewportChange?.(next);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [onViewportChange]);

  // Цвета темы: перечитываем при смене класса на <html>
  useEffect(() => {
    const update = () => setColors(readThemeColors(document.documentElement));
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const maxScrollY = Math.max(0, layout.contentHeight - (size.height - AXIS_HEIGHT));
  const clampedScrollY = Math.min(scrollY, maxScrollY);

  // Рисуем
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !colors || size.width === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    renderMap({
      ctx,
      width: size.width,
      height: size.height,
      scrollY: clampedScrollY,
      camera,
      layout,
      epochs,
      colors,
      visual,
    });
  }, [size, camera, layout, epochs, colors, visual, clampedScrollY]);

  /** Ближайший узел под курсором: сначала точка, затем область подписи */
  const hitTest = useCallback(
    (clientX: number, clientY: number): string | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      if (py > size.height - AXIS_HEIGHT) return null;

      let bestId: string | null = null;
      let bestDistance = HIT_RADIUS;

      for (const item of layout.nodes) {
        const x = worldXToScreen(item.worldX, camera, size.width);
        const y = item.y - clampedScrollY;
        if (Math.abs(y - py) > HIT_RADIUS) continue;

        const dx = px - x;
        const dy = py - y;
        const distance = Math.hypot(dx, dy);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = item.node.id;
          continue;
        }

        // Подпись тоже кликабельна — в неё целиться проще, чем в точку
        if (item.labeled && bestId === null) {
          const labelStart = x + item.radius + 4;
          const labelEnd = labelStart + item.labelWidth;
          if (px >= labelStart && px <= labelEnd && Math.abs(dy) <= 9) {
            bestId = item.node.id;
          }
        }
      }

      return bestId;
    },
    [layout, camera, size, clampedScrollY]
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();

      // Горизонтальный жест трекпада или Shift — панорамирование по времени
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        const deltaYears = (event.deltaX || event.deltaY) / camera.pxPerYear;
        onCameraChange({ ...camera, centerYear: camera.centerYear + deltaYears });
        return;
      }

      // Обычная прокрутка — зум вокруг курсора, чтобы год под ним не уезжал
      const cursorX = event.clientX - rect.left;
      const yearUnderCursor = screenXToYear(cursorX, camera, size.width);
      const factor = Math.exp(-event.deltaY * 0.0015);
      const nextPxPerYear = Math.min(
        MAX_PX_PER_YEAR,
        Math.max(MIN_PX_PER_YEAR, camera.pxPerYear * factor)
      );

      const offsetFromCenter = cursorX - size.width / 2;
      onCameraChange({
        pxPerYear: nextPxPerYear,
        centerYear: yearUnderCursor - offsetFromCenter / nextPxPerYear,
      });
    },
    [camera, onCameraChange, size.width]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCenterYear: camera.centerYear,
      startScrollY: clampedScrollY,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;

    if (drag?.active && drag.pointerId === event.pointerId) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;

      if (Math.hypot(dx, dy) > 3) drag.moved = true;

      onCameraChange({ ...camera, centerYear: drag.startCenterYear - dx / camera.pxPerYear });
      setScrollY(Math.min(maxScrollY, Math.max(0, drag.startScrollY - dy)));
      return;
    }

    onHover(hitTest(event.clientX, event.clientY));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;

    // Перетаскивание не должно превращаться в выбор узла
    if (drag.moved) return;
    onSelect(hitTest(event.clientX, event.clientY));
  };

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block touch-none select-none"
        style={{ cursor: visual.hoveredId ? 'pointer' : 'grab' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => onHover(null)}
        onDoubleClick={(event) => {
          const id = hitTest(event.clientX, event.clientY);
          if (id) onOpen(id);
        }}
      />
    </div>
  );
}
