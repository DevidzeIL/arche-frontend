import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  geoContains,
  geoDistance,
  geoGraticule10,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
  type GeoProjection,
} from 'd3-geo';
import { readThemeColors, type ThemeColors } from '@/components/map/mapRender';
import { worldLand } from './worldLand';
import type { Place } from '@/arche/geo';
import type { Area } from '@/arche/bordersData';

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

/** Государство на выбранный год, уже с русским названием */
export interface StateLayer {
  key: string;
  ru: string;
  union: boolean;
  area: Area;
  /** Упрощённая копия для общего вида */
  coarse: Area;
  /** Совсем грубая — пока шар в движении */
  motion: Area;
  bbox: [number, number, number, number];
  size: number;
  label: [number, number];
  hue: number;
}

/** Народ или культура фоном — там, где государств нет */
export interface BackgroundLayer {
  name: string;
  ru?: string;
  area: Area;
  coarse: Area;
  motion: Area;
  bbox: [number, number, number, number];
  size: number;
}

/** Событие или человек из Wikidata — фон «а в это время» */
export interface ContextPoint {
  id: string;
  kind: 'event' | 'person';
  lon: number;
  lat: number;
  title: string;
  sub?: string;
}

export type GlobeMode = 'globe' | 'flat';

export type GlobeSelection =
  | { kind: 'place'; id: string }
  | { kind: 'state'; key: string }
  | { kind: 'context'; id: string };

interface GlobeCanvasProps {
  mode: GlobeMode;
  markers: GlobeMarker[];
  arcs: GlobeArc[];
  states: StateLayer[];
  background: BackgroundLayer[];
  context: ContextPoint[];
  selection: GlobeSelection | null;
  onSelect: (selection: GlobeSelection | null) => void;
  /** Крутить самостоятельно, пока никто не трогает */
  autoRotate: boolean;
  /** Повернуться к точке; token меняется — поворачиваемся снова */
  focus: { lon: number; lat: number; token: number } | null;
}

const DRAG_SENSITIVITY = 0.25;
const AUTO_ROTATE_SPEED = 0.045;
/** Доля меньшей стороны, которую занимает шар при единичном приближении */
const FILL = 0.44;
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 8;
/** Ширина и высота карты Natural Earth при единичном масштабе */
const FLAT_WIDTH = 5.46;
const FLAT_HEIGHT = 2.84;
/**
 * До какого масштаба (пикселей на радиан) хватает грубой геометрии:
 * её допуск — 0,12° — здесь меньше пикселя с небольшим
 */
const COARSE_BELOW = 560;

/**
 * Стартовый разворот: центр Европы.
 *
 * Хранилище европоцентрично, и шар, повёрнутый Атлантикой или Тихим океаном,
 * встречал бы пустотой. Честнее показать сразу то, где что-то есть.
 */
const START_ROTATION: [number, number] = [-10, -45];

interface Palette {
  stateLightness: number;
  stateSaturation: number;
  stateAlpha: number;
  event: string;
  person: string;
}

const palette = (dark: boolean): Palette =>
  dark
    ? { stateLightness: 62, stateSaturation: 55, stateAlpha: 0.17, event: '#c4a7e7', person: '#89c4e1' }
    : { stateLightness: 42, stateSaturation: 50, stateAlpha: 0.14, event: '#7c4dbd', person: '#2f7fa8' };

const sameSelection = (a: GlobeSelection | null, b: GlobeSelection | null) =>
  a?.kind === b?.kind &&
  (a?.kind === 'place' ? a.id === (b as typeof a).id : true) &&
  (a?.kind === 'state' ? a.key === (b as typeof a).key : true) &&
  (a?.kind === 'context' ? a.id === (b as typeof a).id : true);

interface Hover {
  selection: GlobeSelection;
  title: string;
  sub?: string;
}

