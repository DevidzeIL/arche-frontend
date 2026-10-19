import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { loadDetailedLand, loadGeography, type Geography } from './geography';
import type { FeatureCollection, MultiPolygon } from 'geojson';
import type { Place } from '@/arche/geo';
import type { Area } from '@/arche/bordersData';

/** Место с тем, что к нему привязано на текущий момент времени */
export interface GlobeMarker {
  place: Place;
  /** Сколько заметок уже случилось к выбранному году */
  count: number;
  /** Насыщенность 0..1 — доля от самого населённого места */
  weight: number;
  /** Подпись на этот год, если город тогда назывался иначе: Ленинград в 1939-м */
  label?: string;
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
  /** Столица на этот год — для подсказки */
  capital?: string;
  /** Раскраска по религии или языку, а сведений нет — рисуется серым */
  nodata?: boolean;
  /** Что сообщить в подсказке о раскраске: «Католицизм» */
  category?: string;
  /** Категория-«по-разному» («Несколько конфессий»): блёкло */
  muted?: boolean;
  /** Режим войны: участник подсвечен, остальные приглушены */
  emphasis?: 'on' | 'off';
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
  /** battle — сражение выбранной войны: показывается всегда и с подписью */
  kind: 'event' | 'person' | 'battle';
  lon: number;
  lat: number;
  title: string;
  sub?: string;
}

/**
 * Город-ориентир из Wikidata: не заметка, а подпись на карте. Чем ближе
 * карта, тем больше городов: на общем виде — ни одного, вблизи — все
 */
export interface CityPoint {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** Место по известности: 0 — самый известный */
  rank: number;
  sub?: string;
}

/** Столица государства на выбранный год */
export interface CapitalPoint {
  /** Ключ государства: щелчок по столице выбирает его */
  key: string;
  name: string;
  /** Название государства — для подсказки */
  state?: string;
  lon: number;
  lat: number;
}

/**
 * Выбранное — где оно на карте. Рисуется поверх всего: человек среди
 * сотни таких же голубых точек иначе неотличим от соседей
 */
export interface Spotlight {
  lon: number;
  lat: number;
  label: string;
}

/** Линия жизни выбранного человека: откуда — куда, пунктиром */
export interface LifeLine {
  from: [number, number];
  to: [number, number];
  /** «умер: Стокгольм, 1650» */
  label: string;
}

export type GlobeMode = 'globe' | 'flat';

export type GlobeSelection =
  | { kind: 'place'; id: string }
  | { kind: 'state'; key: string }
  | { kind: 'context'; id: string }
  /** Элемент базы знаний: война, сражение, течение, религия… */
  | { kind: 'kb'; id: string }
  | { kind: 'city'; id: string };

interface GlobeCanvasProps {
  mode: GlobeMode;
  markers: GlobeMarker[];
  arcs: GlobeArc[];
  states: StateLayer[];
  background: BackgroundLayer[];
  context: ContextPoint[];
  capitals: CapitalPoint[];
  /** Города-ориентиры, от известных к малоизвестным */
  cities?: CityPoint[];
  selection: GlobeSelection | null;
  onSelect: (selection: GlobeSelection | null) => void;
  /** Крутить самостоятельно, пока никто не трогает */
  autoRotate: boolean;
  /** Повернуться к точке; token меняется — поворачиваемся снова */
  /** zoom — приблизить ровно так; без него — не меньше обычного «к месту» */
  focus: { lon: number; lat: number; token: number; zoom?: number } | null;
  /** Множитель числа точек фона: «реже», «обычно», «гуще» */
  density?: number;
  /** Подписи государств, столиц и фона; места хранилища подписаны всегда */
  showLabels?: boolean;
  spotlight?: Spotlight | null;
  lifeLine?: LifeLine | null;
  /**
   * Сколько снизу закрыто карточкой маршрута, px. Центр вида поднимается
   * в открытую часть: на телефоне иначе выбранное оказывается под карточкой
   */
  insetBottom?: number;
  /** Режим «где это?»: щелчок отдаёт точку на карте, а не выбирает */
  onPoint?: (lonLat: [number, number]) => void;
  /** Реки, озёра, подписи морей и хребтов */
  showGeography?: boolean;
}

/**
 * Ширина подписей городов: measureText на сотнях подписей в каждом кадре —
 * заметная доля времени, а названия и шрифты повторяются
 */
const textWidths = new Map<string, number>();
const widthOf = (ctx: CanvasRenderingContext2D, font: string, text: string) => {
  const key = `${font}|${text}`;
  let width = textWidths.get(key);
  if (width === undefined) {
    width = ctx.measureText(text).width;
    textWidths.set(key, width);
  }
  return width;
};

const DRAG_SENSITIVITY = 0.25;
const AUTO_ROTATE_SPEED = 0.045;
/** Доля меньшей стороны, которую занимает шар при единичном приближении */
const FILL = 0.44;
const MIN_ZOOM = 0.8;
/** Вблизи — до уровня соседних городов: подписи там ещё помещаются */
const MAX_ZOOM = 24;
/** Ширина и высота карты Natural Earth при единичном масштабе */
const FLAT_WIDTH = 5.46;
const FLAT_HEIGHT = 2.84;
/**
 * До какого масштаба (пикселей на радиан) хватает грубой геометрии:
 * её допуск — 0,12° — здесь меньше пикселя с небольшим
 */
const COARSE_BELOW = 560;
/** С какого приближения суша подробная (1:50m): дальше грубый берег рубит государства */
const LAND_DETAIL_FROM = 900;
/** Шрифт подписей воды и рельефа — курсивная антиква, как в атласах */
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = '-apple-system, Segoe UI, sans-serif';

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
  /** Море, суша, реки и озёра, берег */
  ocean: string;
  land: string;
  water: string;
  coast: string;
  /** Границы государств и их подписи */
  border: string;
  /** Подписи морей и озёр, хребтов и пустынь */
  sea: string;
  relief: string;
  /** Ореол под подписью — цвет подложки */
  halo: string;
}

