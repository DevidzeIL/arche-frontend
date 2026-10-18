import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { readThemeColors, type ThemeColors } from '@/components/map/mapRender';
import { stateName, useBordersAt } from '@/arche/borders';
import type { Area } from '@/arche/bordersData';
import { worldLand } from './worldLand';

export interface MiniMapPoint {
  lon: number;
  lat: number;
  label: string;
}

interface BordersMiniMapProps {
  year: number;
  points: MiniMapPoint[];
  /** Государство, которое подсветить: ключ из sovereignty */
  highlight?: string | null;
  height?: number;
}

/** Сколько градусов вокруг точек показывать: чтобы были видны соседи */
const PAD_LON = 9;
const PAD_LAT = 6;

/**
 * Карта границ на один год вокруг нескольких точек.
 *
 * Для страницы заметки глобус избыточен: нужно увидеть, что Кёнигсберг
 * в 1781 году — восточный край Пруссии, отрезанный от остальной страны
 * польскими землями. Поэтому плоская карта, вписанная в окрестность мест,
 * и подсвеченное государство.
 */
export function BordersMiniMap({ year, points, highlight, height = 240 }: BordersMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [colors, setColors] = useState<ThemeColors | null>(null);
  const [dark, setDark] = useState(true);
  const borders = useBordersAt(year);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => {
      setColors(readThemeColors(document.documentElement));
      setDark(document.documentElement.classList.contains('dark'));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !colors || width === 0 || points.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const lons = points.map((p) => p.lon);
    const lats = points.map((p) => p.lat);
    const west = Math.min(...lons) - PAD_LON;
    const east = Math.max(...lons) + PAD_LON;
    const south = Math.max(-85, Math.min(...lats) - PAD_LAT);
    const north = Math.min(85, Math.max(...lats) + PAD_LAT);
    const centreLon = (west + east) / 2;

    const projection = geoNaturalEarth1()
      .rotate([-centreLon, 0])
      .precision(0)
      .fitExtent(
        [
          [8, 8],
          [width - 8, height - 8],
        ],
        {
          type: 'MultiPoint',
          coordinates: [
            [west, south],
            [west, north],
            [east, south],
            [east, north],
          ],
        }
      );
    const path = geoPath(projection, ctx);
    // Мелкий масштаб — грубой геометрии хватает
    const pick = (shape: { area: Area; coarse: Area }) =>
      projection.scale() < 900 ? shape.coarse : shape.area;

    ctx.fillStyle = 'rgba(122, 162, 247, 0.10)';
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    path(worldLand());
    ctx.fillStyle = colors.foreground;
    ctx.globalAlpha = 0.1;
    ctx.fill();
    ctx.globalAlpha = 1;

    for (const shape of borders.background) {
      ctx.beginPath();
      path(pick(shape));
      ctx.fillStyle = colors.foreground;
      ctx.globalAlpha = dark ? 0.05 : 0.035;
      ctx.fill();
    }

    const bases = borders.states.filter((s) => !s.union);
    for (const shape of bases) {
      ctx.beginPath();
      path(pick(shape));
      // Подсвеченное — ярко, остальные — едва заметно: важен контур одного
      const active = shape.key === highlight;
      ctx.fillStyle = `hsl(${shape.hue} ${dark ? 55 : 50}% ${dark ? 62 : 42}%)`;
      ctx.globalAlpha = active ? (dark ? 0.5 : 0.42) : dark ? 0.14 : 0.1;
      ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = colors.foreground;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    ctx.setLineDash([4, 3]);
    for (const shape of borders.states.filter((s) => s.union)) {
      ctx.beginPath();
      path(pick(shape));
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = colors.foreground;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const highlighted = bases.find((s) => s.key === highlight);
    if (highlighted) {
      ctx.beginPath();
      path(highlighted.area);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = colors.foreground;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    ctx.beginPath();
    path(worldLand());
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = colors.foreground;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.font = '12px -apple-system, Segoe UI, sans-serif';
    ctx.textBaseline = 'middle';
    for (const point of points) {
      const xy = projection([point.lon, point.lat]);
      if (!xy) continue;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], 4, 0, Math.PI * 2);
      ctx.fillStyle = '#7fc8a9';
      ctx.fill();
      ctx.strokeStyle = colors.foreground;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = colors.foreground;
      ctx.fillText(point.label, xy[0] + 8, xy[1]);
    }

    if (highlighted) {
      const xy = projection(highlighted.label);
      if (xy && xy[0] > 0 && xy[0] < width && xy[1] > 0 && xy[1] < height) {
        ctx.font = '600 11px -apple-system, Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.75;
        ctx.fillText(stateName(highlighted, year), xy[0], xy[1] + 16);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
    }
  }, [width, height, colors, dark, points, highlight, borders.states, borders.background, year]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-lg border border-border/40"
      style={{ height }}
    >
      <canvas ref={canvasRef} className="block" />
      {!borders.ready && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Границы загружаются…
        </div>
      )}
    </div>
  );
}
