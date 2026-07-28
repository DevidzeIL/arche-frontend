/**
 * Граф знаний: заметки как узлы, типизированные связи как рёбра.
 *
 * Ключевое решение — НАПРАВЛЕНИЕ РЁБЕР ЗАДАЁТ ВРЕМЯ, а не текст.
 * Описание связи пишется с точки зрения той заметки, где оно стоит
 * («влияние платонизма на мысль Августина» лежит в заметке Августина
 * и ссылается на Платона), поэтому доверять порядку записи нельзя.
 * Зато ось времени даёт причинность бесплатно и честно: раннее → позднее.
 */

import type { ArcheNote } from './types';
import { resolveNoteTime, type TimeSpanResolved } from './timeSpan';
import { relationsOf, RELATION_META, type RelationKind } from './relations';
import { normalizeTitle } from './normalize';

export interface KnowledgeNode {
  id: string;
  note: ArcheNote;
  title: string;
  type?: string;
  /** Датировка; null — заметка вне времени (например навигационный хаб) */
  time: TimeSpanResolved | null;
  /** Взвешенная степень: сумма весов связей */
  weightedDegree: number;
  /** Нормированная центральность 0..1 — насколько узел является ориентиром */
  centrality: number;
}

export interface KnowledgeEdge {
  id: string;
  /** Раньше по времени */
  sourceId: string;
  /** Позже по времени */
  targetId: string;
  kind: RelationKind;
  /** Описания связи из заметок — их может быть два, с обеих сторон */
  labels: string[];
  /** Направление неизвестно: одинаковый год или одна из заметок без даты */
  undirected: boolean;
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  nodeById: Map<string, KnowledgeNode>;
  edges: KnowledgeEdge[];
  /** Рёбра, идущие из узла вперёд во времени */
  forward: Map<string, KnowledgeEdge[]>;
  /** Рёбра, приходящие в узел из прошлого */
  backward: Map<string, KnowledgeEdge[]>;
  /** Все инцидентные рёбра */
  adjacent: Map<string, KnowledgeEdge[]>;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildKnowledgeGraph(notes: ArcheNote[]): KnowledgeGraph {
  const nodeById = new Map<string, KnowledgeNode>();
  const byTitle = new Map<string, KnowledgeNode>();

  for (const note of notes) {
    const dated = resolveNoteTime(note);
    const node: KnowledgeNode = {
      id: note.id,
      note,
      title: note.title,
      type: note.type,
      time: dated?.time ?? null,
      weightedDegree: 0,
      centrality: 0,
    };
    nodeById.set(node.id, node);
    byTitle.set(normalizeTitle(note.title), node);
  }

  // Связи двусторонние по правилам хранилища, поэтому одну и ту же пару
  // обычно объявляют обе заметки — склеиваем в одно ребро
  const merged = new Map<string, KnowledgeEdge>();

  for (const note of notes) {
    const from = nodeById.get(note.id);
    if (!from) continue;

    for (const relation of relationsOf(note)) {
      const to = byTitle.get(normalizeTitle(relation.targetTitle));
      if (!to || to.id === from.id) continue;

      const key = pairKey(from.id, to.id);
      const existing = merged.get(key);

      if (existing) {
        // Из двух описаний одной пары берём более содержательный тип связи
        if (RELATION_META[relation.kind].weight > RELATION_META[existing.kind].weight) {
          existing.kind = relation.kind;
        }
        if (relation.description && !existing.labels.includes(relation.description)) {
          existing.labels.push(relation.description);
        }
        continue;
      }

      // Направление берём по НАЧАЛУ интервала, а не по displayYear:
      // причинно важно, что появилось раньше. Концепция «Кризис субъекта»
      // начинается в 1850, поэтому Кафка (1883) — её следствие, а не причина,
      // хотя по середине интервала (1900) вышло бы наоборот.
      const fromYear = from.time?.startYear;
      const toYear = to.time?.startYear;
      const undirected = fromYear === undefined || toYear === undefined || fromYear === toYear;
      // Раньше по времени становится источником — это и есть «из чего возникло»
      const forward = undirected || (fromYear as number) < (toYear as number);

      merged.set(key, {
        id: key,
        sourceId: forward ? from.id : to.id,
        targetId: forward ? to.id : from.id,
        kind: relation.kind,
        labels: relation.description ? [relation.description] : [],
        undirected,
      });
    }
  }

  const edges = [...merged.values()];
  const forward = new Map<string, KnowledgeEdge[]>();
  const backward = new Map<string, KnowledgeEdge[]>();
  const adjacent = new Map<string, KnowledgeEdge[]>();

  for (const edge of edges) {
    push(forward, edge.sourceId, edge);
    push(backward, edge.targetId, edge);
    push(adjacent, edge.sourceId, edge);
    push(adjacent, edge.targetId, edge);

    const weight = RELATION_META[edge.kind].weight;
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (source) source.weightedDegree += weight;
    if (target) target.weightedDegree += weight;
  }

  // Нормируем центральность. Навигационные связи имеют малый вес,
  // поэтому хаб с полусотней ссылок не забивает собой всю карту.
  const maxDegree = Math.max(1, ...[...nodeById.values()].map((n) => n.weightedDegree));
  for (const node of nodeById.values()) {
    node.centrality = node.weightedDegree / maxDegree;
  }

  return {
    nodes: [...nodeById.values()],
    nodeById,
    edges,
    forward,
    backward,
    adjacent,
  };
}

export interface TraceStep {
  edge: KnowledgeEdge;
  /** Узел на дальнем конце ребра относительно исходного */
  nodeId: string;
  depth: number;
}

export interface Genealogy {
  /** Что привело к узлу — вглубь прошлого */
  ancestors: TraceStep[];
  /** Что выросло из узла — вперёд во времени */
  descendants: TraceStep[];
  /** Связанное тем же годом либо без определённого направления */
  contemporaries: TraceStep[];
  /** Все id, задействованные в трассировке, включая исходный */
  involved: Set<string>;
}

/**
 * Родословная узла: откуда он взялся и во что вырос.
 * Идём только по смысловым связям — авторство, эпоха и навигация
 * причинность не выражают и цепочку бы засоряли.
 */
export function traceGenealogy(
  graph: KnowledgeGraph,
  rootId: string,
  maxDepth = 3
): Genealogy {
  const ancestors: TraceStep[] = [];
  const descendants: TraceStep[] = [];
  const contemporaries: TraceStep[] = [];
  const involved = new Set<string>([rootId]);

  const walk = (
    direction: 'backward' | 'forward',
    collect: TraceStep[]
  ): void => {
    const seen = new Set<string>([rootId]);
    let frontier: string[] = [rootId];

    for (let depth = 1; depth <= maxDepth; depth++) {
      const next: string[] = [];

      for (const currentId of frontier) {
        const edges = graph[direction].get(currentId) ?? [];

        for (const edge of edges) {
          if (!RELATION_META[edge.kind].genealogical) continue;

          const otherId = direction === 'backward' ? edge.sourceId : edge.targetId;
          if (seen.has(otherId)) continue;

          if (edge.undirected) {
            // Направление неизвестно — это современники, а не предки
            if (!contemporaries.some((s) => s.nodeId === otherId)) {
              contemporaries.push({ edge, nodeId: otherId, depth });
              involved.add(otherId);
            }
            continue;
          }

          seen.add(otherId);
          involved.add(otherId);
          collect.push({ edge, nodeId: otherId, depth });
          next.push(otherId);
        }
      }

      if (next.length === 0) break;
      frontier = next;
    }
  };

  walk('backward', ancestors);
  walk('forward', descendants);

  return { ancestors, descendants, contemporaries, involved };
}

export interface PathResult {
  nodeIds: string[];
  edges: KnowledgeEdge[];
}

/**
 * Осмысленная цепочка между двумя заметками — ответ на вопрос
 * «как вообще связаны Кафка и Платон».
 *
 * Это НЕ обычный поиск в ширину: кратчайший путь всегда проскакивал бы
 * через навигационный хаб, который связан со всем сразу, и выдавал
 * бессодержательное «Платон — контекст вектора — Кафка».
 * Поэтому ищем путь минимальной стоимости, где цена ребра обратна
 * его смысловому весу: «порождает» стоит 1, «контекст» — почти 7.
 */
export function findPath(
  graph: KnowledgeGraph,
  fromId: string,
  toId: string
): PathResult | null {
  if (fromId === toId) return { nodeIds: [fromId], edges: [] };

  const cost = new Map<string, number>([[fromId, 0]]);
  const cameFrom = new Map<string, { prevId: string; edge: KnowledgeEdge }>();
  const settled = new Set<string>();

  while (settled.size < graph.nodes.length) {
    // Граф небольшой и разреженный, поэтому обходимся выбором минимума
    // линейным перебором вместо кучи
    let currentId: string | null = null;
    let currentCost = Infinity;
    for (const [id, value] of cost) {
      if (!settled.has(id) && value < currentCost) {
        currentId = id;
        currentCost = value;
      }
    }

    if (currentId === null) break;
    if (currentId === toId) break;
    settled.add(currentId);

    for (const edge of graph.adjacent.get(currentId) ?? []) {
      const otherId = edge.sourceId === currentId ? edge.targetId : edge.sourceId;
      if (settled.has(otherId)) continue;

      const stepCost = 1 / RELATION_META[edge.kind].weight;
      const candidate = currentCost + stepCost;

      if (candidate < (cost.get(otherId) ?? Infinity)) {
        cost.set(otherId, candidate);
        cameFrom.set(otherId, { prevId: currentId, edge });
      }
    }
  }

  if (!cameFrom.has(toId)) return null;

  const nodeIds = [toId];
  const edges: KnowledgeEdge[] = [];
  let cursor = toId;

  while (cursor !== fromId) {
    const step = cameFrom.get(cursor);
    if (!step) return null;
    edges.unshift(step.edge);
    nodeIds.unshift(step.prevId);
    cursor = step.prevId;
  }

  return { nodeIds, edges };
}

/** Связи узла, сгруппированные по типу — для панели «Почему» */
export function groupRelations(
  graph: KnowledgeGraph,
  nodeId: string
): Array<{ kind: RelationKind; edges: KnowledgeEdge[] }> {
  const byKind = new Map<RelationKind, KnowledgeEdge[]>();

  for (const edge of graph.adjacent.get(nodeId) ?? []) {
    push(byKind as unknown as Map<string, KnowledgeEdge[]>, edge.kind, edge);
  }

  return [...byKind.entries()]
    .sort((a, b) => RELATION_META[b[0]].weight - RELATION_META[a[0]].weight)
    .map(([kind, edges]) => ({ kind, edges }));
}
