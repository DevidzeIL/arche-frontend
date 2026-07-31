/**
 * Отрисовка карты знаний на canvas.
 * Чистая функция от состояния — никакого React и никаких side-эффектов,
 * кроме рисования в переданный контекст.
 *
 * Прозрачность задаётся через ctx.globalAlpha, а не через color-mix в строке
 * цвета: canvas молча игнорирует непонятый ему цвет, и отладка такого
 * превращается в угадайку.
 */

import type { KnowledgeEdge } from '@/arche/knowledge';
import { RELATION_META } from '@/arche/relations';
import { noteTypeMeta } from '@/arche/noteTypes';
import { formatYear } from '@/arche/timeSpan';
import type { Camera, MapLayout } from './mapLayout';
import { worldXToScreen } from './mapLayout';

export interface Epoch {
  name: string;
  startYear: number;
  endYear: number;
}

export interface ThemeColors {
  background: string;
  foreground: string;
  muted: string;
  border: string;
  laneBand: string;
  epochBand: string;
}

/**
 * Canvas не понимает CSS-переменные, поэтому цвета темы вычитываются
 * из документа один раз за рендер и передаются сюда явно.
 */
export function readThemeColors(root: HTMLElement): ThemeColors {
  const style = getComputedStyle(root);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const isDark = root.classList.contains('dark');

  return {
    background: read('--background', isDark ? '#0a0a0a' : '#fafafa'),
    foreground: read('--foreground', isDark ? '#f2f2f2' : '#1a1a1a'),
    muted: read('--muted-foreground', isDark ? '#8a8a8a' : '#6a6a6a'),
    border: read('--border', isDark ? '#3a3a3a' : '#d8d8d8'),
    laneBand: isDark ? '#ffffff' : '#000000',
    epochBand: isDark ? '#ffffff' : '#000000',
  };
}

export interface MapVisualState {
  focusedId: string | null;
  hoveredId: string | null;
  /** Узлы, которые остаются яркими; null — подсветки нет, всё яркое */
  spotlight: Set<string> | null;
  /** Рёбра, которые нужно нарисовать */
  edges: KnowledgeEdge[];
  /** Рёбра цепочки «Путь» — рисуются толще и поверх остальных */
  pathEdges: Set<string>;
  /** Концы маршрута в режиме «Путь» */
  pathEndpoints: Set<string>;
}

export const AXIS_HEIGHT = 34;

const TICK_LADDER = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
/** «800 до н.э.» — самая широкая подпись, ей нужно около 70px с зазором */
const MIN_TICK_SPACING = 78;

/**
 * Шаг подписей подбирается так, чтобы соседние не наезжали друг на друга.
 * Фиксированная лестница «зум → шаг» этого не гарантирует: на дальнем зуме
 * подписи вида «800 до н.э.» слипались в сплошную полосу.
 */
function tickStep(pxPerYear: number): number {
  for (const step of TICK_LADDER) {
    if (step * pxPerYear >= MIN_TICK_SPACING) return step;
  }
  return TICK_LADDER[TICK_LADDER.length - 1];
}

export interface RenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  scrollY: number;
  camera: Camera;
  layout: MapLayout;
  epochs: Epoch[];
  colors: ThemeColors;
  visual: MapVisualState;
}

export function renderMap(params: RenderParams): void {
  const { ctx, width, height, colors } = params;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, height);

  drawEpochs(params);
  drawLanes(params);
  drawEdges(params);
  drawNodes(params);
  drawAxis(params);
}

function drawEpochs({ ctx, width, height, camera, epochs, colors }: RenderParams): void {
  ctx.save();
  ctx.font = '12px Georgia, serif';
  ctx.textBaseline = 'top';

  const bottom = height - AXIS_HEIGHT;

  epochs.forEach((epoch, index) => {
    const x1 = worldXToScreen(epoch.startYear * camera.pxPerYear, camera, width);
    const x2 = worldXToScreen(epoch.endYear * camera.pxPerYear, camera, width);
    if (x2 < 0 || x1 > width) return;

    if (index % 2 === 0) {
      ctx.globalAlpha = 0.035;
      ctx.fillStyle = colors.epochBand;
      ctx.fillRect(x1, 0, x2 - x1, bottom);
    }

    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x1) + 0.5, 0);
    ctx.lineTo(Math.round(x1) + 0.5, bottom);
    ctx.stroke();

    // Подпись прилипает к левому краю полосы, пока та видна,
    // но только если целиком помещается: иначе соседние эпохи
    // сливались в нечитаемое «ВОЗРОЖДЕНИНОВОЕВРЕМЯПРЕДМОДЕРН»
    const label = epoch.name.toUpperCase();
    const labelX = Math.max(x1 + 8, 8);
    const available = x2 - labelX - 8;

    if (available > 0 && ctx.measureText(label).width <= available) {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = colors.muted;
      ctx.fillText(label, labelX, 8);
    }
  });

  ctx.restore();
}

function drawLanes({ ctx, width, height, scrollY, layout, colors }: RenderParams): void {
  ctx.save();
  ctx.font = '11px -apple-system, Segoe UI, sans-serif';
  ctx.textBaseline = 'middle';

  const bottom = height - AXIS_HEIGHT;

  layout.lanes.forEach((lane, index) => {
    const top = lane.top - scrollY;
    if (top > bottom || top + lane.height < 0) return;

    if (index % 2 === 1) {
      ctx.globalAlpha = 0.022;
      ctx.fillStyle = colors.laneBand;
      ctx.fillRect(0, top, width, lane.height);
    }

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = colors.muted;
    ctx.fillText(lane.label.toUpperCase(), 10, top + 10);
  });

  ctx.restore();
}