/**
 * Палитра атласа: плотные море и суша (на светлой теме они раньше почти
 * сливались), приглушённые цвета государств, тёмные границы
 */
const palette = (dark: boolean): Palette =>
  dark
    ? {
        stateLightness: 56,
        stateSaturation: 30,
        stateAlpha: 0.3,
        event: '#c4a7e7',
        person: '#89c4e1',
        ocean: 'hsl(222 32% 10%)',
        land: 'hsl(222 13% 17%)',
        water: 'hsl(208 45% 50%)',
        coast: 'hsl(210 30% 50%)',
        border: 'hsl(220 18% 86%)',
        sea: 'hsl(208 40% 66%)',
        relief: 'hsl(32 30% 64%)',
        halo: 'hsl(222 20% 13%)',
      }
    : {
        stateLightness: 64,
        stateSaturation: 36,
        stateAlpha: 0.36,
        event: '#7c4dbd',
        person: '#2f7fa8',
        ocean: 'hsl(206 45% 88%)',
        land: 'hsl(40 33% 96%)',
        water: 'hsl(206 55% 56%)',
        coast: 'hsl(206 35% 48%)',
        border: 'hsl(222 22% 22%)',
        sea: 'hsl(206 50% 36%)',
        relief: 'hsl(28 35% 36%)',
        halo: 'hsl(40 33% 97%)',
      };

/** Длинное название — в две строки по ближайшему к середине пробелу */
function splitLabel(text: string, measure: (t: string) => number, maxWidth: number): string[] {
  if (measure(text) <= maxWidth) return [text];
  const middle = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' && (best < 0 || Math.abs(i - middle) < Math.abs(best - middle))) best = i;
  }
  return best < 0 ? [text] : [text.slice(0, best), text.slice(best + 1)];
}