export function GlobeCanvas({
  mode,
  markers,
  arcs,
  states,
  background,
  context,
  selection,
  onSelect,
  autoRotate,
  focus,
}: GlobeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [colors, setColors] = useState<ThemeColors | null>(null);
  const [dark, setDark] = useState(true);
  const [rotation, setRotation] = useState<[number, number]>(START_ROTATION);
  const [zoom, setZoom] = useState(1);
  /** Сдвиг плоской карты по вертикали, px: по горизонтали она вращается */
  const [panY, setPanY] = useState(0);
  /** Что под курсором — от этого зависит подсветка на холсте */
  const [hover, setHover] = useState<Hover | null>(null);
  /** Где стоит подсказка — двигается с мышью, холст при этом не перерисовывается */
  const [tooltipAt, setTooltipAt] = useState<{ x: number; y: number } | null>(null);
  /** Шар тянут или он летит к месту: пока движется, детали не нужны */
  const [interacting, setInteracting] = useState(false);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startRotation: [number, number];
    startPanY: number;
    moved: boolean;
  } | null>(null);

  // Щипок для приближения: на телефоне колеса нет
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ startDistance: number; startZoom: number } | null>(null);
  const animationRef = useRef(0);

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
    const update = () => {
      setColors(readThemeColors(document.documentElement));
      setDark(document.documentElement.classList.contains('dark'));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Плоская карта открывается на Европе: так же, как шар
  const flatFitted = useRef(false);
  useEffect(() => {
    if (mode !== 'flat' || flatFitted.current || size.width === 0) return;
    flatFitted.current = true;
    setRotation(([, phi]) => [-15, phi]);
    const startZoom = size.width < 600 ? 2.4 : 1.7;
    setZoom(startZoom);
    const k = Math.min(size.width / FLAT_WIDTH, size.height / FLAT_HEIGHT) * startZoom;
    const y = geoNaturalEarth1().scale(k).translate([0, 0]).rotate([-15, 0])([15, 46])?.[1] ?? 0;
    // Европа — в центр, но без пустой полосы над полюсом
    const room = Math.max(0, (FLAT_HEIGHT * k - size.height) / 2);
    setPanY(Math.max(-room, Math.min(room, -y)));
  }, [mode, size.width, size.height]);

  const autoRotating = mode === 'globe' && autoRotate && zoom <= 1.2;
  const moving = autoRotating || interacting;

  // Собственное вращение: останавливается, пока тянут, что-то выбрано
  // или шар приближен — приблизили значит рассматривают, и уводить обзор
  // из-под рук нельзя
  useEffect(() => {
    if (!autoRotating) return;
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
  }, [autoRotating]);

  const radius = Math.min(size.width, size.height) * FILL * zoom;
  const flatScale = Math.min(size.width / FLAT_WIDTH, size.height / FLAT_HEIGHT) * zoom;
  /** Пикселей на радиан: по нему решается, помещается ли подпись */
  const scale = mode === 'globe' ? radius : flatScale;

  const project = useCallback((): GeoProjection => {
    if (mode === 'flat') {
      return geoNaturalEarth1()
        .scale(flatScale)
        .translate([size.width / 2, size.height / 2 + panY])
        .rotate([rotation[0], 0]);
    }
    return geoOrthographic()
      .translate([size.width / 2, size.height / 2])
      .scale(radius)
      .rotate([rotation[0], rotation[1]])
      .clipAngle(90);
  }, [mode, size.width, size.height, radius, flatScale, rotation, panY]);

  /** Видна ли точка: у шара обратная сторона скрыта, у карты видно всё */
  const isVisible = useCallback(
    (coords: [number, number]) =>
      mode === 'flat' || geoDistance(coords, [-rotation[0], -rotation[1]]) < Math.PI / 2,
    [mode, rotation]
  );

  // Поворот к месту, когда на глобус пришли по ссылке со страницы заметки
  useEffect(() => {
    if (!focus || size.width === 0) return;
    cancelAnimationFrame(animationRef.current);

    const targetZoom = Math.max(zoom, mode === 'globe' ? 2.4 : 3);
    const fromRotation = rotation;
    const fromPan = panY;
    const fromZoom = zoom;
    // Кратчайший путь по долготе: из −170° в 170° — через антимеридиан
    let lambda = -focus.lon;
    while (lambda - fromRotation[0] > 180) lambda -= 360;
    while (lambda - fromRotation[0] < -180) lambda += 360;
    const toRotation: [number, number] = [lambda, mode === 'globe' ? -focus.lat : fromRotation[1]];
    const k = Math.min(size.width / FLAT_WIDTH, size.height / FLAT_HEIGHT) * targetZoom;
    const toPan =
      mode === 'flat'
        ? -(geoNaturalEarth1().scale(k).translate([0, 0]).rotate([lambda, 0])([focus.lon, focus.lat])?.[1] ?? 0)
        : fromPan;

    const started = performance.now();
    setInteracting(true);
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / 700);
      const e = 1 - Math.pow(1 - t, 3);
      setRotation([
        fromRotation[0] + (toRotation[0] - fromRotation[0]) * e,
        fromRotation[1] + (toRotation[1] - fromRotation[1]) * e,
      ]);
      setZoom(fromZoom + (targetZoom - fromZoom) * e);
      setPanY(fromPan + (toPan - fromPan) * e);
      if (t < 1) animationRef.current = requestAnimationFrame(step);
      else setInteracting(false);
    };
    animationRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(animationRef.current);
      setInteracting(false);
    };
    // Запускается только новой целью, а не каждым кадром вращения
  }, [focus?.token, size.width > 0]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !colors || size.width === 0 || scale <= 0) return;

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
    const tones = palette(dark);

    if (mode === 'globe') {
      // Мягкое свечение вокруг шара — граница между планетой и пустотой
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius * 1.16);
      halo.addColorStop(0, 'rgba(122, 162, 247, 0.16)');
      halo.addColorStop(1, 'rgba(122, 162, 247, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.16, 0, Math.PI * 2);
      ctx.fill();
    }

    // Океан
    ctx.beginPath();
    path({ type: 'Sphere' });
    let oceanFill: string | CanvasGradient;
    if (mode === 'globe') {
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
      oceanFill = ocean;
    } else {
      oceanFill = 'rgba(122, 162, 247, 0.10)';
    }
    ctx.fillStyle = oceanFill;
    ctx.fill();

    // Сетка параллелей и меридианов
    ctx.beginPath();
    path(geoGraticule10());
    ctx.strokeStyle = colors.border;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    /*
     * Для плотных полигонов — та же проекция без адаптивной передискретизации.
     * d3 по умолчанию досчитывает промежуточные точки, чтобы прямой отрезок
     * изогнулся по шару; дугам между городами это нужно, а границам с точками
     * через пять километров — нет. Без этого кадр вращения стоил вдвое дороже.
     */
    const fast = project().precision(0);
    /** Путь в Path2D: одна проекция на кадр, а залить, обвести и вырезать — сколько угодно */
    const shapePath = (area: Area) => {
      const p = new Path2D();
      geoPath(fast, p as unknown as CanvasRenderingContext2D)(area);
      return p;
    };

    // Суша
    const land = shapePath(worldLand() as unknown as Area);
    ctx.fillStyle = colors.foreground;
    ctx.globalAlpha = 0.1;
    ctx.fill(land);
    ctx.globalAlpha = 1;

    const centre: [number, number] = [-rotation[0], -rotation[1]];
    /** Видна ли область хотя бы краем: обратную сторону шара не считаем */
    const facing = (bbox: [number, number, number, number]) => {
      if (mode === 'flat') return true;
      const [w, s, e, n] = bbox;
      const corners: [number, number][] = [
        [w, s], [w, n], [e, s], [e, n], [(w + e) / 2, (s + n) / 2],
      ];
      return corners.some((c) => geoDistance(c, centre) < Math.PI / 2 + 0.35);
    };
    /** Меньше пикселя — не рисуем: глазу не видно, а точки считать дорого */
    const noticeable = (size: number) => size * scale * scale >= 1;
    const lod = (shape: { area: Area; coarse: Area; motion: Area }) =>
      moving ? shape.motion : scale < COARSE_BELOW ? shape.coarse : shape.area;

    const bases = states
      .filter((s) => !s.union && noticeable(s.size) && facing(s.bbox))
      .map((shape) => ({ shape, path: shapePath(lod(shape)) }));
    const unions = states.filter((s) => s.union && facing(s.bbox));

    const selectedKey = selection?.kind === 'state' ? selection.key : null;
    const hoveredKey = hover?.selection.kind === 'state' ? hover.selection.key : null;

    const borderLines = new Path2D();
    for (const { path: statePath } of bases) borderLines.addPath(statePath);

    // Народы и культуры фоном — только там, где нет государств: иначе
    // бледные «германские племена» просвечивали бы сквозь Римскую империю.
    // Рисуем фон целиком, а под государствами заново кладём подложку — океан
    // и сушу — одной заливкой. Маска или вырезание на отдельном холсте дают
    // то же самое, но растрируют сотню границ второй раз: +10 мс на кадр
    if (background.length > 0) {
      const peoples = new Path2D();
      const peoplesPath = geoPath(fast, peoples as unknown as CanvasRenderingContext2D);
      for (const shape of background) {
        if (noticeable(shape.size) && facing(shape.bbox)) peoplesPath(lod(shape));
      }
      ctx.fillStyle = colors.foreground;
      ctx.globalAlpha = dark ? 0.07 : 0.045;
      ctx.fill(peoples);
      ctx.globalAlpha = dark ? 0.16 : 0.12;
      ctx.strokeStyle = colors.foreground;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 3]);
      ctx.stroke(peoples);
      ctx.setLineDash([]);

      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.background;
      ctx.fill(borderLines);
      ctx.fillStyle = oceanFill;
      ctx.fill(borderLines);
      ctx.fillStyle = colors.foreground;
      ctx.globalAlpha = 0.1;
      ctx.fill(borderLines);
      ctx.globalAlpha = 1;
    }

    // Государства: заливка цветом, устойчивым во все века
    for (const { shape, path: statePath } of bases) {
      ctx.fillStyle = `hsl(${shape.hue} ${tones.stateSaturation}% ${tones.stateLightness}%)`;
      ctx.globalAlpha =
        shape.key === selectedKey
          ? tones.stateAlpha * 2.6
          : shape.key === hoveredKey
            ? tones.stateAlpha * 1.7
            : tones.stateAlpha;
      ctx.fill(statePath);
    }
    // Берега — поверх заливок, иначе подложка под государствами их съест
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = colors.foreground;
    ctx.lineWidth = 0.6;
    ctx.stroke(land);

    // Все границы — одним штрихом: сотня вызовов stroke дороже одного
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = colors.foreground;
    ctx.lineWidth = 0.5;
    ctx.stroke(borderLines);
    ctx.globalAlpha = 1;

    // Объединения — пунктиром поверх: Священная Римская империя не стирает
    // княжества, а обводит их
    ctx.setLineDash([4, 3]);
    for (const shape of unions) {
      ctx.strokeStyle = colors.foreground;
      ctx.globalAlpha = shape.key === selectedKey ? 0.9 : 0.5;
      ctx.lineWidth = shape.key === selectedKey ? 1.6 : 1;
      ctx.stroke(shapePath(lod(shape)));
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Выбранное государство — чёткой обводкой
    const selectedShape = bases.find(({ shape }) => shape.key === selectedKey);
    if (selectedShape) {
      ctx.strokeStyle = colors.foreground;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.6;
      ctx.stroke(selectedShape.path);
      ctx.globalAlpha = 1;
    }

    // Край шара
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    const isSelected = (kind: GlobeSelection['kind'], id: string) =>
      selection?.kind === kind &&
      (kind === 'state' ? (selection as { key: string }).key : (selection as { id: string }).id) === id;
    const isHovered = (kind: GlobeSelection['kind'], id: string) =>
      hover?.selection.kind === kind &&
      (kind === 'state'
        ? (hover.selection as { key: string }).key
        : (hover.selection as { id: string }).id) === id;

    // Дуги влияния: рисуем под точками, чтобы не забивали их
    const placeSelected = selection?.kind === 'place';
    for (const arc of arcs) {
      if (!isVisible(arc.from) && !isVisible(arc.to)) continue;
      ctx.beginPath();
      path({ type: 'LineString', coordinates: [arc.from, arc.to] });
      ctx.strokeStyle = arc.color;
      ctx.globalAlpha = placeSelected ? 0.75 : 0.4;
      ctx.lineWidth = placeSelected ? 1.6 : 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Фон «а в это время»: мелко и бледно, чтобы не спорить с заметками
    for (const point of context) {
      const coords: [number, number] = [point.lon, point.lat];
      if (!isVisible(coords)) continue;
      const xy = projection(coords);
      if (!xy) continue;
      const active = isSelected('context', point.id) || isHovered('context', point.id);
      const r = active ? 4.5 : 2.6;
      ctx.fillStyle = point.kind === 'event' ? tones.event : tones.person;
      ctx.globalAlpha = active ? 1 : 0.75;
      ctx.beginPath();
      if (point.kind === 'event') {
        // Событие — ромбом, человек — кружком: различимо и без легенды
        ctx.moveTo(xy[0], xy[1] - r);
        ctx.lineTo(xy[0] + r, xy[1]);
        ctx.lineTo(xy[0], xy[1] + r);
        ctx.lineTo(xy[0] - r, xy[1]);
        ctx.closePath();
      } else {
        ctx.arc(xy[0], xy[1], r * 0.85, 0, Math.PI * 2);
      }
      ctx.fill();
      if (active) {
        ctx.strokeStyle = colors.foreground;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Сначала считаем положение всех точек, и только потом расставляем
    // подписи. В один проход подпись не знала бы о точках, которые будут
    // нарисованы после неё, и ложилась бы прямо на них.
    const placed = markers
      .map((marker) => {
        const coords: [number, number] = [marker.place.geo.lon, marker.place.geo.lat];
        if (!isVisible(coords)) return null;
        const point = projection(coords);
        if (!point) return null;

        const selected = isSelected('place', marker.place.id);
        const hovered = isHovered('place', marker.place.id);
        const base = marker.place.geo.scale === 'region' ? 4 : 3;
        return {
          marker,
          x: point[0],
          y: point[1],
          r: base + marker.weight * 7 + (selected || hovered ? 2 : 0),
          selected,
          hovered,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    for (const { marker, x, y, r, selected, hovered } of placed) {
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

      if (selected || hovered) {
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
      x >= 0 &&
      y >= 0 &&
      x + w <= size.width &&
      y + h <= size.height &&
      !boxes.some(
        (box) => x < box.x + box.w && box.x < x + w && y < box.y + box.h && box.y < y + h
      );

    // Подписи мест — первыми: это заметки хранилища, им приоритет на место
    ctx.textBaseline = 'middle';
    const placeLabels: Array<{ text: string; x: number; y: number; bold: boolean; forced: boolean }> = [];
    for (const { marker, x, y, r, selected, hovered } of [...placed].sort(
      (a, b) => b.marker.weight - a.marker.weight
    )) {
      const forced = selected || hovered;
      if (!forced && marker.weight <= 0.18) continue;

      ctx.font = `${selected ? '600 ' : ''}12px -apple-system, Segoe UI, sans-serif`;
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
      placeLabels.push({ text: marker.place.title, x: spot.x, y, bold: selected, forced });
    }

    // Подписи государств: только у тех, в кого название помещается
    // с запасом, — крупные сначала. Мелкие княжества видны по наведению
    ctx.font = '11px -apple-system, Segoe UI, sans-serif';
    const pixelArea = (s: StateLayer) => s.size * scale * scale;
    for (const shape of bases.map((b) => b.shape).sort((a, b) => b.size - a.size)) {
      if (!isVisible(shape.label)) continue;
      const point = projection(shape.label);
      if (!point) continue;
      const text = shape.ru;
      const width = ctx.measureText(text).width + 6;
      if (pixelArea(shape) < width * 14 * 3.2 && shape.key !== selectedKey) continue;
      const x = point[0] - width / 2;
      const y = point[1] - 7;
      if (!fits(x, y, width, 14)) continue;
      boxes.push({ x, y, w: width, h: 14 });
      ctx.fillStyle = colors.foreground;
      ctx.globalAlpha = shape.key === selectedKey ? 0.95 : 0.5;
      ctx.textAlign = 'center';
      ctx.fillText(text, point[0], point[1]);
    }
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;

    for (const label of placeLabels) {
      ctx.font = `${label.bold ? '600 ' : ''}12px -apple-system, Segoe UI, sans-serif`;
      ctx.fillStyle = colors.foreground;
      ctx.globalAlpha = label.forced ? 1 : 0.85;
      ctx.fillText(label.text, label.x, label.y);
    }
    ctx.globalAlpha = 1;
  }, [
    size, colors, dark, mode, radius, scale, project, isVisible, markers, arcs, moving,
    states, background, context, selection, hover, rotation,
  ]);

  /** Что под курсором: место, точка фона или государство — в таком порядке */
  const hitTest = useCallback(
    (clientX: number, clientY: number): Hover | null => {
      const canvas = canvasRef.current;
      if (!canvas || scale <= 0) return null;

      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const projection = project();

      let bestPlace: GlobeMarker | null = null;
      let bestDistance = 16;
      for (const marker of markers) {
        const coords: [number, number] = [marker.place.geo.lon, marker.place.geo.lat];
        if (!isVisible(coords)) continue;
        const point = projection(coords);
        if (!point) continue;
        const distance = Math.hypot(px - point[0], py - point[1]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPlace = marker;
        }
      }
      if (bestPlace) {
        return {
          selection: { kind: 'place', id: bestPlace.place.id },
          title: bestPlace.place.title,
          sub: `${bestPlace.count} в хранилище`,
        };
      }

      let bestPoint: ContextPoint | null = null;
      bestDistance = 8;
      for (const point of context) {
        const coords: [number, number] = [point.lon, point.lat];
        if (!isVisible(coords)) continue;
        const xy = projection(coords);
        if (!xy) continue;
        const distance = Math.hypot(px - xy[0], py - xy[1]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPoint = point;
        }
      }
      if (bestPoint) {
        return {
          selection: { kind: 'context', id: bestPoint.id },
          title: bestPoint.title,
          sub: bestPoint.sub,
        };
      }

      const lonLat = projection.invert?.([px, py]);
      if (!lonLat || !Number.isFinite(lonLat[0]) || !Number.isFinite(lonLat[1])) return null;
      // У шара invert отвечает и за пределами диска — там ничего нет
      if (mode === 'globe' && Math.hypot(px - size.width / 2, py - size.height / 2) > radius) {
        return null;
      }
      const point = lonLat as [number, number];

      let state: StateLayer | null = null;
      for (const shape of states) {
        if (shape.union) continue;
        const [w, s, e, n] = shape.bbox;
        if (point[0] < w || point[0] > e || point[1] < s || point[1] > n) continue;
        if (!geoContains(shape.area, point)) continue;
        if (!state || shape.size < state.size) state = shape;
      }
      if (state) {
        const union = states.find(
          (shape) =>
            shape.union && shape.ru !== state!.ru && geoContains(shape.area, point)
        );
        return {
          selection: { kind: 'state', key: state.key },
          title: state.ru,
          sub: union ? `в составе: ${union.ru}` : undefined,
        };
      }

      const people = background.find((shape) => geoContains(shape.area, point));
      if (people) {
        // Фон не выбирается — это не государство, о нём нечего рассказать
        return {
          selection: { kind: 'state', key: `bg:${people.name}` },
          title: people.ru ?? people.name,
          sub: 'народы и культуры, приблизительно',
        };
      }
      return null;
    },
    [markers, context, states, background, project, isVisible, scale, mode, size, radius]
  );

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  const clampPan = (value: number, atZoom = zoom) => {
    const k = Math.min(size.width / FLAT_WIDTH, size.height / FLAT_HEIGHT) * atZoom;
    const slack = Math.max(0, (FLAT_HEIGHT * k - size.height) / 2) + size.height * 0.25;
    return Math.max(-slack, Math.min(slack, value));
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    const next = clampZoom(zoom * Math.exp(-event.deltaY * 0.0015));
    if (mode === 'flat') {
      // На карте приближаем к курсору, а не к центру: так и ищут место
      const rect = event.currentTarget.getBoundingClientRect();
      const px = event.clientX - rect.left - size.width / 2;
      const py = event.clientY - rect.top - size.height / 2;
      const k1 = flatScale;
      const k2 = (flatScale * next) / zoom;
      const degreesPerPx = (k: number) => 180 / Math.PI / (k * 0.8707);
      setRotation(([lambda, phi]) => [lambda + px * (degreesPerPx(k2) - degreesPerPx(k1)), phi]);
      setPanY((current) => clampPan(py - ((py - current) * k2) / k1, next));
    }
    setZoom(next);
  };

  const pinchDistance = () => {
    const points = [...touchesRef.current.values()];
    if (points.length < 2) return null;
    const [a, b] = points;
    return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    cancelAnimationFrame(animationRef.current);
    event.currentTarget.setPointerCapture(event.pointerId);
    touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (touchesRef.current.size === 2) {
      const distance = pinchDistance();
      if (distance) {
        // Второй палец отменяет вращение: иначе шар крутится и масштабируется разом
        dragRef.current = null;
        pinchRef.current = { startDistance: distance, startZoom: zoom };
        setInteracting(true);
      }
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRotation: rotation,
      startPanY: panY,
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
      if (Math.hypot(dx, dy) > 3 && !drag.moved) {
        drag.moved = true;
        setHover(null);
        setInteracting(true);
      }

      if (mode === 'flat') {
        // Карта по горизонтали бесконечна: тянем — мир прокручивается
        const degreesPerPx = 180 / Math.PI / (flatScale * 0.8707);
        setRotation([drag.startRotation[0] + dx * degreesPerPx, drag.startRotation[1]]);
        setPanY(clampPan(drag.startPanY + dy));
        return;
      }

      // Чем ближе приближение, тем мельче должен быть шаг вращения
      const step = DRAG_SENSITIVITY / zoom;
      setRotation([
        drag.startRotation[0] + dx * step,
        // Полюса не переворачиваем: за ними шар читается как вывернутый
        Math.max(-89, Math.min(89, drag.startRotation[1] - dy * step)),
      ]);
      return;
    }

    // Наведение пальцем не бывает: подсказка только для мыши
    if (event.pointerType !== 'mouse') return;
    const hit = hitTest(event.clientX, event.clientY);
    const rect = event.currentTarget.getBoundingClientRect();
    // Тот же объект — прежнее состояние, чтобы холст не перерисовывался
    setHover((current) =>
      hit && current && sameSelection(current.selection, hit.selection) ? current : hit
    );
    setTooltipAt(hit ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    touchesRef.current.delete(event.pointerId);

    if (pinchRef.current) {
      if (touchesRef.current.size < 2) {
        pinchRef.current = null;
        setInteracting(false);
      }
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setInteracting(false);

    if (drag.moved) return;
    const hit = hitTest(event.clientX, event.clientY);
    // Фон с народами не выбирается: о «культурах полей погребальных урн»
    // панели рассказать нечего, подсказки при наведении достаточно
    if (hit?.selection.kind === 'state' && hit.selection.key.startsWith('bg:')) {
      onSelect(null);
      return;
    }
    onSelect(hit?.selection ?? null);
  };

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block touch-none select-none"
        style={{ cursor: hover ? 'pointer' : 'grab' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          setHover(null);
          setTooltipAt(null);
        }}
      />
      {hover && tooltipAt && (
        <div
          className="pointer-events-none absolute z-10 max-w-[260px] rounded-md border border-border/50 bg-card/95 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur-sm"
          style={{
            left: Math.min(tooltipAt.x + 14, size.width - 270),
            top: tooltipAt.y + 14,
          }}
        >
          <div className="font-medium text-foreground">{hover.title}</div>
          {hover.sub && <div className="mt-0.5 text-muted-foreground">{hover.sub}</div>}
        </div>
      )}
    </div>
  );
}
