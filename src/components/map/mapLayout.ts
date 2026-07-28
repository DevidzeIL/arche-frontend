/**
 * Раскладка карты знаний.
 *
 * Узел — точка с подписью, а не карточка: только так на экран помещаются
 * сотни элементов. Подписи расставляются жадно по подстрокам внутри дорожки;
 * то, что не поместилось, остаётся точкой без подписи — плотность видно
 * всегда, а не «ещё +7» под обрезанным списком.
 *
 * Координаты считаются в МИРОВЫХ единицах (год × pxPerYear), поэтому
 * при панорамировании раскладку пересчитывать не нужно — только при зуме.
 */

import type { KnowledgeNode } from '@/arche/knowledge';
import { NOTE_TYPES_ORDERED, noteTypeMeta } from '@/arche/noteTypes';

export interface Camera {
  /** Год в центре экрана */
  centerYear: number;
  pxPerYear: number;
}

export interface LaidOutNode {
  node: KnowledgeNode;
  /** Мировая координата: year * pxPerYear */
  worldX: number;
  y: number;
  radius: number;
  /** Подпись помещается и будет нарисована */
  labeled: boolean;
  label: string;
  labelWidth: number;
  lane: string;
}

export interface Lane {
  key: string;
  label: string;
  top: number;
  height: number;
  rows: number;
}

export interface MapLayout {
  nodes: LaidOutNode[];
  byId: Map<string, LaidOutNode>;
  lanes: Lane[];
  contentHeight: number;
}

const ROW_HEIGHT = 26;
const LANE_PADDING = 12;
/** Полоса под названия эпох поверх всей карты */
export const EPOCH_STRIP_HEIGHT = 28;
const LANE_HEADER = 18;
const MAX_ROWS_PER_LANE = 5;
const CHAR_WIDTH = 6.1; // приблизительная ширина символа при 11px
const LABEL_GAP = 14;
const MAX_LABEL_CHARS = 26;

function truncate(title: string): string {
  return title.length > MAX_LABEL_CHARS ? `${title.slice(0, MAX_LABEL_CHARS - 1)}…` : title;
}

function radiusFor(node: KnowledgeNode): number {
  return 2.5 + node.centrality * 4.5;
}

/**
 * Порядок узлов внутри дорожки: сначала ориентиры.
 * Именно они получают подписи, когда места мало.
 */
function priority(node: KnowledgeNode): number {
  const typeBoost = node.type === 'time' || node.type === 'hub' ? 0.35 : 0;
  return node.centrality + typeBoost + (node.time?.importance ?? 0) * 0.2;
}

export interface LayoutOptions {
  pxPerYear: number;
  /** Ключ дорожки для каждого узла */
  laneOf: (node: KnowledgeNode) => string;
  laneLabel: (key: string) => string;
  laneOrder: string[];
}

export function computeMapLayout(
  nodes: KnowledgeNode[],
  options: LayoutOptions
): MapLayout {
  const { pxPerYear, laneOf, laneLabel, laneOrder } = options;

  const grouped = new Map<string, KnowledgeNode[]>();
  for (const node of nodes) {
    if (!node.time) continue; // заметки вне времени на оси не размещаются
    const key = laneOf(node);
    const list = grouped.get(key);
    if (list) list.push(node);
    else grouped.set(key, [node]);
  }

  const orderedKeys = laneOrder.filter((key) => grouped.has(key));
  for (const key of grouped.keys()) {
    if (!orderedKeys.includes(key)) orderedKeys.push(key);
  }

  const laidOut: LaidOutNode[] = [];
  const lanes: Lane[] = [];
  // Верхняя полоса отдана подписям эпох, иначе они наезжают на названия дорожек
  let cursorY = EPOCH_STRIP_HEIGHT;

  for (const key of orderedKeys) {
    const laneNodes = [...(grouped.get(key) ?? [])].sort((a, b) => priority(b) - priority(a));

    // Правый край занятого места в каждой подстроке
    const rowEnds: number[] = [];
    const placements: Array<{ node: KnowledgeNode; row: number; labeled: boolean }> = [];

    for (const node of laneNodes) {
      const worldX = node.time!.displayYear * pxPerYear;
      const label = truncate(node.title);
      const width = radiusFor(node) + LABEL_GAP + label.length * CHAR_WIDTH;
      const left = worldX - radiusFor(node);

      let placedRow = -1;
      for (let row = 0; row < MAX_ROWS_PER_LANE; row++) {
        if (rowEnds[row] === undefined || rowEnds[row] < left) {
          rowEnds[row] = worldX + width;
          placedRow = row;
          break;
        }
      }

      if (placedRow >= 0) {
        placements.push({ node, row: placedRow, labeled: true });
      } else {
        // Места на подпись нет — узел остаётся точкой в первой строке.
        // Так видно реальную плотность, а не усечённый список.
        placements.push({ node, row: 0, labeled: false });
      }
    }

    const rows = Math.max(1, rowEnds.length);
    const laneHeight = LANE_HEADER + rows * ROW_HEIGHT + LANE_PADDING;

    lanes.push({ key, label: laneLabel(key), top: cursorY, height: laneHeight, rows });

    for (const { node, row, labeled } of placements) {
      const laidOutNode: LaidOutNode = {
        node,
        worldX: node.time!.displayYear * pxPerYear,
        y: cursorY + LANE_HEADER + row * ROW_HEIGHT + ROW_HEIGHT / 2,
        radius: radiusFor(node),
        labeled,
        label: truncate(node.title),
        labelWidth: truncate(node.title).length * CHAR_WIDTH,
        lane: key,
      };
      laidOut.push(laidOutNode);
    }

    cursorY += laneHeight;
  }

  return {
    nodes: laidOut,
    byId: new Map(laidOut.map((n) => [n.node.id, n])),
    lanes,
    contentHeight: cursorY + LANE_PADDING,
  };
}

/** Дорожки по типу заметки — предсказуемо и совпадает с онтологией хранилища */
export const laneByType: LayoutOptions['laneOf'] = (node) => node.type ?? 'note';
export const laneOrderByType = [...NOTE_TYPES_ORDERED];
export const laneLabelByType = (key: string) => noteTypeMeta(key).pluralLabel;

export function worldXToScreen(worldX: number, camera: Camera, viewportWidth: number): number {
  return viewportWidth / 2 + (worldX - camera.centerYear * camera.pxPerYear);
}

export function screenXToYear(screenX: number, camera: Camera, viewportWidth: number): number {
  return camera.centerYear + (screenX - viewportWidth / 2) / camera.pxPerYear;
}

export function yearToScreen(year: number, camera: Camera, viewportWidth: number): number {
  return worldXToScreen(year * camera.pxPerYear, camera, viewportWidth);
}