const sameSelection = (a: GlobeSelection | null, b: GlobeSelection | null) =>
  a?.kind === b?.kind &&
  (a?.kind === 'place' ? a.id === (b as typeof a).id : true) &&
  (a?.kind === 'state' ? a.key === (b as typeof a).key : true) &&
  (a?.kind === 'context' ? a.id === (b as typeof a).id : true) &&
  (a?.kind === 'kb' ? a.id === (b as typeof a).id : true) &&
  (a?.kind === 'city' ? a.id === (b as typeof a).id : true);

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
  capitals,
  cities = [],
  selection,
  onSelect,
  autoRotate,
  focus,
  density = 1,
  showLabels = true,
  spotlight = null,
  lifeLine = null,
  insetBottom = 0,
  onPoint,
  showGeography = true,
}: GlobeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** Пульсирующее кольцо поверх холста: CSS-анимация, чтобы не перерисовывать карту каждый кадр */
  const pulseRef = useRef<HTMLDivElement>(null);
  /** Города, нарисованные в последний кадр, — по ним ищется щелчок */
  const shownCitiesRef = useRef<Array<{ city: CityPoint; x: number; y: number }>>([]);
  /**
   * Единичные векторы городов — один раз на список. Проверить, попадает ли
   * город в кадр, — три умножения вместо проекции: вблизи из пяти тысяч
   * городов в кадре десятки, а проецировать все — шесть миллисекунд на кадр
   */
  const cityVectors = useMemo(() => {
    const v = new Float64Array(cities.length * 3);
    cities.forEach((city, i) => {
      const lon = city.lon * Math.PI / 180;
      const lat = city.lat * Math.PI / 180;
      v[i * 3] = Math.cos(lat) * Math.cos(lon);
      v[i * 3 + 1] = Math.cos(lat) * Math.sin(lon);
      v[i * 3 + 2] = Math.sin(lat);
    });
    return v;
  }, [cities]);
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
  /** Точки фона, которые реально нарисованы: только по ним и попадает курсор */
  const shownContextRef = useRef<ContextPoint[]>([]);

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
  /** Вертикальный центр вида: середина того, что не закрыто снизу */
  const centerY = Math.max(size.height * 0.3, (size.height - insetBottom) / 2);
  const flatScale = Math.min(size.width / FLAT_WIDTH, size.height / FLAT_HEIGHT) * zoom;
  /** Пикселей на радиан: по нему решается, помещается ли подпись */
  const scale = mode === 'globe' ? radius : flatScale;

  const [geography, setGeography] = useState<Geography | null>(null);
  useEffect(() => {
    if (!showGeography || geography) return;
    let alive = true;
    loadGeography().then((loaded) => alive && setGeography(loaded));
    return () => {
      alive = false;
    };
  }, [showGeography, geography]);

  const [detailedLand, setDetailedLand] = useState<FeatureCollection<MultiPolygon> | null>(null);
  const wantsDetail = scale >= LAND_DETAIL_FROM;
  useEffect(() => {
    if (!wantsDetail || detailedLand) return;
    let alive = true;
    loadDetailedLand().then((land) => alive && setDetailedLand(land));
    return () => {
      alive = false;
    };
  }, [wantsDetail, detailedLand]);

  const project = useCallback((): GeoProjection => {
    if (mode === 'flat') {
      return geoNaturalEarth1()
        .scale(flatScale)
        .translate([size.width / 2, centerY + panY])
        .rotate([rotation[0], 0])
        .clipExtent([[-40, -40], [size.width + 40, size.height + 40]]);
    }
    // clipExtent — обрезка по краю экрана: вблизи государства в десятки раз
    // больше холста, и без неё канва заливает всё, что далеко за кадром
    const margin = 40;
    return geoOrthographic()
      .translate([size.width / 2, centerY])
      .scale(radius)
      .rotate([rotation[0], rotation[1]])
      .clipAngle(90)
      .clipExtent([[-margin, -margin], [size.width + margin, size.height + margin]]);
  }, [mode, size.width, size.height, radius, flatScale, rotation, panY, centerY]);

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

    const targetZoom = focus.zoom ?? Math.max(zoom, mode === 'globe' ? 2.4 : 3);
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
    const cy = centerY;
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

    // Океан — плотной заливкой, а на шаре ещё и блик слева сверху
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.fillStyle = tones.ocean;
    ctx.fill();
    if (mode === 'globe') {
      const light = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, radius * 0.1, cx, cy, radius);
      light.addColorStop(0, dark ? 'rgba(122, 162, 247, 0.14)' : 'rgba(255, 255, 255, 0.5)');
      light.addColorStop(1, 'rgba(122, 162, 247, 0)');
      ctx.fillStyle = light;
      ctx.fill();
    }

    // Сетка параллелей и меридианов
    ctx.beginPath();
    path(geoGraticule10());
    ctx.strokeStyle = colors.border;
    ctx.globalAlpha = 0.25;
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

    // Суша: вблизи — подробная, пока шар не крутится
    const landSource = detailedLand && scale >= LAND_DETAIL_FROM && !moving ? detailedLand : worldLand();
    const land = shapePath(landSource as unknown as Area);
    ctx.fillStyle = tones.land;
    ctx.fill(land);

    const centre: [number, number] = [-rotation[0], -rotation[1]];
    /**
     * Насколько далеко от центра вида ещё что-то видно, в радианах. На общем
     * виде — полушарие, вблизи — несколько градусов: тогда Китай и Америку
     * незачем проецировать, когда смотришь на Саксонию
     */
    const reach = Math.min(Math.PI / 2 + 0.35, (Math.hypot(size.width, size.height) / 2 / radius) * 1.2 + 0.05);
    /** Рамка карты в градусах; null — через антимеридиан, не отсекаем */
    let flatView: [number, number, number, number] | null = null;
    if (mode === 'flat') {
      const nw = projection.invert?.([0, 0]);
      const se = projection.invert?.([size.width, size.height]);
      if (nw && se && nw.every(Number.isFinite) && se.every(Number.isFinite) && nw[0] < se[0] && se[0] - nw[0] < 300) {
        flatView = [nw[0] - 2, se[1] - 2, se[0] + 2, nw[1] + 2];
      }
    }
    /** Видна ли область хотя бы краем: ближайшая к центру вида точка её рамки — в пределах видимого */
    const facing = (bbox: [number, number, number, number]) => {
      const [w, s, e, n] = bbox;
      if (mode === 'flat') {
        return !flatView || !(e < flatView[0] || w > flatView[2] || n < flatView[1] || s > flatView[3]);
      }
      if (w > e) return true;
      const lat = Math.max(s, Math.min(n, centre[1]));
      let lon = centre[0];
      if (lon < w || lon > e) {
        const gap = (edge: number) => Math.abs((((lon - edge) % 360) + 540) % 360 - 180);
        lon = gap(w) < gap(e) ? w : e;
      }
      return geoDistance([lon, lat], centre) <= reach;
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

    // Всё политическое — внутри суши. Границы Cliopatria и береговая линия
    // из разных источников, и без обрезки государства заползали в море
    ctx.save();
    ctx.clip(land);

    // Народы и культуры фоном — только там, где нет государств: иначе
    // бледные «германские племена» просвечивали бы сквозь Римскую империю.
    // Фон рисуется целиком, а под государствами стирается заливкой суши —
    // маска на отдельном холсте растрировала бы сотню границ второй раз
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
      ctx.fillStyle = tones.land;
      ctx.fill(borderLines);
    }

    // Государства: цвета атласа — соседи различимы, у каждого свой цвет во все века
    for (const { shape, path: statePath } of bases) {
      // Без сведений при раскраске — серым: честнее, чем случайный цвет
      ctx.fillStyle = shape.nodata
        ? colors.foreground
        : `hsl(${shape.hue} ${shape.muted ? 12 : tones.stateSaturation}% ${tones.stateLightness}%)`;
      const emphasis = shape.emphasis === 'on' ? 2 : shape.emphasis === 'off' ? 0.4 : 1;
      // Тематическая раскраска — насыщеннее: это карта-схема, цвет здесь и есть смысл
      const thematic = shape.category ? (shape.muted ? 1.1 : 1.6) : 1;
      const base = Math.min(0.85, (shape.nodata ? tones.stateAlpha * 0.35 : tones.stateAlpha * thematic) * emphasis);
      ctx.globalAlpha = Math.min(0.95, shape.key === selectedKey ? base * 1.9 : shape.key === hoveredKey ? base * 1.45 : base);
      ctx.fill(statePath);
    }

    // Границы государств — тёмные и чёткие: на этой карте они главное.
    // Все одним штрихом: сотня вызовов stroke дороже одного
    ctx.globalAlpha = dark ? 0.42 : 0.5;
    ctx.strokeStyle = tones.border;
    ctx.lineWidth = Math.min(1.5, 0.45 + scale / 1800);
    ctx.stroke(borderLines);

    // Объединения — широкой полупрозрачной полосой и пунктиром поверх:
    // Священная Римская империя не стирает княжества, а обводит их
    for (const shape of unions) {
      const unionPath = shapePath(lod(shape));
      ctx.setLineDash([]);
      ctx.strokeStyle = tones.border;
      ctx.globalAlpha = 0.07;
      ctx.lineWidth = 7;
      ctx.stroke(unionPath);
      ctx.setLineDash([5, 4]);
      ctx.globalAlpha = shape.key === selectedKey ? 0.9 : 0.55;
      ctx.lineWidth = shape.key === selectedKey ? 1.6 : 1;
      ctx.stroke(unionPath);
    }
    ctx.setLineDash([]);

    // Участники войны — обводкой, чтобы видно было и союзников, и противников
    ctx.strokeStyle = tones.border;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.4;
    for (const { shape, path: statePath } of bases) {
      if (shape.emphasis === 'on') ctx.stroke(statePath);
    }

    // Выбранное государство — чёткой обводкой
    const selectedShape = bases.find(({ shape }) => shape.key === selectedKey);
    if (selectedShape) {
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 2;
      ctx.stroke(selectedShape.path);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Вода поверх суши: озёра — цветом моря, реки — линиями. Сколько рек
    // показывать — по приближению: на общем виде Нил и Волга, вблизи — Тибр
    const riverRank = scale < 380 ? 2 : scale < 600 ? 3 : scale < 900 ? 4 : scale < 1500 ? 5 : scale < 2500 ? 6 : 7;
    if (geography && showGeography) {
      const pixels = (bbox: [number, number, number, number]) =>
        Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]) * (Math.PI / 180) * scale;
      const lakes = new Path2D();
      const lakesPath = geoPath(fast, lakes as unknown as CanvasRenderingContext2D);
      for (const lake of geography.lakes) {
        if (pixels(lake.bbox) < (moving ? 8 : 3) || !facing(lake.bbox)) continue;
        lakesPath(lake.feature);
      }
      ctx.fillStyle = tones.ocean;
      ctx.fill(lakes);

      // Реки — по рангам: у крупных линия толще; каждая толщина — одним штрихом
      const limit = moving ? Math.min(riverRank, 4) : riverRank;
      const byRank = new Map<number, Path2D>();
      for (const river of geography.rivers) {
        if (river.rank > limit || !facing(river.bbox)) continue;
        const rank = Math.min(river.rank, 7);
        let p = byRank.get(rank);
        if (!p) {
          p = new Path2D();
          byRank.set(rank, p);
        }
        geoPath(fast, p as unknown as CanvasRenderingContext2D)(river.feature);
      }
      ctx.strokeStyle = tones.water;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const zoomWidth = Math.min(1.7, Math.max(0.7, scale / 900));
      for (const [rank, p] of byRank) {
        ctx.globalAlpha = dark ? 0.65 : 0.75;
        ctx.lineWidth = Math.max(0.4, (1.5 - rank * 0.15) * zoomWidth);
        ctx.stroke(p);
      }
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = tones.coast;
      ctx.lineWidth = 0.5;
      ctx.stroke(lakes);
      ctx.globalAlpha = 1;
    }

    // Берег — последним из подложки: тонко, цветом воды
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = tones.coast;
    ctx.lineWidth = Math.min(1.1, 0.5 + scale / 2500);
    ctx.stroke(land);
    ctx.globalAlpha = 1;

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

    // Столицы — маленькими квадратами: точка заметки круглая, их не спутать
    const selectedState = selection?.kind === 'state' ? selection.key : null;
    const capitalSpots: Array<{ capital: CapitalPoint; x: number; y: number; active: boolean }> = [];
    for (const capital of capitals) {
      const coords: [number, number] = [capital.lon, capital.lat];
      if (!isVisible(coords)) continue;
      const xy = projection(coords);
      if (!xy || xy[0] < 0 || xy[1] < 0 || xy[0] > size.width || xy[1] > size.height) continue;
      const active = capital.key === selectedState;
      const half = active ? 3.5 : 2.5;
      ctx.fillStyle = colors.background;
      ctx.fillRect(xy[0] - half, xy[1] - half, half * 2, half * 2);
      ctx.strokeStyle = colors.foreground;
      ctx.globalAlpha = active ? 1 : 0.7;
      ctx.lineWidth = active ? 1.4 : 1;
      ctx.strokeRect(xy[0] - half, xy[1] - half, half * 2, half * 2);
      ctx.globalAlpha = 1;
      capitalSpots.push({ capital, x: xy[0], y: xy[1], active });
    }

    // Города-ориентиры: пустые кружки, чтобы не спутать с заметками (залитые),
    // людьми (голубые) и столицами (квадраты). Сколько рисовать — по приближению,
    // считая только видимые: вблизи Европы это сотни, на общем виде — ни одного
    // Город — ориентир, а не главное: на среднем приближении их вдвое меньше, чем помещается
    const cityBudget = scale < 450 ? 0 : Math.round(Math.min(6000, 15 * Math.pow(scale / 450, 2.2) * density));
    const citySpots: Array<{ city: CityPoint; x: number; y: number; active: boolean }> = [];
    const activeCity = (id: string) => isSelected('city', id) || isHovered('city', id);
    const spotOf = (city: CityPoint) => {
      const coords: [number, number] = [city.lon, city.lat];
      if (!isVisible(coords)) return null;
      const xy = projection(coords);
      return xy && xy[0] >= 0 && xy[1] >= 0 && xy[0] <= size.width && xy[1] <= size.height ? xy : null;
    };
    // Что в кадре: у шара — угол от центра вида, у карты — рамка в градусах
    let inView: (i: number) => boolean = () => true;
    if (mode === 'globe') {
      const reach = Math.min(Math.PI / 2, (Math.hypot(size.width, size.height) / 2 / radius) * 1.15);
      const lon = -rotation[0] * Math.PI / 180;
      const lat = -rotation[1] * Math.PI / 180;
      const [cx, cy, cz] = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
      const limit = Math.cos(reach);
      inView = (i) => cityVectors[i * 3] * cx + cityVectors[i * 3 + 1] * cy + cityVectors[i * 3 + 2] * cz >= limit;
    } else {
      const nw = projection.invert?.([0, 0]);
      const se = projection.invert?.([size.width, size.height]);
      if (nw && se && nw.every(Number.isFinite) && se.every(Number.isFinite) && nw[0] < se[0] && se[0] - nw[0] < 300) {
        inView = (i) => {
          const city = cities[i];
          return city.lon >= nw[0] - 2 && city.lon <= se[0] + 2 && city.lat <= nw[1] + 2 && city.lat >= se[1] - 2;
        };
      }
    }

    // Три размера — три пути: одна заливка и одна обводка на сотни точек
    // вместо пары вызовов на каждую. Вблизи их сотни, и это заметно в кадре
    const cityPaths = [new Path2D(), new Path2D(), new Path2D()];
    const CITY_RADII = [3, 2.5, 2];
    for (let i = 0; i < cities.length; i++) {
      if (citySpots.length >= cityBudget) break;
      if (!inView(i)) continue;
      const city = cities[i];
      const xy = spotOf(city);
      if (!xy) continue;
      const active = activeCity(city.id);
      if (!active) {
        const group = city.rank < 150 ? 0 : city.rank < 1000 ? 1 : 2;
        cityPaths[group].moveTo(xy[0] + CITY_RADII[group], xy[1]);
        cityPaths[group].arc(xy[0], xy[1], CITY_RADII[group], 0, Math.PI * 2);
      }
      citySpots.push({ city, x: xy[0], y: xy[1], active });
    }
    // Выбранный или наведённый город рисуется, даже если в бюджет не попал
    for (const city of cities) {
      if (!activeCity(city.id) || citySpots.some((spot) => spot.city.id === city.id)) continue;
      const xy = spotOf(city);
      if (xy) citySpots.push({ city, x: xy[0], y: xy[1], active: true });
    }
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.9;
    for (const p of cityPaths) ctx.fill(p);
    ctx.strokeStyle = colors.foreground;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    for (const p of cityPaths) ctx.stroke(p);
    for (const { x, y, active } of citySpots) {
      if (!active) continue;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.globalAlpha = 1;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    shownCitiesRef.current = citySpots;

    // Фон «а в это время»: мелко и бледно, чтобы не спорить с заметками.
    // Сколько точек рисовать — зависит от приближения: на общем виде
    // полсотни самых известных, вблизи — сотни. Массив уже отсортирован
    // по известности, поэтому берём первых видимых
    const perKind = Math.round(Math.min(600, 45 * density * Math.pow(Math.max(1, scale / 400), 1.6)));
    const drawnByKind = { event: 0, person: 0, battle: 0 };
    const shownContext: Array<{ point: ContextPoint; x: number; y: number }> = [];
    for (const point of context) {
      const own = point.kind === 'battle' ? 'kb' : 'context';
      if (point.kind !== 'battle' && drawnByKind[point.kind] >= perKind && !isSelected(own, point.id)) continue;
      const coords: [number, number] = [point.lon, point.lat];
      if (!isVisible(coords)) continue;
      const xy = projection(coords);
      if (!xy || xy[0] < 0 || xy[1] < 0 || xy[0] > size.width || xy[1] > size.height) continue;
      drawnByKind[point.kind] += 1;
      shownContext.push({ point, x: xy[0], y: xy[1] });
      const active = isSelected(own, point.id) || isHovered(own, point.id);
      const r = point.kind === 'battle' ? (active ? 6 : 4.5) : active ? 4.5 : 2.6;
      ctx.fillStyle = point.kind === 'battle' ? '#e5484d' : point.kind === 'event' ? tones.event : tones.person;
      ctx.globalAlpha = active ? 1 : 0.75;
      ctx.beginPath();
      if (point.kind !== 'person') {
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
    shownContextRef.current = shownContext.map((c) => c.point);

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
      // На общем виде — только места с заметками погуще; вблизи подписываются
      // все, где есть место: это свои заметки, безымянная точка — потеря
      if (!forced && marker.weight <= 0.18 && scale < 600) continue;

      ctx.font = `${selected ? '600 ' : ''}12px -apple-system, Segoe UI, sans-serif`;
      const width = ctx.measureText(marker.label ?? marker.place.title).width + 4;

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
      placeLabels.push({ text: marker.label ?? marker.place.title, x: spot.x, y, bold: selected, forced });
    }

    /** Подпись с ореолом цвета подложки: читается поверх заливок, рек и границ */
    const haloText = (text: string, x: number, y: number, fill: string, alpha: number) => {
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = tones.halo;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.fillText(text, x, y);
    };
    /** Разрядка (как в атласе у крупных подписей) — где браузер её умеет */
    const tracked = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    const setTracking = (px: number) => {
      if ('letterSpacing' in tracked) tracked.letterSpacing = `${px}px`;
    };
    const measure = (text: string, tracking: number) => {
      setTracking(0);
      return ctx.measureText(text).width + tracking * Math.max(0, text.length - 1);
    };
    const onScreen = (p: [number, number] | null): p is [number, number] =>
      p !== null && p[0] >= 0 && p[1] >= 0 && p[0] <= size.width && p[1] <= size.height;

    // Подписи государств — как в атласе: крупные крупно и вразрядку, мелкие —
    // только если название помещается в собственные границы
    const pixelArea = (s: StateLayer) => s.size * scale * scale;
    for (const shape of bases.map((b) => b.shape).sort((a, b) => b.size - a.size)) {
      const chosen = shape.key === selectedKey;
      if (!chosen && !showLabels) continue;
      if (!isVisible(shape.label)) continue;
      const point = projection(shape.label) as [number, number] | null;
      if (!onScreen(point)) continue;
      const area = pixelArea(shape);
      const big = area > 90000;
      const fontSize = Math.round(Math.min(20, Math.max(10.5, 8 + Math.sqrt(area) / 32)));
      const tracking = big ? Math.round(fontSize * 0.22) : 0;
      ctx.font = `${big ? 600 : 500} ${fontSize}px ${SANS}`;
      const text = big ? shape.ru.toUpperCase() : shape.ru;
      const lines = splitLabel(text, (t) => measure(t, tracking), Math.sqrt(area) * 1.5);
      const width = Math.max(...lines.map((l) => measure(l, tracking))) + 6;
      const lineHeight = fontSize + 2;
      const height = lines.length * lineHeight;
      if (!chosen && width * height * 2 > area) continue;
      const x = point[0] - width / 2;
      const y = point[1] - height / 2;
      if (!fits(x, y, width, height)) continue;
      boxes.push({ x, y, w: width, h: height });
      ctx.textAlign = 'center';
      setTracking(tracking);
      lines.forEach((line, i) =>
        haloText(line, point[0], y + (i + 0.5) * lineHeight, tones.border, chosen ? 0.95 : big ? 0.5 : 0.62)
      );
      setTracking(0);
      ctx.textAlign = 'left';
    }
    ctx.globalAlpha = 1;

    // Моря и океаны: курсивом и вразрядку, крупные — издалека, заливы — вблизи
    if (geography && showGeography && showLabels) {
      const seaRank = scale < 420 ? 1 : scale < 700 ? 2 : scale < 1200 ? 4 : scale < 2200 ? 6 : 9;
      ctx.textAlign = 'center';
      for (const label of geography.labels) {
        const ocean = label.kind === 'ocean';
        if (!ocean && label.kind !== 'sea') continue;
        if (ocean ? scale > 1600 : label.rank > seaRank) continue;
        const at: [number, number] = [label.lon, label.lat];
        if (!isVisible(at)) continue;
        const point = projection(at) as [number, number] | null;
        if (!onScreen(point)) continue;
        const fontSize = ocean ? 13 : label.rank <= 1 ? 12 : 11;
        const tracking = ocean ? 4 : 1;
        ctx.font = `italic ${fontSize}px ${SERIF}`;
        const text = ocean ? label.name.toUpperCase() : label.name;
        const lines = splitLabel(text, (t) => measure(t, tracking), ocean ? 240 : 120);
        const width = Math.max(...lines.map((l) => measure(l, tracking))) + 4;
        const lineHeight = fontSize + 3;
        const x = point[0] - width / 2;
        const y = point[1] - (lines.length * lineHeight) / 2;
        if (!fits(x, y, width, lines.length * lineHeight)) continue;
        boxes.push({ x, y, w: width, h: lines.length * lineHeight });
        setTracking(tracking);
        ctx.fillStyle = tones.sea;
        ctx.globalAlpha = ocean ? 0.5 : 0.72;
        lines.forEach((line, i) => ctx.fillText(line, point[0], y + (i + 0.5) * lineHeight));
        setTracking(0);
      }
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    // Столицы подписываются вблизи — и всегда у выбранного государства
    ctx.font = `10.5px ${SANS}`;
    for (const { capital, x, y, active } of capitalSpots) {
      if (!active && (scale < 650 || !showLabels)) continue;
      const width = ctx.measureText(capital.name).width + 4;
      const spot = { x: x + 6, y: y - 7 };
      if (!active && !fits(spot.x, spot.y, width, 13)) continue;
      boxes.push({ x: spot.x, y: spot.y, w: width, h: 13 });
      haloText(capital.name, spot.x, y, colors.foreground, active ? 0.95 : 0.7);
    }
    ctx.globalAlpha = 1;

    // Хребты, пустыни и крупные озёра — курсивом цвета рельефа и воды
    if (geography && showGeography && showLabels) {
      const reliefRank = scale < 450 ? 1 : scale < 800 ? 2 : scale < 1400 ? 3 : scale < 2400 ? 4 : 6;
      const lakeRank = scale < 600 ? 1 : scale < 1000 ? 2 : scale < 1800 ? 3 : 4;
      ctx.textAlign = 'center';
      for (const label of geography.labels) {
        const lake = label.kind === 'lake';
        if (label.kind !== 'range' && label.kind !== 'desert' && !lake) continue;
        if (label.rank > (lake ? lakeRank : reliefRank)) continue;
        const at: [number, number] = [label.lon, label.lat];
        if (!isVisible(at)) continue;
        const point = projection(at) as [number, number] | null;
        if (!onScreen(point)) continue;
        const range = label.kind === 'range';
        const tracking = range ? 2 : 0;
        ctx.font = `italic ${lake ? 10.5 : 11}px ${SERIF}`;
        const text = range ? label.name.toUpperCase() : label.name;
        const lines = splitLabel(text, (t) => measure(t, tracking), 130);
        const width = Math.max(...lines.map((l) => measure(l, tracking))) + 4;
        const lineHeight = 13;
        const x = point[0] - width / 2;
        const y = point[1] - (lines.length * lineHeight) / 2;
        if (!fits(x, y, width, lines.length * lineHeight)) continue;
        boxes.push({ x, y, w: width, h: lines.length * lineHeight });
        setTracking(tracking);
        lines.forEach((line, i) =>
          haloText(line, point[0], y + (i + 0.5) * lineHeight, lake ? tones.sea : tones.relief, 0.78)
        );
        setTracking(0);
      }
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    // Подписи городов: самые известные — первыми, сколько поместится
    // Пока карту тянут — только самые известные: остальные подпишутся, когда она остановится
    const cityLabels =
      !showLabels || scale < 650 ? 0 : Math.round(Math.min(moving ? 40 : 400, 7 * Math.pow(scale / 650, 2) * density));
    let cityLabelled = 0;
    for (const { city, x, y, active } of citySpots) {
      if (cityLabelled >= cityLabels && !active) continue;
      ctx.font = `${city.rank < 150 || active ? '500 ' : ''}${city.rank < 150 || active ? 11 : 10.5}px ${SANS}`;
      const width = widthOf(ctx, ctx.font, city.name) + 4;
      const right = { x: x + 5, y: y - 7 };
      const left = { x: x - 5 - width, y: y - 7 };
      const spot = fits(right.x, right.y, width, 13) ? right : fits(left.x, left.y, width, 13) ? left : active ? right : null;
      if (!spot) continue;
      boxes.push({ x: spot.x, y: spot.y, w: width, h: 13 });
      haloText(city.name, spot.x, y, colors.foreground, active ? 1 : city.rank < 150 ? 0.8 : 0.6);
      cityLabelled += 1;
    }
    ctx.globalAlpha = 1;

    // Реки — подписью вдоль русла, у самого длинного куска
    if (geography && showGeography && showLabels && scale >= 650 && !moving) {
      ctx.font = `italic 10.5px ${SERIF}`;
      ctx.textAlign = 'center';
      for (const river of geography.rivers) {
        if (!river.name || river.rank > riverRank || !facing(river.bbox)) continue;
        const geometry = river.feature.geometry;
        const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
        const line = lines.reduce((a, b) => (b.length > a.length ? b : a));
        // Самый длинный видимый отрезок русла
        let run: Array<[number, number]> = [];
        let best: Array<[number, number]> = [];
        for (const c of line) {
          const at = c as [number, number];
          const p = isVisible(at) ? (projection(at) as [number, number] | null) : null;
          if (onScreen(p)) run.push(p);
          else {
            if (run.length > best.length) best = run;
            run = [];
          }
        }
        if (run.length > best.length) best = run;
        if (best.length < 4) continue;
        let length = 0;
        for (let i = 1; i < best.length; i++) length += Math.hypot(best[i][0] - best[i - 1][0], best[i][1] - best[i - 1][1]);
        const width = measure(river.name, 0);
        if (length < width * 1.8) continue;
        const mid = Math.floor(best.length / 2);
        const a = best[Math.max(0, mid - 2)];
        const b = best[Math.min(best.length - 1, mid + 2)];
        let angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        const [mx, my] = best[mid];
        const cos = Math.abs(Math.cos(angle));
        const sin = Math.abs(Math.sin(angle));
        const boxW = width * cos + 12 * sin;
        const boxH = width * sin + 12 * cos;
        if (!fits(mx - boxW / 2, my - boxH / 2, boxW, boxH)) continue;
        boxes.push({ x: mx - boxW / 2, y: my - boxH / 2, w: boxW, h: boxH });
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(angle);
        haloText(river.name, 0, -5, tones.sea, 0.85);
        ctx.restore();
      }
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    // Сражения выбранной войны подписываются всегда: их немного, и ради них карту и открыли
    ctx.font = '600 10.5px -apple-system, Segoe UI, sans-serif';
    for (const { point, x, y } of shownContext) {
      if (point.kind !== 'battle') continue;
      const text = point.title.length > 34 ? `${point.title.slice(0, 33)}…` : point.title;
      const width = ctx.measureText(text).width + 4;
      const spot = { x: x + 7, y: y - 6 };
      if (!fits(spot.x, spot.y, width, 12)) continue;
      boxes.push({ x: spot.x, y: spot.y, w: width, h: 12 });
      ctx.fillStyle = '#e5484d';
      ctx.fillText(text, spot.x, y);
    }

    // Вблизи — подписи самых известных событий и людей, если есть место
    if (showLabels && scale >= 800) {
      const limit = Math.round(Math.min(60, (scale / 60) * density));
      let labelled = 0;
      ctx.font = 'italic 10.5px -apple-system, Segoe UI, sans-serif';
      for (const { point, x, y } of shownContext) {
        if (labelled >= limit) break;
        if (point.kind === 'battle') continue;
        // Без русского названия — только в подсказке: на карте смесь языков читается хуже
        if (!/[а-яё]/i.test(point.title)) continue;
        const text = point.title.length > 34 ? `${point.title.slice(0, 33)}…` : point.title;
        const width = ctx.measureText(text).width + 4;
        const spot = { x: x + 5, y: y - 6 };
        if (!fits(spot.x, spot.y, width, 12)) continue;
        boxes.push({ x: spot.x, y: spot.y, w: width, h: 12 });
        ctx.fillStyle = point.kind === 'event' ? tones.event : tones.person;
        ctx.globalAlpha = 0.9;
        ctx.fillText(text, spot.x, y);
        labelled += 1;
      }
      ctx.globalAlpha = 1;
    }

    for (const label of placeLabels) {
      ctx.font = `${label.bold ? '600 ' : ''}12px ${SANS}`;
      haloText(label.text, label.x, label.y, colors.foreground, label.forced ? 1 : 0.9);
    }
    ctx.globalAlpha = 1;

    // Линия жизни: пунктир от места рождения к месту смерти и метка на конце
    if (lifeLine && (isVisible(lifeLine.from) || isVisible(lifeLine.to))) {
      const rgb = dark ? '255, 77, 166' : '214, 31, 122';
      ctx.beginPath();
      path({ type: 'LineString', coordinates: [lifeLine.from, lifeLine.to] });
      ctx.strokeStyle = `rgb(${rgb})`;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      const end = isVisible(lifeLine.to) ? projection(lifeLine.to) : null;
      if (end) {
        ctx.beginPath();
        ctx.arc(end[0], end[1], 4, 0, Math.PI * 2);
        ctx.fillStyle = colors.background;
        ctx.globalAlpha = 1;
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.font = '500 11px -apple-system, Segoe UI, sans-serif';
        ctx.fillStyle = colors.foreground;
        ctx.globalAlpha = 0.9;
        ctx.fillText(lifeLine.label, end[0] + 8, end[1] + 0.5);
      }
      ctx.globalAlpha = 1;
    }

    // Выбранное — последним, поверх подписей: сияние, кольцо и подпись на подложке
    let pulseAt: [number, number] | null = null;
    if (spotlight && isVisible([spotlight.lon, spotlight.lat])) {
      const xy = projection([spotlight.lon, spotlight.lat]);
      if (xy && xy[0] >= 0 && xy[1] >= 0 && xy[0] <= size.width && xy[1] <= size.height) {
        const [x, y] = xy;
        // Пурпурный — цвет, которого нет ни у одного слоя: жёлтые и зелёные места, голубые люди, красные сражения
        const rgb = dark ? '255, 77, 166' : '214, 31, 122';
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 34);
        glow.addColorStop(0, `rgba(${rgb}, 0.5)`);
        glow.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 34, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = `rgb(${rgb})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.fill();
        ctx.strokeStyle = colors.background;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = '600 12.5px -apple-system, Segoe UI, sans-serif';
        const text = spotlight.label.length > 42 ? `${spotlight.label.slice(0, 41)}…` : spotlight.label;
        const w = ctx.measureText(text).width + 16;
        const h = 24;
        // Справа, иначе слева; на узком экране не влезает ни туда, ни туда — над точкой
        let lx = x + 20 + w <= size.width - 4 ? x + 20 : x - 20 - w;
        let ly = y - h / 2;
        if (lx < 4) {
          lx = Math.max(4, Math.min(size.width - w - 4, x - w / 2));
          ly = y - 22 - h;
        }
        ctx.beginPath();
        ctx.roundRect(lx, ly, w, h, 6);
        ctx.fillStyle = colors.background;
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgb(${rgb})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = colors.foreground;
        ctx.fillText(text, lx + 8, ly + h / 2 + 0.5);
        pulseAt = [x, y];
      }
    }
    const pulse = pulseRef.current;
    if (pulse) {
      pulse.style.display = pulseAt ? 'block' : 'none';
      if (pulseAt) pulse.style.transform = `translate(${pulseAt[0] - 20}px, ${pulseAt[1] - 20}px)`;
    }
  }, [
    size, colors, dark, mode, radius, scale, project, isVisible, markers, arcs, moving,
    states, background, context, capitals, cities, cityVectors, selection, hover, rotation, density, showLabels, spotlight, lifeLine,
    geography, detailedLand, showGeography,
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
      for (const point of shownContextRef.current) {
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
          selection: bestPoint.kind === 'battle' ? { kind: 'kb', id: bestPoint.id } : { kind: 'context', id: bestPoint.id },
          title: bestPoint.title,
          sub: bestPoint.sub,
        };
      }

      let bestCity: CityPoint | null = null;
      bestDistance = 7;
      for (const { city } of shownCitiesRef.current) {
        const xy = projection([city.lon, city.lat]);
        if (!xy) continue;
        const distance = Math.hypot(px - xy[0], py - xy[1]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCity = city;
        }
      }
      if (bestCity) {
        return { selection: { kind: 'city', id: bestCity.id }, title: bestCity.name, sub: bestCity.sub };
      }

      for (const capital of capitals) {
        const coords: [number, number] = [capital.lon, capital.lat];
        if (!isVisible(coords)) continue;
        const xy = projection(coords);
        if (xy && Math.hypot(px - xy[0], py - xy[1]) < 7) {
          return {
            selection: { kind: 'state', key: capital.key },
            title: capital.name,
            sub: capital.state ? `столица: ${capital.state}` : 'столица',
          };
        }
      }

      const lonLat = projection.invert?.([px, py]);
      if (!lonLat || !Number.isFinite(lonLat[0]) || !Number.isFinite(lonLat[1])) return null;
      // У шара invert отвечает и за пределами диска — там ничего нет
      if (mode === 'globe' && Math.hypot(px - size.width / 2, py - centerY) > radius) {
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
        const sub = [
          state.category ?? null,
          state.capital ? `столица: ${state.capital}` : null,
          union ? `в составе: ${union.ru}` : null,
        ].filter(Boolean);
        return {
          selection: { kind: 'state', key: state.key },
          title: state.ru,
          sub: sub.length > 0 ? sub.join(' · ') : undefined,
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
      const py = event.clientY - rect.top - centerY;
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
    if (onPoint) {
      const rect = event.currentTarget.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const outside = mode === 'globe' && Math.hypot(px - size.width / 2, py - centerY) > radius;
      const lonLat = outside ? null : project().invert?.([px, py]);
      if (lonLat && Number.isFinite(lonLat[0]) && Number.isFinite(lonLat[1])) onPoint([lonLat[0], lonLat[1]]);
      return;
    }
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
        style={{ cursor: onPoint ? 'crosshair' : hover ? 'pointer' : 'grab' }}
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
      {/* Обёртка ставит кольцо на место, анимация — внутри: ping сам анимирует transform */}
      <div ref={pulseRef} aria-hidden className="pointer-events-none absolute left-0 top-0 hidden h-10 w-10">
        <div className="h-full w-full rounded-full border-2 border-pink-600 motion-safe:animate-ping dark:border-pink-400" />
      </div>
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
