import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { geoOrthographic, geoPath, geoGraticule10, geoDistance } from 'd3-geo';
import { readThemeColors, type ThemeColors } from '@/components/map/mapRender';
import { worldLand } from './worldLand';
import type { Place } from '@/arche/geo';

/** Место с тем, что к нему привязано на текущий момент времени */
export interface GlobeMarker {
  place: Place;
  /** Сколько заметок уже случилось к выбранному году */
  count: number;
  /** Насыщенность 0..1 — доля от самого населённого места */
  weight: number;
}

/** Дуга «идея пришла отсюда сюда» */
export interface GlobeArc {
  fromId: string;
  toId: string;
  from: [number, number];
  to: [number, number];
  color: string;
}

interface GlobeCanvasProps {
  markers: GlobeMarker[];
  arcs: GlobeArc[];
  selectedId: string | null;
  onSelect: (placeId: string | null) => void;
  /** Крутить самостоятельно, пока никто не трогает */
  autoRotate: boolean;
}

const DRAG_SENSITIVITY = 0.25;
const AUTO_ROTATE_SPEED = 0.045;
/** Доля меньшей стороны, которую занимает шар при единичном приближении */
const FILL = 0.44;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 6;

/**
 * Стартовый разворот: центр Европы.
 *
 * Хранилище европоцентрично, и шар, повёрнутый Атлантикой или Тихим океаном,
 * встречал бы пустотой. Честнее показать сразу то, где что-то есть.
 */
const START_ROTATION: [number, number] = [-10, -45];