function edgeOpacity(edge: KnowledgeEdge, visual: MapVisualState): number {
  if (visual.pathEdges.has(edge.id)) return 1;
  if (!visual.spotlight) return 0.45;
  return visual.spotlight.has(edge.sourceId) && visual.spotlight.has(edge.targetId) ? 0.85 : 0.1;
}

function drawEdges(params: RenderParams): void {
  const { ctx, width, height, scrollY, camera, layout, visual } = params;

  ctx.save();
  ctx.lineCap = 'round';
  const bottom = height - AXIS_HEIGHT;

  for (const edge of visual.edges) {
    const from = layout.byId.get(edge.sourceId);
    const to = layout.byId.get(edge.targetId);
    if (!from || !to) continue;

    const x1 = worldXToScreen(from.worldX, camera, width);
    const x2 = worldXToScreen(to.worldX, camera, width);
    const y1 = from.y - scrollY;
    const y2 = to.y - scrollY;

    if (Math.max(x1, x2) < -50 || Math.min(x1, x2) > width + 50) continue;
    if (Math.max(y1, y2) < 0 || Math.min(y1, y2) > bottom) continue;

    const meta = RELATION_META[edge.kind];
    const isPath = visual.pathEdges.has(edge.id);

    ctx.globalAlpha = edgeOpacity(edge, visual);
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = isPath ? 2.5 : 1.2;
    ctx.setLineDash(isPath ? [] : meta.dash);

    // S-образная кривая читается лучше прямой, когда концы в разных дорожках
    const dx = x2 - x1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + dx * 0.4, y1, x1 + dx * 0.6, y2, x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Стрелка показывает причинность: время течёт от источника к цели
    if (!edge.undirected && (isPath || visual.spotlight)) {
      drawArrowHead(ctx, x2, y2, dx >= 0, meta.color);
    }
  }

  ctx.restore();
}

/**
 * Кривая приходит в конечную точку горизонтально (вторая контрольная точка
 * имеет тот же y), поэтому стрелку достаточно повернуть по знаку dx.
 */
function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pointsRight: boolean,
  color: string
): void {
  const size = 6;

  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(x, y);
  ctx.rotate(pointsRight ? 0 : Math.PI);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * 0.45);
  ctx.lineTo(-size, size * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawNodes(params: RenderParams): void {
  const { ctx, width, height, scrollY, camera, layout, colors, visual } = params;

  ctx.save();
  ctx.textBaseline = 'middle';
  const bottom = height - AXIS_HEIGHT;

  for (const item of layout.nodes) {
    const x = worldXToScreen(item.worldX, camera, width);
    const y = item.y - scrollY;

    if (x < -220 || x > width + 220) continue;
    if (y < -20 || y > bottom + 20) continue;

    const id = item.node.id;
    const lit = !visual.spotlight || visual.spotlight.has(id);
    const isFocused = visual.focusedId === id;
    const isHovered = visual.hoveredId === id;
    const isEndpoint = visual.pathEndpoints.has(id);
    const emphasised = isFocused || isHovered || isEndpoint;

    ctx.globalAlpha = lit ? 1 : 0.16;

    ctx.beginPath();
    ctx.arc(x, y, item.radius + (isFocused || isHovered ? 2 : 0), 0, Math.PI * 2);
    ctx.fillStyle = noteTypeMeta(item.node.type).graphColor;
    ctx.fill();

    if (isFocused || isEndpoint) {
      ctx.strokeStyle = colors.foreground;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Неподписанный узел остаётся точкой — так видно настоящую плотность
    if (!item.labeled && !emphasised) continue;

    // Подписи основным цветом и почти без прозрачности: приглушённый
    // серый на тёмном фоне читался плохо
    ctx.globalAlpha = lit ? (emphasised ? 1 : 0.92) : 0.16;
    ctx.font = `${emphasised ? '600 ' : ''}13px -apple-system, Segoe UI, sans-serif`;
    ctx.fillStyle = colors.foreground;
    ctx.fillText(item.label, x + item.radius + 6, y + 0.5);
  }

  ctx.restore();
}

function drawAxis({ ctx, width, height, camera, colors }: RenderParams): void {
  const top = height - AXIS_HEIGHT;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, top, width, AXIS_HEIGHT);

  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, top + 0.5);
  ctx.lineTo(width, top + 0.5);
  ctx.stroke();

  const step = tickStep(camera.pxPerYear);
  const halfSpanYears = width / 2 / camera.pxPerYear;
  const firstTick = Math.ceil((camera.centerYear - halfSpanYears) / step) * step;
  const lastTick = camera.centerYear + halfSpanYears;

  ctx.font = '10px -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let year = firstTick; year <= lastTick; year += step) {
    const x = worldXToScreen(year * camera.pxPerYear, camera, width);

    ctx.strokeStyle = colors.border;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, top);
    ctx.lineTo(Math.round(x) + 0.5, top + 6);
    ctx.stroke();

    ctx.fillStyle = colors.muted;
    ctx.fillText(formatYear(year, 'exact'), x, top + 10);
  }

  ctx.restore();
}