export function GlobeCanvas({
  markers,
  arcs,
  selectedId,
  onSelect,
  autoRotate,
}: GlobeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [colors, setColors] = useState<ThemeColors | null>(null);
  const [rotation, setRotation] = useState<[number, number]>(START_ROTATION);
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRotation: [number, number];
    moved: boolean;
  } | null>(null);

  // Щипок для приближения: на телефоне колеса нет
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ startDistance: number; startZoom: number } | null>(null);

  const zoomFitted = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });

      // На телефоне шар вписывается по узкой стороне, и Европа —
      // единственное, где что-то есть, — сжимается в неразличимое пятно.
      // Поэтому начинаем приближёнными; отдалить можно щипком.
      if (!zoomFitted.current && width > 0) {
        zoomFitted.current = true;
        if (width < 600) setZoom(1.7);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setColors(readThemeColors(document.documentElement));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Собственное вращение: останавливается, пока тянут, что-то выбрано
  // или шар приближен — приблизили значит рассматривают, и уводить обзор
  // из-под рук нельзя
  useEffect(() => {
    if (!autoRotate || zoom > 1.2) return;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      if (!dragRef.current) {
        setRotation(([lambda, phi]) => [lambda + (delta * AUTO_ROTATE_SPEED) / 16, phi]);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autoRotate, zoom]);

  const radius = Math.min(size.width, size.height) * FILL * zoom;

  const project = useCallback(() => {
    return geoOrthographic()
      .translate([size.width / 2, size.height / 2])
      .scale(radius)
      .rotate([rotation[0], rotation[1]])
      .clipAngle(90);
  }, [size.width, size.height, radius, rotation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !colors || size.width === 0 || radius <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const projection = project();
    const path = geoPath(projection, ctx);
    const cx = size.width / 2;
    const cy = size.height / 2;

    // Мягкое свечение вокруг шара — граница между планетой и пустотой
    const halo = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius * 1.16);
    halo.addColorStop(0, 'rgba(122, 162, 247, 0.16)');
    halo.addColorStop(1, 'rgba(122, 162, 247, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.16, 0, Math.PI * 2);
    ctx.fill();

    // Океан
    ctx.beginPath();
    path({ type: 'Sphere' });
    const ocean = ctx.createRadialGradient(
      cx - radius * 0.35,
      cy - radius * 0.35,
      radius * 0.1,
      cx,
      cy,
      radius
    );
    ocean.addColorStop(0, 'rgba(122, 162, 247, 0.20)');
    ocean.addColorStop(1, 'rgba(122, 162, 247, 0.05)');
    ctx.fillStyle = ocean;
    ctx.fill();

    // Сетка параллелей и меридианов
    ctx.beginPath();
    path(geoGraticule10());
    ctx.strokeStyle = colors.border;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Суша
    ctx.beginPath();
    path(worldLand());
    ctx.fillStyle = colors.foreground;
    ctx.globalAlpha = 0.14;
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = colors.foreground;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Край шара
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    /** Точка на обратной стороне шара не рисуется */
    const centre: [number, number] = [-rotation[0], -rotation[1]];
    const visible = (coords: [number, number]) => geoDistance(coords, centre) < Math.PI / 2;

    // Дуги влияния: рисуем под точками, чтобы не забивали их
    for (const arc of arcs) {
      if (!visible(arc.from) && !visible(arc.to)) continue;
      ctx.beginPath();
      path({ type: 'LineString', coordinates: [arc.from, arc.to] });
      ctx.strokeStyle = arc.color;
      ctx.globalAlpha = selectedId ? 0.75 : 0.4;
      ctx.lineWidth = selectedId ? 1.6 : 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Сначала считаем положение всех точек, и только потом расставляем
    // подписи. В один проход подпись не знала бы о точках, которые будут
    // нарисованы после неё, и ложилась бы прямо на них.
    const placed = markers
      .map((marker) => {
        const coords: [number, number] = [marker.place.geo.lon, marker.place.geo.lat];
        if (!visible(coords)) return null;
        const point = projection(coords);
        if (!point) return null;

        const isSelected = marker.place.id === selectedId;
        const isHovered = marker.place.id === hovered;
        const base = marker.place.geo.scale === 'region' ? 4 : 3;
        return {
          marker,
          x: point[0],
          y: point[1],
          r: base + marker.weight * 7 + (isSelected || isHovered ? 2 : 0),
          isSelected,
          isHovered,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    for (const { marker, x, y, r, isSelected, isHovered } of placed) {
      // Регион — размытое пятно: у страны нет координат в том же смысле,
      // что у города, и точка притворялась бы точностью
      if (marker.place.geo.scale === 'region') {
        const blur = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
        blur.addColorStop(0, 'rgba(224, 175, 104, 0.38)');
        blur.addColorStop(1, 'rgba(224, 175, 104, 0)');
        ctx.fillStyle = blur;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = marker.place.geo.scale === 'region' ? '#e0af68' : '#7fc8a9';
      ctx.fill();

      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = colors.foreground;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Занятое место: сами точки плюс уже расставленные подписи
    const boxes = placed.map(({ x, y, r }) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 }));
    const fits = (x: number, y: number, w: number, h: number) =>
      !boxes.some(
        (box) => x < box.x + box.w && box.x < x + w && y < box.y + box.h && box.y < y + h
      );

    ctx.textBaseline = 'middle';
    // Крупные места подписываем первыми — им приоритет на место под текст
    for (const { marker, x, y, r, isSelected, isHovered } of [...placed].sort(
      (a, b) => b.marker.weight - a.marker.weight
    )) {
      const forced = isSelected || isHovered;
      if (!forced && marker.weight <= 0.18) continue;

      ctx.font = `${isSelected ? '600 ' : ''}12px -apple-system, Segoe UI, sans-serif`;
      const width = ctx.measureText(marker.place.title).width + 4;

      // Справа привычнее, но если там занято — пробуем слева
      const right = { x: x + r + 6, y: y - 7 };
      const left = { x: x - r - 6 - width, y: y - 7 };
      const spot = fits(right.x, right.y, width, 14)
        ? right
        : fits(left.x, left.y, width, 14)
          ? left
          : forced
            ? right
            : null;
      if (!spot) continue;

      boxes.push({ x: spot.x, y: spot.y, w: width, h: 14 });
      ctx.fillStyle = colors.foreground;
      ctx.globalAlpha = forced ? 1 : 0.85;
      ctx.fillText(marker.place.title, spot.x, y);
      ctx.globalAlpha = 1;
    }
  }, [size, colors, radius, project, markers, arcs, selectedId, hovered, rotation]);

  /** Ближайшее место под курсором */
  const hitTest = useCallback(
    (clientX: number, clientY: number): string | null => {
      const canvas = canvasRef.current;
      if (!canvas || radius <= 0) return null;

      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const projection = project();
      const centre: [number, number] = [-rotation[0], -rotation[1]];

      let bestId: string | null = null;
      let bestDistance = 16;

      for (const marker of markers) {
        const coords: [number, number] = [marker.place.geo.lon, marker.place.geo.lat];
        if (geoDistance(coords, centre) >= Math.PI / 2) continue;
        const point = projection(coords);
        if (!point) continue;

        const distance = Math.hypot(px - point[0], py - point[1]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = marker.place.id;
        }
      }

      return bestId;
    },
    [markers, project, radius, rotation]
  );

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  const handleWheel = (event: React.WheelEvent) => {
    setZoom((current) => clampZoom(current * Math.exp(-event.deltaY * 0.0015)));
  };

  const pinchDistance = () => {
    const points = [...touchesRef.current.values()];
    if (points.length < 2) return null;
    const [a, b] = points;
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (touchesRef.current.size === 2) {
      const distance = pinchDistance();
      if (distance) {
        // Второй палец отменяет вращение: иначе шар крутится и масштабируется разом
        dragRef.current = null;
        pinchRef.current = { startDistance: distance, startZoom: zoom };
      }
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRotation: rotation,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (touchesRef.current.has(event.pointerId)) {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    const pinch = pinchRef.current;
    if (pinch) {
      const distance = pinchDistance();
      if (distance) setZoom(clampZoom((pinch.startZoom * distance) / pinch.startDistance));
      return;
    }

    const drag = dragRef.current;

    if (drag && drag.pointerId === event.pointerId) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;

      // Чем ближе приближение, тем мельче должен быть шаг вращения
      const step = DRAG_SENSITIVITY / zoom;
      setRotation([
        drag.startRotation[0] + dx * step,
        // Полюса не переворачиваем: за ними шар читается как вывернутый
        Math.max(-89, Math.min(89, drag.startRotation[1] - dy * step)),
      ]);
      return;
    }

    setHovered(hitTest(event.clientX, event.clientY));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    touchesRef.current.delete(event.pointerId);

    if (pinchRef.current) {
      if (touchesRef.current.size < 2) pinchRef.current = null;
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;

    if (drag.moved) return;
    onSelect(hitTest(event.clientX, event.clientY));
  };

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block touch-none select-none"
        style={{ cursor: hovered ? 'pointer' : 'grab' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => setHovered(null)}
      />
    </div>
  );
}
